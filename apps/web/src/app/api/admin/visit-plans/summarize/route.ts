import { NextRequest, NextResponse } from 'next/server';

import { requireBotAuth } from '@/lib/botAuth';
import { formatLocalDate } from '@/lib/localDate';
import { summarizeDay } from '@/lib/customers/planOutcome';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// Подвести итоги дня и положить сигналы владельцу.
//
// ЗОВЁТ СТОРОЖ ОФИСА, а не браузер: у витрины своего планировщика нет, а у
// ботов он есть и уже ходит сюда за сводкой молчания. Заводить ради одной
// задачи ещё один механизм расписаний незачем.
//
// ВНУТРИ ДНЯ ИТОГ НЕ ПОДВОДИТСЯ. Половина точек в четыре часа — обычный
// рабочий день, а не срыв. Поэтому проход зовут вечером, и он же сам
// защищён от повтора: сигнал пишется раз на пару «день + человек».
// ══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    if (!requireBotAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const raw = typeof body?.date === 'string' ? body.date : '';
    const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : formatLocalDate();

    const written = await summarizeDay(day);
    return NextResponse.json({ status: 'ok', day, written });
  } catch (error: unknown) {
    console.error('API Admin Visit Plans Summarize POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
