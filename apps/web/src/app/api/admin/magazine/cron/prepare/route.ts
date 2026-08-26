import { NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { defaultSharedSpec, defaultPersonalSpec } from '@/lib/magazine/defaults';

export const dynamic = 'force-dynamic';

async function getNextIssueNumber() {
  const max = await prisma.magazineEdition.aggregate({ _max: { weekNumber: true } });
  return (max._max.weekNumber || 0) + 1;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  try {
    const weekNumber = await getNextIssueNumber();

    // 1. Ищем или создаём выпуск недели (общий 50%) со СТАРТОВЫМ контентом
    let edition = await prisma.magazineEdition.findUnique({ where: { weekNumber } });
    if (!edition) {
      edition = await prisma.magazineEdition.create({
        data: {
          weekNumber,
          title: `FRESH WEEKLY #${weekNumber}`,
          coverTheme: 'Автоматический выпуск',
          isPublished: false,
          sharedSpec: defaultSharedSpec(weekNumber) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // 2. Только рестораны-партнёры журнала
    const restaurants = await prisma.restaurant.findMany({ where: { isMagazinePartner: true } });

    // 3. Идемпотентно создаём персональные черновики со стартовым контентом.
    //
    // ДВА ЗАПРОСА ВМЕСТО ДВУХ НА КАЖДЫЙ РЕСТОРАН. Здесь стоял цикл, и в нём
    // по `findUnique` и `create` на партнёра: при ста заведениях — двести
    // походов в базу за один запуск крона, и все последовательные. Своей
    // очереди у крона нет, поэтому такой прогон просто держит соединение,
    // пока не свалится по таймауту.
    //
    // `createMany` со `skipDuplicates` не подошёл бы вслепую: уникальность
    // здесь составная (`editionId_restaurantId`), и молчаливый пропуск
    // спрятал бы расхождение между числом партнёров и числом черновиков.
    // Поэтому сначала спрашиваем, что уже есть, — одним запросом.
    const existing = await prisma.restaurantIssue.findMany({
      where: {
        editionId: edition.id,
        restaurantId: { in: restaurants.map((r) => r.id) },
      },
      select: { restaurantId: true },
    });
    const done = new Set(existing.map((e) => e.restaurantId));

    const fresh = restaurants
      .filter((r) => !done.has(r.id))
      .map((restaurant) => ({
        editionId: edition!.id,
        restaurantId: restaurant.id,
        status: 'draft',
        webSlug: `${restaurant.slug || restaurant.id}-w${weekNumber}`,
        spec: defaultPersonalSpec(restaurant.name) as unknown as Prisma.InputJsonValue,
      }));

    const { count: createdCount } = fresh.length
      ? await prisma.restaurantIssue.createMany({ data: fresh })
      : { count: 0 };

    return NextResponse.json({ success: true, edition: edition.weekNumber, createdIssues: createdCount });
  } catch (e: unknown) {
    console.error('[/api/admin/magazine/cron/prepare] POST:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
