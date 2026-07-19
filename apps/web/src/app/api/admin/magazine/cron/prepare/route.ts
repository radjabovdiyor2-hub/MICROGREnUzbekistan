import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

function getNextWeekNumber() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((d.getDay() + 1 + days) / 7);
}

export async function POST(req: NextRequest) {
  // Авторизация по bot secret (Cron)
  const authHeader = req.headers.get('x-bot-secret');
  if (authHeader !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized cron' }, { status: 401 });
  }

  try {
    const weekNumber = getNextWeekNumber();
    
    // 1. Ищем или создаем выпуск недели
    let edition = await prisma.magazineEdition.findUnique({
      where: { weekNumber }
    });

    if (!edition) {
      edition = await prisma.magazineEdition.create({
        data: {
          weekNumber,
          title: `FRESH WEEKLY #${weekNumber}`,
          coverTheme: 'Автоматический выпуск',
          isPublished: false,
          sharedSpec: {
            blocks: [
              { type: 'hero', content: `Приветствуем в свежем номере ${weekNumber}!` }
            ]
          }
        }
      });
    }

    // 2. Получаем все рестораны
    const restaurants = await prisma.restaurant.findMany();

    // 3. Создаем черновики (RestaurantIssue) для всех
    let createdCount = 0;
    for (const restaurant of restaurants) {
      const existing = await prisma.restaurantIssue.findUnique({
        where: { editionId_restaurantId: { editionId: edition.id, restaurantId: restaurant.id } }
      });

      if (!existing) {
        await prisma.restaurantIssue.create({
          data: {
            editionId: edition.id,
            restaurantId: restaurant.id,
            status: 'draft',
            webSlug: `${restaurant.slug || restaurant.id}-w${weekNumber}`,
            spec: { blocks: [] }
          }
        });
        createdCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      edition: edition.weekNumber, 
      createdIssues: createdCount 
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
