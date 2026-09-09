import { prisma } from '@repo/database';

import { localDayRange } from '@/lib/localDate';
import { getNumber } from '@/lib/settings/store';

import type { TrackPingInput } from './ping';
import { detectLegs, detectStays, type CustomerPin, type DerivedStay } from './stays';

// ══════════════════════════════════════════════════════════════════════
// Пересборка дня: трек → стоянки → плечи.
//
// Отдельным проходом, а не на каждой крошке: трансляция шлёт точку раз в
// минуту, и гонять по ней всю геометрию дня — это работа впустую. Проход
// зовут, когда день собираются ПОКАЗАТЬ, и при закрытии смены.
//
// ИДЕМПОТЕНТЕН. Повторный запуск даёт тот же результат: выведенные стоянки
// пересобираются с нуля. Иначе к вечеру в дне лежали бы три копии одного
// заезда, и «был у семи клиентов» превратилось бы в двадцать один.
// ══════════════════════════════════════════════════════════════════════

/**
 * Отмеченные человеком стоянки НЕ ТРОГАЕМ.
 *
 * `manual` — это «я на точке», нажатое пальцем. Наш вывод по крошкам
 * слабее: телефон мог лежать в машине у соседнего дома. Затирать
 * подтверждённое выведенным — значит понизить достоверность записи, ничего
 * не сказав; такие подмены и разрушают доверие к признаку.
 */
async function loadManualStays(employeeId: string, start: Date, end: Date) {
  const day = await prisma.fieldDay.findUnique({
    where: { employeeId_date: { employeeId, date: start } },
    select: { id: true },
  });
  if (!day) return { fieldDayId: null, manual: [] };

  const manual = await prisma.trackStay.findMany({
    where: {
      fieldDayId: day.id,
      confirmedBy: 'manual',
      arrivedAt: { gte: start, lt: end },
    },
    select: { id: true, customerId: true, arrivedAt: true, leftAt: true },
    orderBy: { arrivedAt: 'asc' },
  });
  return { fieldDayId: day.id, manual };
}

/** Пересекается ли выведенная стоянка с уже подтверждённой у того же клиента. */
function overlapsManual(
  stay: DerivedStay,
  manual: { customerId: number; arrivedAt: Date; leftAt: Date | null }[],
): boolean {
  return manual.some((m) => {
    if (m.customerId !== stay.customerId) return false;
    const mEnd = (m.leftAt ?? m.arrivedAt).getTime();
    return stay.arrivedAt.getTime() <= mEnd && m.arrivedAt.getTime() <= stay.leftAt.getTime();
  });
}

export interface RebuiltDay {
  stays: number;
  legs: number;
}

/**
 * Пересобрать стоянки и плечи одного дня одного сотрудника.
 *
 * Возвращает, сколько получилось. Если дня нет (трека не было) — нули.
 */
export async function rebuildDay(employeeId: string, day: string): Promise<RebuiltDay> {
  const { start, end } = localDayRange(day);

  const { fieldDayId, manual } = await loadManualStays(employeeId, start, end);
  if (fieldDayId === null) return { stays: 0, legs: 0 };

  const rows = await prisma.trackPing.findMany({
    where: { employeeId, at: { gte: start, lt: end } },
    select: { at: true, latitude: true, longitude: true, accuracyM: true, source: true },
    orderBy: { at: 'asc' },
  });
  if (rows.length === 0) return { stays: manual.length, legs: 0 };

  const track: TrackPingInput[] = rows.map((r) => ({
    at: r.at,
    latitude: r.latitude,
    longitude: r.longitude,
    accuracyM: r.accuracyM,
    source: r.source as TrackPingInput['source'],
    speedMps: null,
    headingDeg: null,
  }));

  // Пины берём ВСЕ, а не «рядом с треком»: заведений несколько тысяч, это
  // один findMany без join (см. комментарий к координатам в `Customer`), а
  // предварительный отбор по рамке — лишний шаг, который однажды отрежет
  // клиента на краю и спрячет визит к нему.
  const pins: CustomerPin[] = (
    await prisma.customer.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: { id: true, latitude: true, longitude: true },
    })
  ).map((c) => ({ id: c.id, latitude: c.latitude as number, longitude: c.longitude as number }));

  const [radiusM, minStayMin] = await Promise.all([
    getNumber('field.stayRadiusM'),
    getNumber('field.minStayMin'),
  ]);

  const derived = detectStays(track, pins, radiusM, minStayMin * 60_000)
    .filter((s) => !overlapsManual(s, manual));

  // Плечи считаются по ВСЕМ стоянкам дня — и подтверждённым, и выведенным:
  // дорога между ними существует независимо от того, чем стоянка
  // подтверждена.
  await prisma.$transaction([
    // Плечи удаляем первыми: они ссылаются на стоянки, которых сейчас не
    // станет, и обратный порядок оставил бы висячие ссылки.
    prisma.routeLeg.deleteMany({ where: { fieldDayId } }),
    prisma.trackStay.deleteMany({ where: { fieldDayId, confirmedBy: 'derived' } }),
    prisma.trackStay.createMany({
      data: derived.map((s) => ({
        fieldDayId,
        customerId: s.customerId,
        arrivedAt: s.arrivedAt,
        leftAt: s.leftAt,
        dwellSec: s.dwellSec,
        confirmedBy: 'derived',
      })),
    }),
  ]);

  const all = await prisma.trackStay.findMany({
    where: { fieldDayId },
    select: { id: true, customerId: true, arrivedAt: true, leftAt: true, dwellSec: true },
    orderBy: { arrivedAt: 'asc' },
  });

  const legs = detectLegs(
    all.map((s) => ({
      customerId: s.customerId,
      arrivedAt: s.arrivedAt,
      // У стоянки без отметки отъезда конца нет; для плеча берём приезд —
      // тогда «ехал» посчитается от последнего момента, когда мы точно
      // знали, где человек, и не припишет ему лишних минут дороги.
      leftAt: s.leftAt ?? s.arrivedAt,
      dwellSec: s.dwellSec ?? 0,
      silentSec: 0,
      pings: 0,
    })),
  );

  if (legs.length > 0) {
    await prisma.routeLeg.createMany({
      data: legs.map((leg) => ({
        fieldDayId,
        fromStayId: all[leg.fromIndex].id,
        toStayId: all[leg.toIndex].id,
        departedAt: leg.departedAt,
        arrivedAt: leg.arrivedAt,
        actualSec: leg.actualSec,
        // Метры плеча и эталон проставляет сверка с маршрутизатором:
        // здесь известен только костяк. Ноль в метрах — честное «ещё не
        // считали», а не «нисколько не проехал».
        actualMeters: 0,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.fieldDay.update({ where: { id: fieldDayId }, data: { stops: all.length } });

  return { stays: all.length, legs: legs.length };
}
