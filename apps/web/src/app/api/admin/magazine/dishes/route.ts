// ════════════════════════════════════════════════════════════
// Блюда ресторана: список, импорт CSV, точечное редактирование.
// GET    ?restaurantId=…            — меню ресторана
// GET    ?restaurantId=…&template=1 — CSV-шаблон для отправки ресторану
// POST   { restaurantId, csv }      — импорт заполненного файла (превью/сохранение)
// PATCH  { id, ...поля }            — правка блюда (фото, видео, порядок, активность)
// DELETE ?id=…                      — убрать блюдо
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { buildTemplate, parseDishCsv } from '@/lib/magazine/dishCsv';
import { prismaErrorCode } from '@/lib/safeError';
import { LIST_LIMIT } from '@/lib/api/listLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get('restaurantId');
  if (!restaurantId) return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });

  if (url.searchParams.get('template')) {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    const fileName = `menu-${restaurant.slug ?? restaurant.id}.csv`;
    return new NextResponse(buildTemplate(restaurant.name), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  }

  const dishes = await prisma.dish.findMany({
    where: { restaurantId },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    take: LIST_LIMIT,
  });
  return NextResponse.json(dishes);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const body = await req.json().catch(() => null);
    
    // Автоматический резолв ресторана, если restaurantId не передан
    let restaurantId = body?.restaurantId;
    if (!restaurantId) {
      let defaultResto = await prisma.restaurant.findFirst({
        where: { isMagazinePartner: true },
        select: { id: true },
      });
      if (!defaultResto) {
        defaultResto = await prisma.restaurant.create({
          data: { name: 'Fresh Weekly', slug: 'fresh', city: 'samarkand', tier: 'premium', isMagazinePartner: true, isPartner: true },
          select: { id: true },
        });
      }
      restaurantId = defaultResto.id;
    }

    // Быстрое создание одного блюда (без CSV) — для потока «загрузил видео → получил QR»
    if (!body?.csv) {
      const nameRu = body?.nameRu?.trim() || 'Блюдо с видео';
      const existing = await prisma.dish.findMany({
        where: { restaurantId },
        select: { code: true },
      });
      let nextCode = existing.reduce((max, d) => Math.max(max, d.code), 0) + 1;

      let dish;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          dish = await prisma.dish.create({
            data: {
              restaurantId,
              nameRu,
              nameUz: body?.nameUz || null,
              code: nextCode,
              videoUrl: body?.videoUrl || null,
              videoPoster: body?.videoPoster || null,
              isActive: true,
              sortOrder: nextCode,
            },
            include: { restaurant: true },
          });
          break;
        } catch (e: unknown) {
          if (prismaErrorCode(e) === 'P2002') {
            nextCode++;
          } else {
            throw e;
          }
        }
      }

      if (!dish) {
        return NextResponse.json({ error: 'Не удалось сгенерировать уникальный код блюда' }, { status: 500 });
      }

      return NextResponse.json(dish);
    }

    if (typeof body.csv !== 'string') {
      return NextResponse.json({ error: 'csv or nameRu required' }, { status: 400 });
    }

    const { dishes, issues } = parseDishCsv(body.csv);
    if (body.dryRun) return NextResponse.json({ dishes, issues, saved: 0 });
    if (!dishes.length) return NextResponse.json({ dishes, issues, saved: 0 }, { status: 400 });

    const existing = await prisma.dish.findMany({
      where: { restaurantId },
      select: { id: true, code: true, nameRu: true, photo: true },
    });
    const byName = new Map(existing.map((d) => [d.nameRu.toLowerCase(), d]));
    let nextCode = existing.reduce((max, d) => Math.max(max, d.code), 0) + 1;

    let saved = 0;
    for (const [i, d] of dishes.entries()) {
      const prev = byName.get(d.nameRu.toLowerCase());
      const data = {
        nameRu: d.nameRu,
        nameUz: d.nameUz,
        descriptionRu: d.descriptionRu,
        descriptionUz: d.descriptionUz,
        price: d.price,
        category: d.category,
        pairsWith: d.pairsWith,
        sortOrder: i,
        isActive: true,
      };
      if (prev) {
        await prisma.dish.update({ where: { id: prev.id }, data });
      } else {
        await prisma.dish.create({
          data: { ...data, restaurantId, code: nextCode++ },
        });
      }
      saved++;
    }

    return NextResponse.json({ dishes, issues, saved });
  } catch (error: unknown) {
    console.error('Error in dishes POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const body = await req.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { id, ...rest } = body;
    const allowed = ['nameRu', 'nameUz', 'descriptionRu', 'descriptionUz', 'price', 'category', 'pairsWith', 'photo', 'videoUrl', 'videoPoster', 'sortOrder', 'isActive'];
    const data = Object.fromEntries(Object.entries(rest).filter(([k]) => allowed.includes(k)));
    const dish = await prisma.dish.update({ where: { id }, data });
    return NextResponse.json(dish);
  } catch (error: unknown) {
    console.error('Error in dishes PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await prisma.dish.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('Error in dishes DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
