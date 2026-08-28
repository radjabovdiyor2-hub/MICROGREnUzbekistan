import { describe, it, expect } from 'vitest';
import { allocateDelivery } from './deliveryCost';

const route = (...customerIds: (number | null)[]) => ({
  stops: customerIds.map((customerId) => ({ customerId })),
});

describe('allocateDelivery', () => {
  it('делит стоимость выезда поровну между остановками', () => {
    const a = allocateDelivery([route(1, 2)], 100_000);

    expect(a.byCustomer.get(1)).toBe(50_000);
    expect(a.byCustomer.get(2)).toBe(50_000);
    expect(a.trips).toBe(1);
  });

  // Одинокая дальняя точка забирает весь выезд — ровно то, ради чего
  // разнесение и делается.
  it('на одну остановку кладёт весь выезд целиком', () => {
    const a = allocateDelivery([route(7)], 80_000);
    expect(a.byCustomer.get(7)).toBe(80_000);
  });

  it('складывает дорогу по нескольким выездам к одному заведению', () => {
    const a = allocateDelivery([route(1), route(1, 2)], 60_000);
    expect(a.byCustomer.get(1)).toBe(60_000 + 30_000);
  });

  // Растворить непривязанную долю в чужих строках значило бы завысить
  // себестоимость тех заведений, к которым она не относится.
  it('не растворяет непривязанные остановки в чужих строках', () => {
    const a = allocateDelivery([route(1, null)], 100_000);

    expect(a.byCustomer.get(1)).toBe(50_000);
    expect(a.unattributed).toBe(50_000);
  });

  it('пустой маршрут не считается выездом', () => {
    const a = allocateDelivery([{ stops: [] }], 100_000);

    expect(a.trips).toBe(0);
    expect(a.unattributed).toBe(0);
    expect(a.byCustomer.size).toBe(0);
  });

  it('без маршрутов отдаёт пустое разнесение', () => {
    const a = allocateDelivery([], 100_000);
    expect(a.trips).toBe(0);
    expect(a.byCustomer.size).toBe(0);
  });

  // Ноль означает «стоимость выезда не задана»: разнесение тогда ничего не
  // меняет, и разрез честно остаётся валовым.
  it('при нулевой цене выезда никому ничего не приписывает', () => {
    const a = allocateDelivery([route(1, 2)], 0);
    expect([...a.byCustomer.values()]).toEqual([0, 0]);
  });
});
