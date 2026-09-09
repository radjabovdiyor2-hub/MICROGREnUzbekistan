import { describe, it, expect } from 'vitest';

import { avgOrder, buildVisitForecast, MIN_ORDERS, type ScheduledCustomer } from './expectedVisits';
import { isoWeekday } from '@/lib/customers/visitSchedule';

// Вторник: ISO-день 2. Все проверки отсчитываются от него.
const TODAY = new Date('2026-09-08T10:00:00');

function client(p: Partial<ScheduledCustomer> = {}): ScheduledCustomer {
  return {
    customerId: 1,
    customerName: 'Чайхана',
    weekday: 2,
    totalSpent: 3_000_000,
    ordersCount: 10,
    ...p,
  };
}

describe('avgOrder', () => {
  it('делит потраченное на число заказов', () => {
    expect(avgOrder(client())).toBe(300_000);
  });

  it('не считает средний чек по слишком короткой истории', () => {
    expect(avgOrder(client({ ordersCount: MIN_ORDERS - 1 }))).toBe(0);
  });

  it('не ломается на клиенте без покупок', () => {
    expect(avgOrder(client({ totalSpent: 0, ordersCount: 0 }))).toBe(0);
  });
});

describe('buildVisitForecast', () => {
  it('сегодняшний заезд попадает в прогноз', () => {
    expect(isoWeekday(TODAY)).toBe(2);
    const f = buildVisitForecast([client()], TODAY, 7);

    expect(f.days[0].date).toBe('2026-09-08');
    expect(f.days[0].expected).toBe(300_000);
  });

  it('повторяет недельное расписание внутри горизонта', () => {
    const f = buildVisitForecast([client()], TODAY, 14);

    // Вторник встречается дважды за две недели.
    expect(f.days.map((d) => d.date)).toEqual(['2026-09-08', '2026-09-15']);
    expect(f.total).toBe(600_000);
  });

  it('дни без заездов в прогноз не попадают', () => {
    const f = buildVisitForecast([client({ weekday: 5 })], TODAY, 3);
    expect(f.days).toHaveLength(0);
    expect(f.total).toBe(0);
  });

  it('складывает нескольких клиентов одного дня и ставит крупного первым', () => {
    const f = buildVisitForecast(
      [
        client({ customerId: 1, customerName: 'Малый', totalSpent: 300_000, ordersCount: 10 }),
        client({ customerId: 2, customerName: 'Крупный', totalSpent: 5_000_000, ordersCount: 10 }),
      ],
      TODAY,
      1,
    );

    expect(f.days[0].expected).toBe(530_000);
    expect(f.days[0].visits[0].customerName).toBe('Крупный');
  });

  it('клиент без истории не даёт суммы, но виден отдельным списком', () => {
    const f = buildVisitForecast(
      [client({ customerId: 7, customerName: 'Новый', ordersCount: 1, totalSpent: 90_000 })],
      TODAY,
      1,
    );

    expect(f.total).toBe(0);
    expect(f.unknown).toEqual([{ customerId: 7, customerName: 'Новый', weekday: 2 }]);
    // Заезд всё равно показан: он состоится, неизвестна только сумма.
    expect(f.days[0].visits).toHaveLength(1);
  });

  it('клиент без истории попадает в список один раз, а не по разу на день', () => {
    const f = buildVisitForecast(
      [client({ customerId: 7, ordersCount: 0, totalSpent: 0 })],
      TODAY,
      14,
    );

    expect(f.days).toHaveLength(2);
    expect(f.unknown).toHaveLength(1);
  });

  it('горизонт ограничен сверху и не уходит в бесконечность', () => {
    const f = buildVisitForecast([client({ weekday: 2 })], TODAY, 9999);
    // 90 дней — потолок, вторников в них не больше тринадцати.
    expect(f.days.length).toBeLessThanOrEqual(13);
  });
});
