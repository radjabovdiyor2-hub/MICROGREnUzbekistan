import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
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
          sharedSpec: defaultSharedSpec(weekNumber) as any,
        },
      });
    }

    // 2. Только рестораны-партнёры журнала
    const restaurants = await prisma.restaurant.findMany({ where: { isMagazinePartner: true } });

    // 3. Идемпотентно создаём персональные черновики со стартовым контентом
    let createdCount = 0;
    for (const restaurant of restaurants) {
      const existing = await prisma.restaurantIssue.findUnique({
        where: { editionId_restaurantId: { editionId: edition.id, restaurantId: restaurant.id } },
      });
      if (!existing) {
        await prisma.restaurantIssue.create({
          data: {
            editionId: edition.id,
            restaurantId: restaurant.id,
            status: 'draft',
            webSlug: `${restaurant.slug || restaurant.id}-w${weekNumber}`,
            spec: defaultPersonalSpec(restaurant.name) as any,
          },
        });
        createdCount++;
      }
    }

    return NextResponse.json({ success: true, edition: edition.weekNumber, createdIssues: createdCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
