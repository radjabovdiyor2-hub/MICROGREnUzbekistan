import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, PATCH } from './route';
import { SESSION_COOKIE, createSession } from '@/lib/session';

// ══════════════════════════════════════════════════════════════════════
// Роут карты клиентов.
//
// Проверяем то, что ломается молча: доступ без сессии, порядок координат
// в GeoJSON, попадание безкоординатных клиентов в лоток вместо небытия и
// отказ записывать переставленные местами широту с долготой.
// ══════════════════════════════════════════════════════════════════════

const customerFindMany = vi.fn();
const customerFindUnique = vi.fn();
const customerUpdate = vi.fn();
const crmOrderGroupBy = vi.fn();
const restaurantFindMany = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    customer: {
      findMany: (...a: unknown[]) => customerFindMany(...a),
      findUnique: (...a: unknown[]) => customerFindUnique(...a),
      update: (...a: unknown[]) => customerUpdate(...a),
    },
    crmOrder: {
      groupBy: (...a: unknown[]) => crmOrderGroupBy(...a),
    },
    restaurant: {
      findMany: (...a: unknown[]) => restaurantFindMany(...a),
    },
  },
  Prisma: {},
}));

const SECRET = 'test-session-secret-value-at-least-32-chars';

async function adminCookie(): Promise<string> {
  const token = await createSession({ role: 'ADMIN', name: 'owner' });
  return `${SESSION_COOKIE}=${token}`;
}

function getRequest(query = '', cookie?: string) {
  return new NextRequest(`http://localhost:3000/api/admin/customers/map${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function patchRequest(body: unknown, cookie?: string) {
  return new NextRequest('http://localhost:3000/api/admin/customers/map', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: cookie ? { cookie, 'Content-Type': 'application/json' } : {},
  });
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Плов Центр',
    companyName: null,
    city: 'tashkent',
    address: 'Amir Temur 5',
    district: 'chilanzar',
    customerType: 'b2b',
    ordersCount: 3,
    totalSpent: 1_000_000,
    lastOrderDate: new Date('2026-08-16T00:00:00.000Z'),
    latitude: 41.3111,
    longitude: 69.2401,
    geoSource: '2gis',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SESSION_SECRET', SECRET);
  vi.stubEnv('BOT_SECRET', '');
  crmOrderGroupBy.mockResolvedValue([]);
});

describe('GET /api/admin/customers/map', () => {
  it('без сессии отвечает 401 и в базу не ходит', async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect(customerFindMany).not.toHaveBeenCalled();
  });

  it('отдаёт FeatureCollection с долготой первой и id на верхнем уровне', async () => {
    customerFindMany.mockResolvedValue([row({ id: 95 })]);

    const res = await GET(getRequest('', await adminCookie()));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.type).toBe('FeatureCollection');
    expect(body.features).toHaveLength(1);
    expect(body.features[0].id).toBe(95);
    // Значения намеренно разные: перестановка провалит проверку.
    expect(body.features[0].geometry.coordinates).toEqual([69.2401, 41.3111]);
  });

  it('клиенты без координат учтены в лотке, а не потеряны', async () => {
    customerFindMany.mockResolvedValue([
      row({ id: 1 }),
      row({ id: 2, latitude: null, longitude: null }),
    ]);

    const body = await (await GET(getRequest('', await adminCookie()))).json();
    expect(body.features.map((f: { id: number }) => f.id)).toEqual([1]);
    expect(body.unplaced.map((u: { id: number }) => u.id)).toEqual([2]);
    expect(body.summary).toMatchObject({ total: 2, placed: 1, unplaced: 1 });
  });

  it('слишком большая выборка отвергается с 413, а не обрезается молча', async () => {
    customerFindMany.mockResolvedValue(
      Array.from({ length: 10_001 }, (_, i) => row({ id: i + 1 })),
    );

    const res = await GET(getRequest('', await adminCookie()));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.total).toBe(10_001);
    // Даты первых заказов при отказе не запрашиваются — лишний тяжёлый запрос.
    expect(crmOrderGroupBy).not.toHaveBeenCalled();
  });

  it('фильтр по городу разворачивается в перечисление написаний и районы', async () => {
    customerFindMany.mockResolvedValue([]);

    await GET(getRequest('?city=Ташкент', await adminCookie()));

    // Два условия через OR: написания города плюс слаги его районов.
    // Одних написаний мало — заведение из области приходит от провайдера
    // под именем своего тумана, и перечислить все варианты невозможно.
    const [byCity, byDistrict] = customerFindMany.mock.calls[0][0].where.OR;
    expect(byCity.city.in).toContain('tashkent');
    expect(byCity.city.in).toContain('toshkent');
    expect(byDistrict.district.in).toContain('chilanzar');
  });

  it('тип заведения и аудитория доезжают из строки запроса до WHERE', async () => {
    customerFindMany.mockResolvedValue([]);

    await GET(getRequest('?companyType=fitness&audience=female', await adminCookie()));

    const where = customerFindMany.mock.calls[0][0].where;
    expect(where.companyType).toBe('fitness');
    expect(where.audience).toBe('female');
  });

  it('слой целей гасится, когда выбран не ресторанный тип', async () => {
    // `restaurants` — таблица ресторанов журнала. Показывать её поверх
    // выбранных тойхон значит смешать два разных ответа на одной карте.
    customerFindMany.mockResolvedValue([]);
    restaurantFindMany.mockResolvedValue([]);

    await GET(getRequest('?prospects=1&companyType=toyxona', await adminCookie()));

    expect(restaurantFindMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/customers/map', () => {
  it('без сессии отвечает 401 и ничего не пишет', async () => {
    const res = await PATCH(patchRequest({ id: 1, latitude: 41.3, longitude: 69.2 }));
    expect(res.status).toBe(401);
    expect(customerUpdate).not.toHaveBeenCalled();
  });

  it('отвергает переставленные местами координаты, не трогая клиента', async () => {
    const res = await PATCH(
      patchRequest({ id: 1, latitude: 69.2401, longitude: 41.3111 }, await adminCookie()),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/переставлены местами/);
    expect(customerUpdate).not.toHaveBeenCalled();
    expect(customerFindUnique).not.toHaveBeenCalled();
  });

  it('отвергает некорректный id', async () => {
    const res = await PATCH(patchRequest({ id: 'abc' }, await adminCookie()));
    expect(res.status).toBe(400);
    expect(customerUpdate).not.toHaveBeenCalled();
  });

  it('ставит пин и помечает источник ручным', async () => {
    customerFindUnique.mockResolvedValue({ id: 1, address: 'Amir Temur 5' });
    customerUpdate.mockResolvedValue({
      id: 1,
      latitude: 41.3111,
      longitude: 69.2401,
      geoSource: 'manual',
    });

    const res = await PATCH(
      patchRequest({ id: 1, latitude: 41.3111, longitude: 69.2401 }, await adminCookie()),
    );
    expect(res.status).toBe(200);

    const data = customerUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      latitude: 41.3111,
      longitude: 69.2401,
      geoSource: 'manual',
      geoPrecision: 'exact',
      geoAddress: 'Amir Temur 5',
    });
  });

  it('null-координаты снимают пин и стирают источник', async () => {
    customerFindUnique.mockResolvedValue({ id: 1, address: null });
    customerUpdate.mockResolvedValue({ id: 1, latitude: null, longitude: null, geoSource: null });

    const res = await PATCH(
      patchRequest({ id: 1, latitude: null, longitude: null }, await adminCookie()),
    );
    expect(res.status).toBe(200);
    expect(customerUpdate.mock.calls[0][0].data).toMatchObject({
      latitude: null,
      longitude: null,
      geoSource: null,
    });
  });

  it('несуществующий клиент — 404, а не тихое создание', async () => {
    customerFindUnique.mockResolvedValue(null);

    const res = await PATCH(
      patchRequest({ id: 777, latitude: 41.3111, longitude: 69.2401 }, await adminCookie()),
    );
    expect(res.status).toBe(404);
    expect(customerUpdate).not.toHaveBeenCalled();
  });
});
