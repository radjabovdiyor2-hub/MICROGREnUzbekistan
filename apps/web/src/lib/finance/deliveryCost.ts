import { prisma } from '@repo/database';
import { getNumber } from '@/lib/settings/store';

// ══════════════════════════════════════════════════════════════════════
// Себестоимость дороги, разнесённая по заведениям.
//
// ЗАЧЕМ. Дальняя точка с мелким заказом выглядит нормальным клиентом: в
// себестоимость лотка входят семена и субстрат, но не бензин и не час
// времени. Пока дорога не посчитана, разрез по заведениям показывает
// валовую маржу и молчит о том, что поездка съедает её целиком.
//
// КАК СЧИТАЕТСЯ. Стоимость одного выезда (`delivery.tripCost`) делится
// поровну между остановками маршрута. Это допущение, и оно названо вслух:
// на самом деле дальняя остановка стоит дороже ближней, но расстояние
// между точками система не хранит, а выдумывать его хуже, чем разделить
// поровну.
//
// ЧЕГО НЕ ПРОИСХОДИТ МОЛЧА. Остановка без заказа или заказ без карточки
// клиента не привязываются ни к кому. Их доля не растворяется в чужих
// строках, а возвращается отдельным числом: разнесено не всё, и это видно.
// ══════════════════════════════════════════════════════════════════════

export interface DeliveryAllocation {
  /** Сколько дороги пришлось на каждое заведение. */
  byCustomer: Map<number, number>;
  /** Стоимость выездов, которую не удалось привязать к заведению. */
  unattributed: number;
  /** Сколько выездов учтено. */
  trips: number;
  /** Стоимость одного выезда, по которой считали. */
  tripCost: number;
}

interface RouteLike {
  stops: { customerId: number | null }[];
}

/** Чистое разнесение: те же маршруты и цена — тот же ответ. */
export function allocateDelivery(routes: RouteLike[], tripCost: number): DeliveryAllocation {
  const byCustomer = new Map<number, number>();
  let unattributed = 0;
  let trips = 0;

  for (const route of routes) {
    if (route.stops.length === 0) continue;
    trips += 1;

    const perStop = tripCost / route.stops.length;
    for (const stop of route.stops) {
      if (stop.customerId === null) {
        unattributed += perStop;
        continue;
      }
      byCustomer.set(stop.customerId, (byCustomer.get(stop.customerId) ?? 0) + perStop);
    }
  }

  return { byCustomer, unattributed, trips, tripCost };
}

/** Поднять маршруты за период и разнести дорогу по заведениям. */
export async function loadDeliveryAllocation(from: Date, to?: Date): Promise<DeliveryAllocation> {
  const tripCost = await getNumber('delivery.tripCost');

  // Ноль означает «стоимость выезда не задана». Считать по нулю можно, но
  // тогда разнесение ничего не меняет — и лишний запрос к базе не нужен.
  if (tripCost <= 0) {
    return { byCustomer: new Map(), unattributed: 0, trips: 0, tripCost: 0 };
  }

  const routes = await prisma.deliveryRoute.findMany({
    where: { date: to ? { gte: from, lte: to } : { gte: from } },
    select: { stops: { select: { order: { select: { userId: true } } } } },
  });

  const userIds = [
    ...new Set(
      routes.flatMap((r) => r.stops.map((s) => s.order?.userId)).filter((id): id is string => !!id),
    ),
  ];

  const customerByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const linked = await prisma.customer.findMany({
      where: { webUserId: { in: userIds } },
      select: { id: true, webUserId: true },
    });
    for (const c of linked) if (c.webUserId) customerByUser.set(c.webUserId, c.id);
  }

  const shaped: RouteLike[] = routes.map((r) => ({
    stops: r.stops.map((s) => ({
      customerId: s.order?.userId ? customerByUser.get(s.order.userId) ?? null : null,
    })),
  }));

  return allocateDelivery(shaped, tripCost);
}
