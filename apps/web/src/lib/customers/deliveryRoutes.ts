import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Маршруты доставки для карты: точки выгрузки и линия объезда.
//
// Линия строится строго по `orderIndex`, а не по расстоянию. Порядок
// объезда назначает человек — он знает про время работы кухни, про то,
// что в один двор лучше заезжать до обеда, и про пробки на Малой кольцевой.
// Карта обязана показывать его замысел; «оптимизированный» маршрут поверх
// чужого решения выглядел бы как ошибка планировщика.
// ══════════════════════════════════════════════════════════════════════

export interface RouteStop {
  id: string;
  orderIndex: number;
  address: string;
  status: string;
  latitude: number;
  longitude: number;
}

export interface DeliveryRouteView {
  id: string;
  date: string;
  city: string;
  status: string;
  driver: string | null;
  stops: RouteStop[];
  /** Остановки без координат — их нет на линии, но забывать о них нельзя. */
  unplaced: number;
}

/** GeoJSON для слоя доставки: точки + линия объезда. */
export interface DeliveryCollection {
  type: 'FeatureCollection';
  features: (
    | {
        type: 'Feature';
        id: number;
        geometry: { type: 'Point'; coordinates: [number, number] };
        properties: { kind: 'stop'; routeId: string; seq: number; address: string; status: string };
      }
    | {
        type: 'Feature';
        geometry: { type: 'LineString'; coordinates: [number, number][] };
        properties: { kind: 'leg'; routeId: string };
      }
  )[];
  routes: DeliveryRouteView[];
}

/**
 * Маршруты на дату. Без даты — на сегодня: карта доставки нужна курьеру
 * и диспетчеру «сейчас», а история разбирается в другом разделе.
 */
export async function loadDeliveryRoutes(date?: string): Promise<DeliveryCollection> {
  const day = date ? new Date(date) : new Date();
  const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const to = new Date(from.getTime() + 86_400_000);

  const routes = await prisma.deliveryRoute.findMany({
    where: { date: { gte: from, lt: to } },
    select: {
      id: true,
      date: true,
      city: true,
      status: true,
      driver: { select: { name: true } },
      stops: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          orderIndex: true,
          address: true,
          status: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  });

  const features: DeliveryCollection['features'] = [];
  const views: DeliveryRouteView[] = [];
  // Отрицательные и непересекающиеся с клиентами: у остановок id строковый,
  // а MapLibre для подсветки требует число.
  let syntheticId = -1_000_000;

  for (const route of routes) {
    const placed: RouteStop[] = [];
    for (const s of route.stops) {
      if (s.latitude === null || s.longitude === null) continue;
      placed.push({
        id: s.id,
        orderIndex: s.orderIndex,
        address: s.address,
        status: s.status,
        latitude: s.latitude,
        longitude: s.longitude,
      });
    }

    for (const s of placed) {
      features.push({
        type: 'Feature',
        id: syntheticId,
        geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
        properties: {
          kind: 'stop',
          routeId: route.id,
          seq: s.orderIndex,
          address: s.address,
          status: s.status,
        },
      });
      syntheticId -= 1;
    }

    // Линия нужна от двух точек: из одной «маршрут» не рисуется.
    if (placed.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: placed.map((s) => [s.longitude, s.latitude] as [number, number]),
        },
        properties: { kind: 'leg', routeId: route.id },
      });
    }

    views.push({
      id: route.id,
      date: route.date.toISOString().slice(0, 10),
      city: route.city,
      status: route.status,
      driver: route.driver?.name ?? null,
      stops: placed,
      unplaced: route.stops.length - placed.length,
    });
  }

  return { type: 'FeatureCollection', features, routes: views };
}
