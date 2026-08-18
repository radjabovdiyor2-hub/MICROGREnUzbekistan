import { describe, it, expect } from 'vitest';

import {
  SEGMENT_META,
  SEGMENT_STATES,
  cadenceDays,
  computeSegment,
  computeTrend,
  explainSegment,
  spentPercentiles,
  valueTier,
} from './segments';

// ══════════════════════════════════════════════════════════════════════
// Состояние клиента считается от ЕГО ритма, а не от плоских 30 дней.
//
// Главное, что здесь закреплено: два клиента, молчащие одинаковое число
// дней, получают разные состояния, если по-разному заказывали раньше.
// Ради этого различия каденция и вводилась — без такого теста её легко
// «упростить» обратно в константу, и никто не заметит.
// ══════════════════════════════════════════════════════════════════════

/** Фиксированная точка отсчёта: тест не должен протухать вместе с календарём. */
const NOW = new Date('2026-08-18T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

describe('cadenceDays', () => {
  it('считает средний интервал при трёх и более заказах', () => {
    // 12 заказов за 165 дней → 11 промежутков → ровно 15 дней.
    expect(
      cadenceDays({
        firstOrderDate: daysAgo(185),
        lastOrderDate: daysAgo(20),
        ordersCount: 12,
        customerType: 'b2b',
      }),
    ).toBeCloseTo(15, 5);
  });

  it('при менее чем трёх заказах берёт умолчание по типу клиента', () => {
    const shared = { firstOrderDate: daysAgo(5), lastOrderDate: daysAgo(5), ordersCount: 1 };
    expect(cadenceDays({ ...shared, customerType: 'b2b' })).toBe(14);
    expect(cadenceDays({ ...shared, customerType: 'b2c' })).toBe(21);
  });

  it('всплеск заказов не сжимает ритм ниже трёх дней', () => {
    expect(
      cadenceDays({
        firstOrderDate: daysAgo(31),
        lastOrderDate: daysAgo(30),
        ordersCount: 100,
        customerType: 'b2b',
      }),
    ).toBe(3);
  });

  it('три заказа за десять лет не растягивают ритм выше 90 дней', () => {
    expect(
      cadenceDays({
        firstOrderDate: daysAgo(3650),
        lastOrderDate: daysAgo(10),
        ordersCount: 3,
        customerType: 'b2b',
      }),
    ).toBe(90);
  });
});

describe('computeSegment — ритм решает всё', () => {
  it('одинаковое молчание даёт разные состояния при разном ритме', () => {
    const weekly = computeSegment({
      firstOrderDate: daysAgo(185),
      lastOrderDate: daysAgo(20),
      ordersCount: 12, // ритм ≈ 15 дней → просрочка ×1.33
      customerType: 'b2b',
      now: NOW,
    });
    const quarterly = computeSegment({
      firstOrderDate: daysAgo(200),
      lastOrderDate: daysAgo(20),
      ordersCount: 3, // ритм = 90 дней → просрочка ×0.22
      customerType: 'b2b',
      now: NOW,
    });

    expect(weekly.state).toBe('slipping');
    expect(quarterly.state).toBe('healthy');
  });

  it('без заказов клиент — потенциальный, каким бы ни был статус', () => {
    const result = computeSegment({
      firstOrderDate: null,
      lastOrderDate: null,
      ordersCount: 0,
      customerType: 'b2b',
      now: NOW,
    });
    expect(result.state).toBe('prospect');
    expect(result.daysSince).toBeNull();
    expect(result.overdueRatio).toBeNull();
  });

  it('счётчик заказов без даты последнего не считается активностью', () => {
    // Рассинхрон зеркала: orders_count проставлен, last_order_date — нет.
    // Делить не на что, и выдумывать давность нельзя.
    const result = computeSegment({
      firstOrderDate: null,
      lastOrderDate: null,
      ordersCount: 7,
      customerType: 'b2b',
      now: NOW,
    });
    expect(result.state).toBe('prospect');
  });
});

describe('computeSegment — границы просрочки', () => {
  // Ритм фиксируем умолчанием b2b = 14 дней при одном заказе.
  function atRatio(ratio: number) {
    return computeSegment({
      firstOrderDate: daysAgo(400),
      lastOrderDate: daysAgo(14 * ratio),
      ordersCount: 2,
      customerType: 'b2b',
      now: NOW,
    }).state;
  }

  it('ровно 1.0 — ещё здоров, чуть выше — уже замедлился', () => {
    expect(atRatio(1)).toBe('healthy');
    expect(atRatio(1.01)).toBe('slipping');
  });

  it('ровно 2.0 — замедлился, чуть выше — под угрозой', () => {
    expect(atRatio(2)).toBe('slipping');
    expect(atRatio(2.01)).toBe('at_risk');
  });

  it('ровно 4.0 — под угрозой, чуть выше — потерян', () => {
    expect(atRatio(4)).toBe('at_risk');
    expect(atRatio(4.01)).toBe('lost');
  });
});

describe('computeSegment — «Новый» не заменяет собой просрочку', () => {
  it('первый заказ на этой неделе — новый', () => {
    expect(
      computeSegment({
        firstOrderDate: daysAgo(5),
        lastOrderDate: daysAgo(5),
        ordersCount: 1,
        customerType: 'b2b',
        now: NOW,
      }).state,
    ).toBe('new');
  });

  it('единственный заказ год назад — потерян, а не новый', () => {
    // Ловушка наивного правила «стаж меньше ритма»: у клиента с одним
    // заказом first и last совпадают, стаж всегда нулевой, и он застрял бы
    // в «Новых» навсегда.
    expect(
      computeSegment({
        firstOrderDate: daysAgo(365),
        lastOrderDate: daysAgo(365),
        ordersCount: 1,
        customerType: 'b2b',
        now: NOW,
      }).state,
    ).toBe('lost');
  });

  it('давний клиент в графике — активный, а не новый', () => {
    expect(
      computeSegment({
        firstOrderDate: daysAgo(300),
        lastOrderDate: daysAgo(5),
        ordersCount: 2,
        customerType: 'b2b',
        now: NOW,
      }).state,
    ).toBe('healthy');
  });
});

describe('computeTrend — падение важнее самого состояния', () => {
  it('ловит падение из активного под угрозу', () => {
    // Месяц назад заказывал каждые 7 дней и был в графике, с тех пор молчит.
    const orderDates = [70, 63, 56, 49, 42, 35].map((d) => daysAgo(d));
    const trend = computeTrend({ orderDates, customerType: 'b2b', now: NOW });

    expect(trend).not.toBeNull();
    expect(trend?.before).toBe('healthy');
    expect(trend?.worsened).toBe(true);
    expect(['slipping', 'at_risk', 'lost']).toContain(trend?.after);
  });

  it('видит возвращение клиента', () => {
    // Месяц назад молчал полгода, потом вернулся и заказывает снова.
    const orderDates = [200, 190, 180, 20, 13, 6].map((d) => daysAgo(d));
    const trend = computeTrend({ orderDates, customerType: 'b2b', now: NOW });

    expect(trend?.improved).toBe(true);
    expect(trend?.worsened).toBe(false);
  });

  it('стабильный клиент не показывает перехода', () => {
    const orderDates = [42, 35, 28, 21, 14, 7].map((d) => daysAgo(d));
    const trend = computeTrend({ orderDates, customerType: 'b2b', now: NOW });

    expect(trend?.worsened).toBe(false);
    expect(trend?.improved).toBe(false);
  });

  it('взросление «Новый → Активный» не считается ухудшением', () => {
    // Месяц назад у клиента было два заказа и он числился новым; теперь
    // заказов шесть и он просто активный. Сравнение по порядку в легенде
    // объявило бы это падением — ложная тревога на ровном месте.
    const orderDates = [42, 35, 28, 21, 14, 7].map((d) => daysAgo(d));
    const trend = computeTrend({ orderDates, customerType: 'b2b', now: NOW });

    expect(trend?.before).toBe('new');
    expect(trend?.after).toBe('healthy');
    expect(trend?.worsened).toBe(false);
  });

  it('клиенту младше месяца сравнивать не с чем', () => {
    // Все заказы новее окна — «месяц назад» его ещё не существовало.
    const trend = computeTrend({
      orderDates: [10, 5, 2].map((d) => daysAgo(d)),
      customerType: 'b2b',
      now: NOW,
    });
    expect(trend).toBeNull();
  });

  it('без заказов перехода нет', () => {
    expect(computeTrend({ orderDates: [], customerType: 'b2b', now: NOW })).toBeNull();
  });
});

describe('valueTier и перцентили', () => {
  it('делит выборку по p50 и p80', () => {
    const p = spentPercentiles([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    expect(valueTier(1000, p)).toBe('top');
    expect(valueTier(600, p)).toBe('mid');
    expect(valueTier(100, p)).toBe('low');
  });

  it('на пустой выборке никого не объявляет крупным', () => {
    const p = spentPercentiles([]);
    expect(p).toEqual({ p50: 0, p80: 0 });
    expect(valueTier(0, p)).toBe('low');
    expect(valueTier(999_999, p)).toBe('low');
  });
});

describe('словарь состояний', () => {
  it('описан ровно для тех состояний, что объявлены', () => {
    expect(Object.keys(SEGMENT_META).sort()).toEqual([...SEGMENT_STATES].sort());
  });

  it('цвета заданы только токенами — захардкоженных нет', () => {
    // Машинная проверка конституционного запрета: hex в этом файле означает,
    // что состояние перестало следовать за темой.
    for (const state of SEGMENT_STATES) {
      expect(SEGMENT_META[state].token).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });

  it('у каждого состояния есть русская и узбекская подпись', () => {
    for (const state of SEGMENT_STATES) {
      expect(SEGMENT_META[state].ru.length).toBeGreaterThan(0);
      expect(SEGMENT_META[state].uz.length).toBeGreaterThan(0);
    }
  });

  it('порядок в легенде уникален', () => {
    const orders = SEGMENT_STATES.map((s) => SEGMENT_META[s].order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe('explainSegment', () => {
  it('называет и паузу, и обычный ритм, и кратность', () => {
    const result = computeSegment({
      firstOrderDate: daysAgo(400),
      lastOrderDate: daysAgo(41),
      ordersCount: 2,
      customerType: 'b2b',
      now: NOW,
    });
    expect(explainSegment(result, 'ru')).toBe(
      'Последний заказ 41 дн. назад при обычных 14 — просрочка ×2.9',
    );
  });

  it('для клиента без заказов не выдумывает цифры', () => {
    const result = computeSegment({
      firstOrderDate: null,
      lastOrderDate: null,
      ordersCount: 0,
      customerType: 'b2c',
      now: NOW,
    });
    expect(explainSegment(result, 'ru')).toBe('Заказов ещё не было');
    expect(explainSegment(result, 'uz')).toBe('Hali buyurtma boʻlmagan');
  });
});
