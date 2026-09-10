import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { getSession } from '@/lib/adminAuth';
import { localDayRange } from '@/lib/localDate';
import { safeError } from '@/lib/safeError';
import { SILENT_MIN } from '@/lib/tracking/ping';

// ══════════════════════════════════════════════════════════════════════
// Кто сейчас в поле и где.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ ОТЧЁТА ДНЯ. Отчёт отвечает на вопрос «как прошёл
// вторник» — его открывают вечером и по одному человеку. Здесь вопрос
// другой и задаётся посреди дня: «где сейчас все». Это разные экраны и
// разная частота: отчёт читают раз, живую карту обновляют минутами.
//
// ТОЛЬКО ВЛАДЕЛЬЦУ. Видеть, где сейчас коллега, продавцу незачем: это
// слежка сотрудников друг за другом, а не работа. Отчёт дня продавец
// открывает про себя — там рубеж мягче.
//
// ЧТО ОТДАЁМ. Трек с начала смены и последнюю точку. Трек нужен, чтобы
// «стоит сорок минут» отличалось от «только что приехал»: одна точка на
// карте этого не говорит.
// ══════════════════════════════════════════════════════════════════════

/** Точек на человека. Больше на экране всё равно не разобрать. */
const MAX_POINTS = 400;

export async function GET(request: NextRequest) {
  try {
    // Рубеж здесь, а не в middleware: там правило стоит на префиксе
    // `/api/admin/tracking` как STAFF ради приёма крошек от продавца.
    if (getSession(request)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Только владельцу' }, { status: 403 });
    }

    const { start, end } = localDayRange();

    const days = await prisma.fieldDay.findMany({
      where: { date: start },
      select: {
        employeeId: true,
        startedAt: true,
        endedAt: true,
        meters: true,
        stops: true,
        employee: { select: { id: true, name: true } },
      },
    });

    if (days.length === 0) {
      return NextResponse.json({ status: 'ok', people: [], at: Date.now() });
    }

    const people = await Promise.all(
      days.map(async (day) => {
        const track = await prisma.trackPing.findMany({
          where: { employeeId: day.employeeId, at: { gte: start, lt: end } },
          select: { at: true, latitude: true, longitude: true, accuracyM: true },
          orderBy: { at: 'asc' },
          take: MAX_POINTS,
        });

        const last = track[track.length - 1] ?? null;

        return {
          id: day.employee.id,
          name: day.employee.name,
          startedAt: day.startedAt,
          meters: day.meters,
          stops: day.stops,
          track,
          last,
          // Сколько минут молчит. По этому числу владелец и понимает,
          // живая это точка или «здесь он был час назад»: показывать
          // старую позицию как текущую значит врать картой.
          silentMin:
            last === null ? null : Math.round((Date.now() - last.at.getTime()) / 60_000),
        };
      }),
    );

    // Кто дольше молчит — выше: именно он и есть повод спросить.
    people.sort((a, b) => (b.silentMin ?? 0) - (a.silentMin ?? 0));

    // `silentAfterMin` — с какой минуты молчание перестаёт быть моргнувшей
    // сетью. Отдаём вместе с людьми, чтобы бот не держал своей копии числа:
    // сводка в Telegram и подпись на карте должны звать «молчит» одного и
    // того же человека.
    return NextResponse.json({ status: 'ok', people, silentAfterMin: SILENT_MIN, at: Date.now() });
  } catch (error: unknown) {
    console.error('API Admin Tracking Live GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
