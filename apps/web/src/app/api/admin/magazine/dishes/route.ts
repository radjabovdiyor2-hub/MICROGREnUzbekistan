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
  });
  return NextResponse.json(dishes);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body?.restaurantId) {
    return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
  }

  // Быстрое создание одного блюда (без CSV) — для потока «загрузил видео → получил QR»
  if (!body.csv) {
    const nameRu = body.nameRu?.trim() || 'Блюдо с видео';
    const existing = await prisma.dish.findMany({
      where: { restaurantId: body.restaurantId },
      select: { code: true },
    });
    const nextCode = existing.reduce((max, d) => Math.max(max, d.code), 0) + 1;
    const dish = await prisma.dish.create({
      data: {
        restaurantId: body.restaurantId,
        nameRu,
        nameUz: body.nameUz || null,
        code: nextCode,
        videoUrl: body.videoUrl || null,
        videoPoster: body.videoPoster || null,
        isActive: true,
        sortOrder: nextCode,
      },
    });
    return NextResponse.json(dish);
  }

  if (typeof body.csv !== 'string') {
    return NextResponse.json({ error: 'csv or nameRu required' }, { status: 400 });
  }

  const { dishes, issues } = parseDishCsv(body.csv);
  if (body.dryRun) return NextResponse.json({ dishes, issues, saved: 0 });
  if (!dishes.length) return NextResponse.json({ dishes, issues, saved: 0 }, { status: 400 });

  const existing = await prisma.dish.findMany({
    where: { restaurantId: body.restaurantId },
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
      // Повторный импорт не должен стирать уже загруженное фото:
      // в CSV лежит только имя файла, а сам файл грузится отдельно.
      await prisma.dish.update({ where: { id: prev.id }, data });
    } else {
      await prisma.dish.create({
        data: { ...data, restaurantId: body.restaurantId, code: nextCode++ },
      });
    }
    saved++;
  }

  return NextResponse.json({ dishes, issues, saved });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { id, ...rest } = body;
  const allowed = ['nameRu', 'nameUz', 'descriptionRu', 'descriptionUz', 'price', 'category', 'pairsWith', 'photo', 'videoUrl', 'videoPoster', 'sortOrder', 'isActive'];
  const data = Object.fromEntries(Object.entries(rest).filter(([k]) => allowed.includes(k)));
  const dish = await prisma.dish.update({ where: { id }, data });
  return NextResponse.json(dish);
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await prisma.dish.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
