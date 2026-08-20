import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';
import {
  MAP_CUSTOMER_SELECT,
  MAX_FEATURES,
  buildMapCollection,
  buildMapWhere,
  buildProspectFeatures,
  districtStats,
  loadFirstOrderDates,
  parseStates,
  validateCoords,
} from '@/lib/customers/mapQuery';

// ══════════════════════════════════════════════════════════════════════
// Карта клиентов: точки для MapLibre и ручная простановка пина.
//
// GET отдаёт GeoJSON целиком, без bbox и постраничности. Это осознанно:
// легенда обещает «318 клиентов без координат», а посчитать их можно только
// по полной выборке; догрузка по вьюпорту вдобавок ломает кластеризацию —
// кластеры пересобирались бы при каждом сдвиге карты. Тысячи точек весят
// сотни килобайт, после сжатия — десятки, и запрос идёт раз в минуту.
// Порог, за которым понадобится серверная агрегация, — MAX_FEATURES.
//
// Доступ уже закрыт правилом `{ prefix: '/api/admin', access: 'ADMIN' }`
// в middleware, но isAuthorized здесь всё равно вызывается — ровно как в
// DELETE соседнего роута клиентов. Дверь запирают с обеих сторон.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);

    const where = buildMapWhere({
      city: searchParams.get('city'),
      district: searchParams.get('district'),
      type: searchParams.get('type'),
      minSpent: searchParams.get('minSpent'),
      maxSpent: searchParams.get('maxSpent'),
      source: searchParams.get('source'),
      companyType: searchParams.get('companyType'),
      audience: searchParams.get('audience'),
    });

    const customers = await prisma.customer.findMany({
      where,
      select: MAP_CUSTOMER_SELECT,
    });

    if (customers.length > MAX_FEATURES) {
      // Молча обрезать нельзя: владелец решит, что остальных клиентов нет.
      return NextResponse.json(
        {
          error: `Под фильтр попало ${customers.length} клиентов — карта рассчитана на ${MAX_FEATURES}. Сузьте фильтр по городу, типу или сумме.`,
          total: customers.length,
        },
        { status: 413 },
      );
    }

    const firstOrders = await loadFirstOrderDates(customers.map((c) => c.id));
    const collection = buildMapCollection(customers, firstOrders, {
      states: parseStates(searchParams.get('state')),
    });

    // Слой «белых пятен»: заведения из справочника, которые нам ещё не
    // клиенты. Грузится только по запросу — на карте клиентов он лишний
    // шум, а в режиме поиска новых точек продаж это главный слой.
    const companyTypeFilter = searchParams.get('companyType');
    // Слой целей — таблица `restaurants`, а там только рестораны. Когда
    // выбран любой другой тип, показывать её поверх выбранных тойхон
    // значит смешать два разных ответа на карте.
    const prospectsFit = !companyTypeFilter || companyTypeFilter === 'restaurant';
    if (searchParams.get('prospects') === '1' && prospectsFit) {
      const districtFilter = searchParams.get('district');
      const prospects = await prisma.restaurant.findMany({
        // Фильтр по району действует и на цели: иначе клик по «Чиланзар»
        // оставлял бы на карте цели со всего города.
        where: {
          customerId: null,
          latitude: { not: null },
          ...(districtFilter ? { district: districtFilter } : {}),
        },
        select: {
          id: true,
          name: true,
          city: true,
          tier: true,
          district: true,
          latitude: true,
          longitude: true,
          geoSource: true,
          customerId: true,
        },
      });
      collection.features.push(...buildProspectFeatures(prospects));
      collection.summary.prospects = prospects.length;
      // Разрез пересчитываем: цели появились после первой сборки, а без
      // них строка «в Чиланзаре 14 целей и 2 клиента» показывала бы нули.
      collection.summary.districts = districtStats(collection.features);
    }

    return NextResponse.json(collection);
  } catch (error: unknown) {
    console.error('API Admin Customers Map GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

/**
 * Ручная простановка пина. `latitude: null, longitude: null` снимает точку и
 * возвращает клиента в лоток «без координат».
 *
 * Записывает `geoSource: 'manual'` — метку, которую пакетный геокодер обязан
 * обходить стороной. Человек, ткнувший в карту, знает лучше любого провайдера.
 */
export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => null);
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Некорректный id клиента' }, { status: 400 });
    }

    const clearing = body?.latitude === null && body?.longitude === null;
    if (!clearing) {
      const check = validateCoords(body?.latitude, body?.longitude);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, address: true },
    });
    if (!customer) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: clearing
        ? { latitude: null, longitude: null, geoSource: null, geoPrecision: null, geocodedAt: null }
        : {
            latitude: body.latitude as number,
            longitude: body.longitude as number,
            geoSource: 'manual',
            geoPrecision: 'exact',
            geocodedAt: new Date(),
            geoAddress: customer.address,
          },
      select: { id: true, latitude: true, longitude: true, geoSource: true },
    });

    audit({
      action: clearing ? 'customer.geo.clear' : 'customer.geo.set',
      actor: 'owner',
      role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `#${id}`,
      meta: clearing ? {} : { latitude: body.latitude, longitude: body.longitude },
    });

    // Поставленный пин — это изменение карты: соседняя вкладка обязана
    // увидеть точку там же, а клиента — исчезнувшим из лотка «без
    // координат». Тема та же, что у списка: ключи карты и карточки
    // перечислены в useRealtime под 'customers'.
    publish('customers');

    return NextResponse.json({ status: 'ok', customer: updated });
  } catch (error: unknown) {
    console.error('API Admin Customers Map PATCH Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
