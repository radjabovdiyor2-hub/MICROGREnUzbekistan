import { prisma } from '@repo/database';

import { localDayRange } from '@/lib/localDate';
import { currentShift } from '@/lib/shift/store';
import { POSITION_FRESH_MIN } from '@/lib/tracking/ping';

import { computeSegment } from './segments';
import { readDayPlans } from './visitPlanStore';
import { NEARBY_MAX_KM, rankNextStops, type NextCandidate, type NextSuggestion } from './nextStop';

// ══════════════════════════════════════════════════════════════════════
// Что предложить человеку прямо сейчас — сборка на сервере.
//
// ПОЗИЦИЮ БЕРЁМ ИЗ ТРЕКА, А НЕ ИЗ ЗАПРОСА. У приложения геопозиция под
// рукой, и соблазн принять её телом велик — но это второе определение «где
// он» рядом с треком, и разойдутся они ровно в тех случаях, ради которых
// всё делается. То же правило уже действует у отметки «Я на точке».
//
// ДВА ЗАПРЕТА, И ОБА ГОВОРЯТ СЛОВАМИ.
//   · Смена закрыта — подсказок нет. Это и есть «до конца смены»: закрыл
//     смену, и подсказки замолчали сами, без отдельного выключателя.
//   · Позиция старше получаса — подсказок нет. «Ближайший» от точки,
//     которой полчаса, — это совет ехать не туда.
// Пустой список без объяснения читался бы как поломка, поэтому у каждого
// запрета своя фраза.
// ══════════════════════════════════════════════════════════════════════

/** Почему подсказок нет. `null` — есть и причина не нужна. */
export type NextGate = 'shift' | 'position';

export interface NextAnswer {
  gate: NextGate | null;
  gateText: string | null;
  /** С какой минуты позиция считается несвежей. Чтобы копий числа не было. */
  freshAfterMin: number;
  next: NextSuggestion[];
}

const GATE_TEXT: Record<NextGate, string> = {
  shift: 'Смена не начата — начните смену, и подскажу, куда дальше.',
  // Дословно та же фраза, что уже говорит «Я на точке»: человек читает одно
  // предложение об одном условии, а не два его пересказа.
  position: 'Не вижу, где вы: включите запись дня — тогда подскажу ближайшие.',
};

const refuse = (gate: NextGate): NextAnswer => ({
  gate,
  gateText: GATE_TEXT[gate],
  freshAfterMin: POSITION_FRESH_MIN,
  next: [],
});

/**
 * Коробка вокруг человека — грубый отбор до точного счёта.
 *
 * Индекса по паре координат в схеме нет намеренно (b-tree по паре для
 * «рядом» бесполезен), поэтому сначала сужаем рамкой, а расстояние считаем
 * уже в чистой функции. Полтора запаса — чтобы угол рамки не отрезал
 * клиента, который по прямой ещё в радиусе.
 */
function box(latitude: number, longitude: number) {
  const delta = (NEARBY_MAX_KM / 85) * 1.5;
  return {
    latitude: { gte: latitude - delta, lte: latitude + delta },
    longitude: { gte: longitude - delta, lte: longitude + delta },
  };
}

/** Соседи вокруг точки: кандидаты, которых ещё не назначали. */
async function neighbours(
  latitude: number,
  longitude: number,
  exclude: Set<number>,
  now: Date,
): Promise<NextCandidate[]> {
  const rows = await prisma.customer.findMany({
    where: { ...box(latitude, longitude), deletedAt: null },
    select: {
      id: true, name: true, companyName: true, latitude: true, longitude: true,
      lastOrderDate: true, ordersCount: true, customerType: true,
      interactions: {
        where: { interactionType: { startsWith: 'visit_' } },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    // Потолок на всякий случай: рамка маленькая, но плотный центр города
    // однажды окажется плотнее, чем мы думали.
    take: 200,
  });

  const out: NextCandidate[] = [];
  for (const row of rows) {
    if (exclude.has(row.id)) continue;
    if (row.latitude === null || row.longitude === null) continue;

    const segment = computeSegment({
      lastOrderDate: row.lastOrderDate,
      // Первый заказ нужен сегментации только для «новичка»; у соседа по
      // дороге эта тонкость роли не играет, а лишний запрос — играет.
      firstOrderDate: row.lastOrderDate,
      ordersCount: row.ordersCount,
      customerType: row.customerType,
      now,
    });
    const seen = row.interactions[0]?.createdAt ?? null;

    out.push({
      kind: 'nearby',
      id: row.id,
      name: row.companyName || row.name || `#${row.id}`,
      latitude: row.latitude,
      longitude: row.longitude,
      state: segment.state,
      overdueRatio: segment.overdueRatio,
      lastVisitDays:
        seen === null ? null : Math.floor((now.getTime() - seen.getTime()) / 86_400_000),
      orderIndex: null,
    });
  }
  return out;
}

/**
 * Куда человеку дальше.
 *
 * `employeeId` и `name` приходят от двери, которая уже опознала человека по
 * подписи. Здесь про него больше ничего не спрашивается.
 */
export async function nextStopsFor(
  employeeId: string,
  name: string,
  now: Date = new Date(),
): Promise<NextAnswer> {
  const open = await currentShift(employeeId, now);
  if (!open) return refuse('shift');

  const last = await prisma.trackPing.findFirst({
    where: { employeeId },
    select: { at: true, latitude: true, longitude: true },
    orderBy: { at: 'desc' },
  });
  if (!last || now.getTime() - last.at.getTime() > POSITION_FRESH_MIN * 60_000) {
    return refuse('position');
  }

  const from = { latitude: last.latitude, longitude: last.longitude };
  const { start } = localDayRange();

  const [plans, route] = await Promise.all([
    readDayPlans({ planDate: start, assignee: name }),
    prisma.deliveryRoute.findFirst({
      where: { date: start, driverId: employeeId },
      select: {
        stops: {
          where: { status: 'pending' },
          select: { id: true, address: true, orderIndex: true, latitude: true, longitude: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    }),
  ]);

  const assigned: NextCandidate[] = [];
  const seen = new Set<number>();

  for (const plan of plans) {
    for (const stop of plan.stops) {
      seen.add(stop.customerId);
      if (stop.done || stop.latitude === null || stop.longitude === null) continue;
      assigned.push({
        kind: 'plan',
        id: stop.customerId,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        state: 'healthy',
        overdueRatio: null,
        lastVisitDays: null,
        orderIndex: stop.orderIndex,
      });
    }
  }

  for (const stop of route?.stops ?? []) {
    if (stop.latitude === null || stop.longitude === null) continue;
    assigned.push({
      kind: 'delivery',
      // Отрицательный ключ: адрес рейса — не клиент, и путать их в одном
      // списке идентификаторов нельзя.
      id: -Math.abs(stop.orderIndex + 1),
      name: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      state: 'healthy',
      overdueRatio: null,
      lastVisitDays: null,
      orderIndex: stop.orderIndex,
    });
  }

  // Соседей ищем, ТОЛЬКО когда назначенного не осталось: с грузом в машине
  // «загляните в кафе рядом» — это шум, из-за которого перестают читать и
  // полезные подсказки. Заодно это и лишний запрос к базе, которого не будет.
  const candidates =
    assigned.length > 0
      ? assigned
      : await neighbours(last.latitude, last.longitude, seen, now);

  return {
    gate: null,
    gateText: null,
    freshAfterMin: POSITION_FRESH_MIN,
    next: rankNextStops(candidates, from),
  };
}
