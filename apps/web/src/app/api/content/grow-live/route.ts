import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';

import { growView } from '@/lib/grow/lifecycle';

// ══════════════════════════════════════════════════════════════════════
// «Ваш лоток прямо сейчас» — состояние живой партии для страницы товара.
//
// Цифровой двойник лотка написан и покрыт тестами (`lib/grow/lifecycle.ts`)
// и не показывался НИКОМУ: ферма ведёт каждую партию по датам, а человек,
// который эту зелень ждёт, видел обычную карточку товара.
//
// ЧТО ОТДАЁМ И ЧЕГО НЕ ОТДАЁМ. Наружу уходит только то, что касается самого
// растения: фаза, день роста, доля пути и день готовности. Количество
// лотков, себестоимость и плановый выход остаются внутри — это цифры
// производства, а не обещание покупателю.
//
// Группа `content` выбрана намеренно, а не новая: перед созданием роута
// полагается прочитать существующие 29 групп, и публичный контент витрины
// живёт здесь же (`recipe-of-day`).
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

/** Дата партии в «YYYY-MM-DD» — так её понимает `growView`. */
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get('productId');
  if (!productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 });
  }

  try {
    // Ближайшая к готовности живая партия: у товара их может быть
    // несколько с разным посевом, и человеку интересна та, что придёт
    // раньше. Срезанные и списанные не показываем — они уже не растут.
    const batch = await prisma.growBatch.findFirst({
      where: {
        productId,
        status: { notIn: ['harvested', 'expired'] },
      },
      orderBy: { seedDate: 'asc' },
      select: {
        cropType: true,
        seedDate: true,
        darkDays: true,
        lightDays: true,
        shelfDays: true,
      },
    });

    if (!batch) return NextResponse.json({ batch: null });

    const view = growView({
      seedDate: ymd(batch.seedDate),
      darkDays: batch.darkDays,
      lightDays: batch.lightDays,
      shelfDays: batch.shelfDays,
    });

    return NextResponse.json({
      batch: {
        cropType: batch.cropType,
        phase: view.phase,
        day: view.day,
        totalDays: view.totalDays,
        percent: view.percent,
        readyDate: view.readyDate,
        daysToNext: view.daysToNext,
      },
    });
  } catch (error) {
    // База недоступна — карточка товара обязана открыться и без фермы.
    console.error('grow-live failed:', error);
    return NextResponse.json({ batch: null });
  }
}
