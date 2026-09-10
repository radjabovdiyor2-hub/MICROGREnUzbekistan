import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { formatLocalDate, localDayRange, startOfLocalDay } from '@/lib/localDate';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// Закрыть смены, которые человек забыл закрыть.
//
// ЗОВЁТ СТОРОЖ ОФИСА вечером — у витрины своего планировщика нет, а у
// ботов он есть и уже ходит сюда за итогами дня.
//
// ЗАКРЫВАЕМ ПО ПОСЛЕДНЕЙ ТОЧКЕ ТРЕКА, а не полуночью — решение владельца.
// Полночь приписала бы человеку лишние часы; последняя крошка — момент,
// когда он последний раз двигался, и она ближе к правде, чем любое
// круглое число.
//
// НЕТ НИ ОДНОЙ КРОШКИ — нулевая длительность. Смена открыта, а
// доказательств работы нет: ставить восемь часов «по умолчанию» значит
// платить за них. Владелец увидит нулевую смену и спросит.
//
// `closedAuto` ставится ВСЕГДА при таком закрытии: время, поставленное
// автоматом, — повод спросить, а не установленный факт.
//
// ТОЛЬКО ПРОШЛЫЕ ДНИ. Сегодняшняя открытая смена — это человек на работе,
// а не забывчивость.
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

/** За раз закрываем не больше: проход вечерний и повторяется каждый день. */
const BATCH = 200;

export async function POST(request: NextRequest) {
  try {
    if (!requireBotAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = startOfLocalDay(new Date());

    const open = await prisma.shift.findMany({
      where: { type: 'work', startTime: { not: null }, endTime: null, date: { lt: today } },
      select: { id: true, employeeId: true, date: true, startTime: true },
      take: BATCH,
    });

    const closed: { id: string; minutes: number; hadTrack: boolean }[] = [];

    for (const shift of open) {
      if (shift.startTime === null) continue;
      // Ищем последнюю крошку В ПРЕДЕЛАХ ТОГО ЖЕ ДНЯ: точка со следующего
      // утра закрыла бы вчерашнюю смену завтрашним временем.
      //
      // ДЕНЬ БЕРЁМ ИЗ `startTime`, А НЕ ИЗ `date`. Колонка дня хранится
      // типом `Date` и читается полуночью по UTC — у нас это пять утра по
      // Ташкенту. Считая окно от неё, я промахивался на пять часов: живая
      // проверка показала «смена без трека» при честной крошке в 17:42.
      // `startTime` — полноценная отметка времени, и двусмысленности в ней
      // нет вовсе.
      const { end: dayEnd } = localDayRange(formatLocalDate(shift.startTime));

      const last = await prisma.trackPing.findFirst({
        where: { employeeId: shift.employeeId, at: { gte: shift.startTime, lt: dayEnd } },
        select: { at: true },
        orderBy: { at: 'desc' },
      });

      const endedAt = last?.at ?? shift.startTime;
      await prisma.shift.update({
        where: { id: shift.id },
        data: { endTime: endedAt, closedAuto: true },
      });
      closed.push({
        id: shift.id,
        minutes: Math.round((endedAt.getTime() - shift.startTime.getTime()) / 60_000),
        hadTrack: last !== null,
      });
    }

    return NextResponse.json({ status: 'ok', closed: closed.length, shifts: closed });
  } catch (error: unknown) {
    console.error('API Shifts Close-Forgotten POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
