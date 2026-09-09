import { prisma } from '@repo/database';

import { metersBetween } from '@/lib/customers/visitProof';
import { localDayRange } from '@/lib/localDate';

import { expectedRoute } from './routing';

// ══════════════════════════════════════════════════════════════════════
// Догрузка эталона и фактических метров для плеч дня.
//
// ОТДЕЛЬНО ОТ ПЕРЕСБОРКИ, потому что это единственное место во всей
// подсистеме, которое ходит в чужой платный API. Смешать его с геометрией
// значит дёргать маршрутизатор при каждом пересчёте дня, в том числе
// когда пересчёт вызван приходом одной крошки.
//
// СЧИТАЕМ ТОЛЬКО НЕДОСТАЮЩЕЕ. У плеча, где эталон уже есть, он не
// пересчитывается никогда: пробки того часа прошли, и спросить их заново
// нельзя — можно получить только сегодняшние, то есть чужие.
// ══════════════════════════════════════════════════════════════════════

/**
 * Сколько плеч за один заход отдаём маршрутизатору.
 *
 * День полевого сотрудника — это 5–10 плеч, и обычно все они уложатся.
 * Ограничение на случай, когда день собирают задним числом за месяц:
 * упереться в лимит чужого API, открывая отчёт, — плохой размен.
 */
const MAX_LOOKUPS = 12;

/**
 * Фактические метры плеча — по треку между отъездом и приездом.
 *
 * По треку, а не по прямой: прямая между двумя заведениями всегда короче
 * дороги, и «проехал 900 м вместо 2 км» выглядело бы уликой там, где
 * человек просто ехал по улицам.
 */
async function actualMeters(employeeId: string, from: Date, to: Date): Promise<number> {
  const rows = await prisma.trackPing.findMany({
    where: { employeeId, at: { gte: from, lte: to } },
    select: { latitude: true, longitude: true },
    orderBy: { at: 'asc' },
  });
  let meters = 0;
  for (let i = 1; i < rows.length; i += 1) meters += metersBetween(rows[i - 1], rows[i]);
  return meters;
}

/**
 * Проставить плечам дня фактические метры и эталон.
 *
 * Ошибку маршрутизатора НЕ поднимаем: отчёт обязан открыться и без
 * эталона — с честной пометкой «не получен», а не с пустым экраном.
 */
export async function fillExpected(employeeId: string, day: string): Promise<void> {
  const { start } = localDayRange(day);

  const fieldDay = await prisma.fieldDay.findUnique({
    where: { employeeId_date: { employeeId, date: start } },
    select: { id: true },
  });
  if (!fieldDay) return;

  const legs = await prisma.routeLeg.findMany({
    where: { fieldDayId: fieldDay.id, expectedSec: null },
    select: { id: true, fromStayId: true, toStayId: true, departedAt: true, arrivedAt: true },
    orderBy: { departedAt: 'asc' },
    take: MAX_LOOKUPS,
  });
  if (legs.length === 0) return;

  const stayIds = [...new Set(legs.flatMap((l) => [l.fromStayId, l.toStayId]))];
  const stays = await prisma.trackStay.findMany({
    where: { id: { in: stayIds } },
    select: { id: true, customer: { select: { latitude: true, longitude: true } } },
  });
  const pin = new Map(stays.map((s) => [s.id, s.customer]));

  for (const leg of legs) {
    const from = pin.get(leg.fromStayId);
    const to = pin.get(leg.toStayId);

    const meters = await actualMeters(employeeId, leg.departedAt, leg.arrivedAt);

    // Без пина у клиента эталон спросить не у чего. Метры по треку при
    // этом известны и полезны сами по себе — их и сохраняем.
    if (
      !from?.latitude || !from?.longitude ||
      !to?.latitude || !to?.longitude
    ) {
      await prisma.routeLeg.update({ where: { id: leg.id }, data: { actualMeters: meters } });
      continue;
    }

    const estimate = await expectedRoute(
      { latitude: from.latitude, longitude: from.longitude },
      { latitude: to.latitude, longitude: to.longitude },
      leg.departedAt,
    );

    await prisma.routeLeg.update({
      where: { id: leg.id },
      data: {
        actualMeters: meters,
        // Не получили — поля остаются пустыми. Именно пустыми: ноль
        // прочитался бы как «дорога занимает нисколько».
        expectedSec: estimate?.seconds ?? null,
        expectedMeters: estimate?.meters ?? null,
        provider: estimate?.provider ?? null,
        trafficUsed: estimate?.trafficUsed ?? false,
        expectedAt: estimate ? leg.departedAt : null,
      },
    });
  }
}
