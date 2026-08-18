import { describe, it, expect, vi } from 'vitest';

vi.mock('@repo/database', () => ({
  prisma: { crmOrder: { groupBy: vi.fn() } },
  Prisma: {},
}));

import {
  buildMapCollection,
  buildMapWhere,
  buildProspectFeatures,
  districtStats,
  parseStates,
  validateCoords,
} from './mapQuery';

// ══════════════════════════════════════════════════════════════════════
// Сборка данных карты.
//
// Два места, где ошибка не видна глазами и потому закреплена тестом:
// порядок координат в GeoJSON (долгота первой) и то, что клиент без точки
// не исчезает из отчёта, а попадает в лоток. И то и другое молча ломает
// карту: в первом случае Ташкент уезжает в океан, во втором владелец
// думает, что клиентов меньше, чем есть.
// ══════════════════════════════════════════════════════════════════════

const NOW = new Date('2026-08-18T12:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function customer(over: Partial<Parameters<typeof buildMapCollection>[0][number]> = {}) {
  return {
    id: 1,
    name: 'Плов Центр',
    companyName: null,
    city: 'tashkent',
    address: 'Amir Temur 5',
    district: 'chilanzar',
    customerType: 'b2b',
    ordersCount: 12,
    totalSpent: 4_200_000,
    lastOrderDate: daysAgo(10),
    latitude: 41.3111,
    longitude: 69.2401,
    geoSource: '2gis',
    ...over,
  };
}

describe('buildMapWhere', () => {
  it('город фильтруется перечислением написаний, а не одним значением', () => {
    const where = buildMapWhere({ city: 'Ташкент' });
    expect(where.city).toBeDefined();
    const filter = where.city as { in: string[]; mode: string };
    expect(filter.in).toContain('tashkent');
    expect(filter.in).toContain('toshkent');
    expect(filter.mode).toBe('insensitive');
  });

  it('неизвестный город не превращается в фильтр', () => {
    expect(buildMapWhere({ city: 'Бухара' }).city).toBeUndefined();
  });

  it('b2b кладётся в customerType, а не в status', () => {
    const where = buildMapWhere({ type: 'b2b' });
    expect(where.customerType).toBe('b2b');
    expect(where.status).toBeUndefined();
  });

  it('состояние НЕ попадает в WHERE — такой колонки в базе нет', () => {
    // Оно вычисляется из ритма заказов; попытка отдать его Prisma уронит запрос.
    const where = buildMapWhere({ states: 'at_risk' }) as Record<string, unknown>;
    expect(where.states).toBeUndefined();
    expect(where.state).toBeUndefined();
    expect(where.status).toBeUndefined();
  });

  it('диапазон суммы собирается только из заданных границ', () => {
    expect(buildMapWhere({ minSpent: '1000' }).totalSpent).toEqual({ gte: 1000 });
    expect(buildMapWhere({ maxSpent: '5000' }).totalSpent).toEqual({ lte: 5000 });
    expect(buildMapWhere({}).totalSpent).toBeUndefined();
    expect(buildMapWhere({ minSpent: 'абв' }).totalSpent).toBeUndefined();
  });

  it('null от searchParams.get не превращается в границу «ровно ноль»', () => {
    // Именно так роут и вызывает функцию: searchParams.get() отдаёт null,
    // а Number(null) === 0 — и запрос без фильтров ловил только клиентов с
    // нулевой суммой. Тест с undefined это не показывал: Number(undefined)
    // даёт NaN и честно отсеивался.
    const where = buildMapWhere({
      city: null,
      district: null,
      type: null,
      minSpent: null,
      maxSpent: null,
      source: null,
    });
    expect(where.totalSpent).toBeUndefined();
    expect(where).toEqual({});
  });

  it('пустая строка в параметре тоже не создаёт границу', () => {
    expect(buildMapWhere({ minSpent: '', maxSpent: '  ' }).totalSpent).toBeUndefined();
  });

  it('явный ноль остаётся настоящей границей', () => {
    expect(buildMapWhere({ minSpent: '0' }).totalSpent).toEqual({ gte: 0 });
  });
});

describe('parseStates', () => {
  it('разбирает список и отбрасывает мусор', () => {
    expect(parseStates('at_risk,lost')).toEqual(new Set(['at_risk', 'lost']));
    expect(parseStates('at_risk, выдумка')).toEqual(new Set(['at_risk']));
  });

  it('пустое значение означает «не фильтровать»', () => {
    expect(parseStates(null)).toBeNull();
    expect(parseStates('')).toBeNull();
    expect(parseStates('выдумка')).toBeNull();
  });
});

describe('buildMapCollection', () => {
  it('кладёт долготу ПЕРВОЙ — иначе точка уезжает за тысячи километров', () => {
    const c = buildMapCollection([customer()], new Map(), { now: NOW });
    // Значения намеренно разные: перестановка провалит проверку.
    expect(c.features[0].geometry.coordinates).toEqual([69.2401, 41.3111]);
  });

  it('id лежит на верхнем уровне Feature — без него не работает подсветка', () => {
    const c = buildMapCollection([customer({ id: 95 })], new Map(), { now: NOW });
    expect(c.features[0].id).toBe(95);
  });

  it('клиент без координат уходит в лоток, а не пропадает из отчёта', () => {
    const c = buildMapCollection(
      [customer({ id: 1 }), customer({ id: 2, latitude: null, longitude: null })],
      new Map(),
      { now: NOW },
    );
    expect(c.features).toHaveLength(1);
    expect(c.unplaced).toHaveLength(1);
    expect(c.unplaced[0].id).toBe(2);
    expect(c.summary).toMatchObject({ total: 2, placed: 1, unplaced: 1 });
  });

  it('половинчатые координаты считаются отсутствующими', () => {
    const c = buildMapCollection([customer({ longitude: null })], new Map(), { now: NOW });
    expect(c.features).toHaveLength(0);
    expect(c.unplaced).toHaveLength(1);
  });

  it('состояние берётся из ритма, а сводка считает и штуки, и деньги', () => {
    const firstOrders = new Map([[1, daysAgo(185)]]);
    const c = buildMapCollection(
      [customer({ lastOrderDate: daysAgo(60), totalSpent: 1_000_000 })],
      firstOrders,
      { now: NOW },
    );
    // Ритм ≈ (185−60)/11 ≈ 11.4 дн., пауза 60 дн. → просрочка ×5.3 → потерян.
    expect(c.features[0].properties.st).toBe('lost');
    expect(c.summary.byState.lost).toBe(1);
    expect(c.summary.revenueByState.lost).toBe(1_000_000);
  });

  it('фильтр по состоянию убирает точку и из сводки тоже', () => {
    const c = buildMapCollection([customer({ lastOrderDate: daysAgo(2) })], new Map(), {
      now: NOW,
      states: new Set(['lost']),
    });
    expect(c.features).toHaveLength(0);
    expect(c.summary.total).toBe(0);
    expect(c.summary.byState.healthy).toBe(0);
  });

  it('имя компании перебивает имя контакта', () => {
    const c = buildMapCollection([customer({ companyName: 'Chorsu Osh' })], new Map(), {
      now: NOW,
    });
    expect(c.features[0].properties.n).toBe('Chorsu Osh');
  });

  it('безымянный клиент получает подпись, а не пустую строку', () => {
    const c = buildMapCollection([customer({ name: null, companyName: null })], new Map(), {
      now: NOW,
    });
    expect(c.features[0].properties.n).toBe('Без имени');
  });
});

describe('buildProspectFeatures — белые пятна', () => {
  function restaurant(over: Record<string, unknown> = {}) {
    return {
      id: 'ckabc123',
      name: 'Afsona',
      city: 'tashkent',
      tier: 'premium',
      latitude: 41.305,
      longitude: 69.28,
      geoSource: '2gis',
      customerId: null,
      ...over,
    } as Parameters<typeof buildProspectFeatures>[0][number];
  }

  it('заведение-цель попадает на карту с типом restaurant', () => {
    const [f] = buildProspectFeatures([restaurant()]);
    expect(f.properties.k).toBe('restaurant');
    expect(f.properties.st).toBe('prospect');
    expect(f.properties.tr).toBe('premium');
    expect(f.geometry.coordinates).toEqual([69.28, 41.305]);
  });

  it('заведение, ставшее клиентом, из слоя исчезает', () => {
    // Иначе один ресторан рисуется дважды — как клиент и как цель, — и
    // отчёт «сколько нам ещё продавать» завышается на число партнёров.
    const features = buildProspectFeatures([restaurant({ customerId: 42 })]);
    expect(features).toHaveLength(0);
  });

  it('заведение без координат не рисуется', () => {
    expect(buildProspectFeatures([restaurant({ latitude: null })])).toHaveLength(0);
    expect(buildProspectFeatures([restaurant({ longitude: null })])).toHaveLength(0);
  });

  it('id отрицательные — не столкнутся с id клиентов', () => {
    // У заведений id строковый (cuid), а MapLibre требует числовой.
    const features = buildProspectFeatures([
      restaurant({ id: 'a' }),
      restaurant({ id: 'b' }),
      restaurant({ id: 'c' }),
    ]);
    expect(features.map((f) => f.id)).toEqual([-1, -2, -3]);
    expect(features.every((f) => f.id < 0)).toBe(true);
  });
});

describe('districtStats — где недобираем', () => {
  function feature(over: { d?: string | null; st?: string; sp?: number; k?: string } = {}) {
    const c = buildMapCollection([customer()], new Map(), { now: NOW }).features[0];
    return {
      ...c,
      properties: {
        ...c.properties,
        d: over.d === undefined ? 'chilanzar' : over.d,
        st: (over.st ?? c.properties.st) as typeof c.properties.st,
        sp: over.sp ?? c.properties.sp,
        k: (over.k ?? 'customer') as typeof c.properties.k,
      },
    };
  }

  it('считает клиентов, деньги, уходящих и цели раздельно', () => {
    const [stat] = districtStats([
      feature({ st: 'healthy', sp: 1000 }),
      feature({ st: 'at_risk', sp: 500 }),
      feature({ k: 'restaurant' }),
    ]);

    expect(stat.district).toBe('chilanzar');
    expect(stat.customers).toBe(2);
    expect(stat.revenue).toBe(1500);
    expect(stat.atRisk).toBe(1);
    // Цель — не клиент: в выручку и в счётчик клиентов не попадает.
    expect(stat.prospects).toBe(1);
  });

  it('сверху район с наибольшим числом уходящих', () => {
    const stats = districtStats([
      feature({ d: 'yunusobod', st: 'healthy', sp: 9000 }),
      feature({ d: 'chilanzar', st: 'lost', sp: 100 }),
      feature({ d: 'chilanzar', st: 'at_risk', sp: 100 }),
    ]);
    expect(stats[0].district).toBe('chilanzar');
    expect(stats[0].atRisk).toBe(2);
  });

  it('при равной тревоге сверху район с меньшей выручкой', () => {
    const stats = districtStats([
      feature({ d: 'yunusobod', st: 'healthy', sp: 9000 }),
      feature({ d: 'sergeli', st: 'healthy', sp: 100 }),
    ]);
    expect(stats[0].district).toBe('sergeli');
  });

  it('клиенты без района не сваливаются в выдуманное «прочее»', () => {
    // Пустая категория на карте выглядела бы как настоящая территория.
    expect(districtStats([feature({ d: null })])).toEqual([]);
  });
});

describe('validateCoords', () => {
  it('пропускает точку в Ташкенте', () => {
    expect(validateCoords(41.3111, 69.2401)).toEqual({ ok: true });
  });

  it('ловит переставленные местами широту и долготу', () => {
    // Обе величины формально валидны — спасает только привязка к стране.
    const result = validateCoords(69.2401, 41.3111);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/переставлены местами/);
  });

  it('отвергает нечисловые и бесконечные значения', () => {
    expect(validateCoords('41.3', 69.2).ok).toBe(false);
    expect(validateCoords(null, null).ok).toBe(false);
    expect(validateCoords(Number.NaN, 69.2).ok).toBe(false);
    expect(validateCoords(Number.POSITIVE_INFINITY, 69.2).ok).toBe(false);
  });

  it('отвергает выход за пределы допустимых широт и долгот', () => {
    expect(validateCoords(120, 69.2).ok).toBe(false);
    expect(validateCoords(41.3, 200).ok).toBe(false);
  });
});
