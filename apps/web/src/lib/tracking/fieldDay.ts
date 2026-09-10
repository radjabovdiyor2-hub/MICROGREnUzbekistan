import { prisma } from '@repo/database';

import { localDayRange } from '@/lib/localDate';

import { groupByLocalDay, summarize, type TrackPingInput } from './ping';
import { purgeOldPings } from './retention';

// ══════════════════════════════════════════════════════════════════════
// Запись трека и пересчёт дня.
//
// Разбор тела запроса и вся арифметика живут в `ping.ts` — там нет ни
// Prisma, ни времени, и потому их можно проверить тестами. Здесь только
// то, что без базы не проверить: кто это, куда положить, что пересчитать.
// ══════════════════════════════════════════════════════════════════════

/**
 * Сотрудник, которому принадлежит трек.
 *
 * ДВЕ ДВЕРИ И ДВА СПОСОБА УЗНАТЬ ЧЕЛОВЕКА. Telegram называет себя
 * `telegramId` — колонка уникальная, промаха быть не может. PWA приносит
 * сессию, а в ней из опознавательного только имя: `employeeId` сессия не
 * несёт (см. `lib/session.ts`).
 *
 * ПОЭТОМУ ПО ИМЕНИ — ТОЛЬКО ПРИ ЕДИНСТВЕННОМ СОВПАДЕНИИ. Два Азиза в
 * штате, и трек одного лёг бы в день другого. Здесь это не «неточность в
 * отчёте»: по этим данным разговаривают с людьми, и приписать поездку не
 * тому — худшее, что может сделать эта подсистема. Не опознали — отказ с
 * внятной причиной, а не догадка.
 */
export type EmployeeRef = { telegramId: bigint } | { name: string };

/**
 * Опознанный сотрудник.
 *
 * `telegramId` здесь ради обратной связи: смену открывают и в приложении,
 * и в вебе, а сказать о ней человеку можно только в Telegram. Без этого
 * поля дверь смены знала, КТО открыл, и не знала, КУДА ему написать.
 */
export interface ResolvedEmployee {
  id: string;
  name: string;
  telegramId: bigint | null;
}

export async function resolveEmployee(
  ref: EmployeeRef,
): Promise<ResolvedEmployee | { error: string }> {
  if ('telegramId' in ref) {
    const found = await prisma.employee.findUnique({
      where: { telegramId: ref.telegramId },
      select: { id: true, name: true, isActive: true, telegramId: true },
    });
    if (!found || !found.isActive) return { error: 'Сотрудник не найден' };
    return { id: found.id, name: found.name, telegramId: found.telegramId };
  }

  const matches = await prisma.employee.findMany({
    where: { name: ref.name, isActive: true },
    select: { id: true, name: true, telegramId: true },
    take: 2,
  });
  if (matches.length === 0) return { error: 'Сотрудник не найден' };
  if (matches.length > 1) {
    return { error: 'Совпадают имена сотрудников — трек некому приписать' };
  }
  return matches[0];
}

/**
 * Дописать крошки и пересчитать дни, которых они коснулись.
 *
 * Возвращает, сколько строк реально легло: пачка приходит из офлайн-
 * очереди и почти всегда содержит уже записанное. Дубли отбрасывает база
 * по уникальному ключу, а не мы перебором.
 */
export async function recordPings(
  employeeId: string,
  pings: TrackPingInput[],
): Promise<{ stored: number; days: string[] }> {
  if (pings.length === 0) return { stored: 0, days: [] };

  // Запоминаем ДО записи: после неё день уже создан, и признак «первая
  // пачка за сегодня» пропадёт.
  const firstOfDay = await isFirstBatchOfDay(employeeId, pings);

  const created = await prisma.trackPing.createMany({
    data: pings.map((p) => ({
      employeeId,
      at: p.at,
      latitude: p.latitude,
      longitude: p.longitude,
      accuracyM: p.accuracyM,
      source: p.source,
      speedMps: p.speedMps,
      headingDeg: p.headingDeg,
    })),
    skipDuplicates: true,
  });

  const days = [...groupByLocalDay(pings).keys()];
  for (const day of days) await recalcDay(employeeId, day);

  // Чистка старого трека — здесь, а не по расписанию: своего планировщика
  // у витрины нет, а первая пачка нового дня — единственный момент, когда
  // мы точно знаем, что смена началась и данные пишутся. Запуск не чаще
  // раза в день на человека: `firstOfDay` истинно только тогда, когда дня
  // ещё не существовало.
  if (firstOfDay) await purgeOldPings();

  return { stored: created.count, days };
}

/**
 * Первая ли это пачка за свой день.
 *
 * Нужна одна вещь: повод раз в сутки запустить чистку старого трека, не
 * заводя планировщика. Смотрим самый ранний день пачки — если строки для
 * него ещё нет, смена только началась.
 */
async function isFirstBatchOfDay(
  employeeId: string,
  pings: TrackPingInput[],
): Promise<boolean> {
  const first = [...groupByLocalDay(pings).keys()].sort()[0];
  if (!first) return false;
  const { start } = localDayRange(first);
  const existing = await prisma.fieldDay.findUnique({
    where: { employeeId_date: { employeeId, date: start } },
    select: { id: true },
  });
  return existing === null;
}

/**
 * Пересчитать итоги дня по ВСЕМУ треку, а не по пришедшей пачке.
 *
 * Пачка может закрыть дыру в середине дня — тогда путь и время в движении
 * меняются не только на её концах. Досчитывать приращением значит однажды
 * получить сумму, которой не соответствует ни один отрезок на карте.
 *
 * Стоянки и плечи здесь не трогаем: их считает свой проход, и делать это
 * на каждом приёме крошек незачем — трансляция шлёт точку раз в минуту.
 */
export async function recalcDay(employeeId: string, day: string): Promise<void> {
  const { start, end } = localDayRange(day);

  const rows = await prisma.trackPing.findMany({
    where: { employeeId, at: { gte: start, lt: end } },
    select: { at: true, latitude: true, longitude: true, accuracyM: true, source: true },
    orderBy: { at: 'asc' },
  });
  if (rows.length === 0) return;

  const track: TrackPingInput[] = rows.map((r) => ({
    at: r.at,
    latitude: r.latitude,
    longitude: r.longitude,
    accuracyM: r.accuracyM,
    source: r.source as TrackPingInput['source'],
    speedMps: null,
    headingDeg: null,
  }));

  const { meters, movingSec } = summarize(track);
  const startedAt = track[0].at;
  const endedAt = track[track.length - 1].at;

  // Источник дня: `mixed`, если крошки пришли и из Telegram, и из PWA.
  // Знать это нужно там, где трек рваный: у браузера дыры — норма, у
  // трансляции — повод спросить.
  const sources = new Set(track.map((p) => p.source));
  const source = sources.size > 1 ? 'mixed' : [...sources][0];

  // Стоянки считает свой проход, поэтому при обновлении их число не
  // трогаем: подставить ноль значит стереть уже посчитанное.
  await prisma.fieldDay.upsert({
    where: { employeeId_date: { employeeId, date: start } },
    create: { employeeId, date: start, startedAt, endedAt, source, meters, movingSec },
    update: { startedAt, endedAt, source, meters, movingSec },
  });
}
