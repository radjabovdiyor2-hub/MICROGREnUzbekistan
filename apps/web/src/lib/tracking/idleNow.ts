import { prisma } from '@repo/database';

import { getNumber } from '@/lib/settings/store';

import { detectIdle } from './idle';
import type { TrackPingInput } from './ping';
import type { CustomerPin } from './stays';

// ══════════════════════════════════════════════════════════════════════
// Кто стоит на месте ПРЯМО СЕЙЧАС.
//
// Отчёт дня отвечает на «как прошёл вторник» — там простои считаются по
// всему треку и показываются владельцу. Здесь другой вопрос и другое
// время: «стоит ли он сейчас», посреди дня, и ответ нужен сторожу, чтобы
// спросить у человека, всё ли в порядке.
//
// ПРАВИЛО ОДНО И ТО ЖЕ — `detectIdle` с теми же настройками и теми же
// исключениями. Две арифметики разошлись бы ровно на людях: сообщение
// сотруднику утверждало бы одно, а экран владельца показывал другое.
//
// ОКНО СЧИТАЕТСЯ ОТКРЫТЫМ, только если в него попала ПОСЛЕДНЯЯ крошка.
// Иначе человек, который постоял и уехал, вечно числился бы стоящим.
// ══════════════════════════════════════════════════════════════════════

/**
 * Сколько минут человек стоит на месте к моменту `now`.
 *
 * Ключи — только те, кто стоит: отсутствие в карте означает «едет, ходит
 * или у клиента», а не «не считали».
 */
export async function ongoingIdle(
  employeeIds: string[],
  start: Date,
  end: Date,
  now: Date,
): Promise<Map<string, number>> {
  const standing = new Map<string, number>();
  if (employeeIds.length === 0) return standing;

  const rows = await prisma.trackPing.findMany({
    where: { employeeId: { in: employeeIds }, at: { gte: start, lt: end } },
    select: { employeeId: true, at: true, latitude: true, longitude: true, accuracyM: true, source: true },
    orderBy: { at: 'asc' },
  });
  if (rows.length === 0) return standing;

  const [radiusM, idleMinutes] = await Promise.all([
    getNumber('field.stayRadiusM'),
    getNumber('field.idleMinutes'),
  ]);

  // Пины берём ВСЕ — так же, как пересборка дня: предварительный отбор по
  // рамке однажды отрежет клиента на краю и назовёт визит к нему простоем.
  const pins: CustomerPin[] = (
    await prisma.customer.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: { id: true, latitude: true, longitude: true },
    })
  ).map((c) => ({ id: c.id, latitude: c.latitude as number, longitude: c.longitude as number }));

  const byPerson = new Map<string, TrackPingInput[]>();
  for (const row of rows) {
    const track = byPerson.get(row.employeeId) ?? [];
    track.push({
      at: row.at,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyM: row.accuracyM,
      source: row.source as TrackPingInput['source'],
      speedMps: null,
      headingDeg: null,
    });
    byPerson.set(row.employeeId, track);
  }

  for (const [employeeId, track] of byPerson) {
    const windows = detectIdle(track, radiusM, idleMinutes * 60_000, { pins });
    if (windows.length === 0) continue;

    const lastWindow = windows[windows.length - 1];
    const lastPing = track[track.length - 1];
    // Окно закончилось раньше последней крошки — значит человек уже уехал.
    if (lastWindow.endedAt.getTime() !== lastPing.at.getTime()) continue;

    // Считаем от начала окна ДО СЕЙЧАС, а не до последней крошки: человек
    // стоит и в те минуты, пока телефон молчит между точками.
    standing.set(employeeId, Math.round((now.getTime() - lastWindow.startedAt.getTime()) / 60_000));
  }

  return standing;
}
