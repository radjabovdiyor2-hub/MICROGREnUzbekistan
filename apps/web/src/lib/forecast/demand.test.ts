import { describe, it, expect } from 'vitest';
import { forecastDemand, sowingPlan, type OrderFact } from './demand';
import { formatLocalDate } from '@/lib/localDate';

const TODAY = new Date('2026-08-20T10:00:00');
const at = (d: string) => new Date(`2026-${d}T10:00:00`);

function fact(date: string, p: Partial<OrderFact> = {}): OrderFact {
  return {
    customerId: 1,
    customerName: 'Плов-центр',
    productName: 'Руккола',
    at: at(date),
    quantity: 2,
    ...p,
  };
}

describe('forecastDemand', () => {
  it('предсказывает дату по обычному интервалу и объём по прошлым заказам', () => {
    const s = forecastDemand([fact('08-01'), fact('08-08'), fact('08-15')], TODAY);

    expect(s).toHaveLength(1);
    expect(s[0].intervalDays).toBe(7);
    expect(s[0].expectedQty).toBe(2);
    expect(formatLocalDate(s[0].expectedAt)).toBe('2026-08-22');
    expect(s[0].basedOn).toBe(3);
  });

  // По одному промежутку виден не ритм, а совпадение. Прогноз по нему
  // выглядел бы так же уверенно, как по десяти заказам, — и это худшее,
  // что можно сделать на короткой истории.
  it('молчит, когда заказов меньше трёх', () => {
    expect(forecastDemand([fact('08-01'), fact('08-08')], TODAY)).toEqual([]);
  });

  it('разделяет культуры одного заведения', () => {
    const s = forecastDemand(
      [
        fact('08-01'), fact('08-08'), fact('08-15'),
        fact('08-02', { productName: 'Горох' }),
        fact('08-09', { productName: 'Горох' }),
        fact('08-16', { productName: 'Горох' }),
      ],
      TODAY,
    );

    expect(s.map((x) => x.productName).sort()).toEqual(['Горох', 'Руккола']);
  });

  it('разделяет заведения по одной культуре', () => {
    const s = forecastDemand(
      [
        fact('08-01'), fact('08-08'), fact('08-15'),
        fact('08-01', { customerId: 2, customerName: 'Кафе' }),
        fact('08-08', { customerId: 2, customerName: 'Кафе' }),
        fact('08-15', { customerId: 2, customerName: 'Кафе' }),
      ],
      TODAY,
    );

    expect(s).toHaveLength(2);
  });

  // Разброс — это честность прогноза: по нему видно, ритм перед нами или
  // случайный набор дат.
  it('у ровного ритма разброс нулевой, у рваного — заметный', () => {
    const even = forecastDemand([fact('08-01'), fact('08-08'), fact('08-15')], TODAY);
    expect(even[0].spread).toBe(0);

    const ragged = forecastDemand([fact('07-01'), fact('07-03'), fact('08-15')], TODAY);
    expect(ragged[0].spread).toBeGreaterThan(0);
  });

  it('помечает просроченный прогноз', () => {
    const s = forecastDemand([fact('07-01'), fact('07-08'), fact('07-15')], TODAY);
    expect(s[0].overdue).toBe(true);
  });

  it('не строит прогноз, когда все заказы в один день', () => {
    expect(forecastDemand([fact('08-01'), fact('08-01'), fact('08-01')], TODAY)).toEqual([]);
  });

  it('ближайшее ожидание идёт первым', () => {
    const s = forecastDemand(
      [
        fact('08-01'), fact('08-08'), fact('08-15'),
        fact('06-01', { customerId: 2, customerName: 'Редкий' }),
        fact('07-01', { customerId: 2, customerName: 'Редкий' }),
        fact('08-01', { customerId: 2, customerName: 'Редкий' }),
      ],
      TODAY,
    );

    // У «Редкого» интервал около месяца, у недельного клиента — семь
    // дней: ближайшим ожидается именно он.
    expect(s[0].customerName).toBe('Плов-центр');
    expect(s[1].customerName).toBe('Редкий');
  });
});

describe('sowingPlan', () => {
  const signals = () =>
    forecastDemand(
      [
        fact('08-01'), fact('08-08'), fact('08-15'),
        fact('08-01', { customerId: 2, customerName: 'Кафе', quantity: 3 }),
        fact('08-08', { customerId: 2, customerName: 'Кафе', quantity: 3 }),
        fact('08-15', { customerId: 2, customerName: 'Кафе', quantity: 3 }),
      ],
      TODAY,
    );

  it('складывает ожидаемое по культуре и считает заведения', () => {
    const plan = sowingPlan(signals(), TODAY, 7);

    expect(plan).toHaveLength(1);
    expect(plan[0].quantity).toBe(5);
    expect(plan[0].venues).toBe(2);
  });

  it('не берёт то, что ожидается за горизонтом', () => {
    expect(sowingPlan(signals(), TODAY, 1)).toEqual([]);
  });

  // Заведение, не заказавшее вчера, продукт всё равно возьмёт — либо оно,
  // либо кто-то на замену. Выбросить просроченное значит недосеять.
  it('включает просроченное ожидание, а не выбрасывает его', () => {
    const late = forecastDemand([fact('07-01'), fact('07-08'), fact('07-15')], TODAY);
    const plan = sowingPlan(late, TODAY, 7);

    expect(plan).toHaveLength(1);
    expect(plan[0].venues).toBe(1);
  });
});
