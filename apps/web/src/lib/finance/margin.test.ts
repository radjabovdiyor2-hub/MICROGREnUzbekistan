import { describe, it, expect } from 'vitest';
import { summarizeMargin } from './margin';
import type { SaleLine } from '@/lib/revenue/salesLedger';

const AT = new Date('2026-08-20T10:00:00Z');

function sale(p: Partial<SaleLine> = {}): SaleLine {
  return {
    productId: 'ruccola',
    productName: 'Руккола',
    quantity: 1,
    revenue: 30_000,
    cost: 10_000,
    at: AT,
    channel: 'online',
    customerId: null,
    ...p,
  };
}

const NAMES = new Map<number, string>([
  [1, 'Плов-центр'],
  [2, 'Кафе у моста'],
]);

describe('summarizeMargin', () => {
  it('считает маржу и её долю по культуре', () => {
    const r = summarizeMargin([sale(), sale()], NAMES);

    expect(r.byProduct).toHaveLength(1);
    expect(r.byProduct[0].revenue).toBe(60_000);
    expect(r.byProduct[0].cost).toBe(20_000);
    expect(r.byProduct[0].margin).toBe(40_000);
    expect(r.byProduct[0].marginRate).toBeCloseTo(2 / 3, 10);
    expect(r.byProduct[0].quantity).toBe(2);
  });

  // Смысл всего разреза: убыточное должно бросаться в глаза, а не тонуть
  // внизу списка, отсортированного по обороту.
  it('ставит убыточное первым, а не прячет в хвосте', () => {
    const r = summarizeMargin(
      [
        sale({ productId: 'good', productName: 'Кормит', revenue: 100_000, cost: 20_000 }),
        sale({ productId: 'bad', productName: 'Проедает', revenue: 10_000, cost: 40_000 }),
      ],
      NAMES,
    );

    expect(r.byProduct[0].label).toBe('Проедает');
    expect(r.byProduct[0].margin).toBeLessThan(0);
  });

  it('разделяет заведения и подставляет их названия', () => {
    const r = summarizeMargin(
      [sale({ customerId: 1 }), sale({ customerId: 2, revenue: 5_000, cost: 9_000 })],
      NAMES,
    );

    const labels = r.byCustomer.map((row) => row.label);
    expect(labels).toContain('Плов-центр');
    expect(labels).toContain('Кафе у моста');
    expect(r.byCustomer[0].label).toBe('Кафе у моста');
  });

  // Если выбросить неопознанные продажи, сумма разреза разойдётся с общей
  // выручкой — и разрезу нельзя будет верить ни в одной строке.
  it('не теряет продажи без опознанного покупателя', () => {
    const sales = [sale({ customerId: 1 }), sale({ customerId: null })];
    const r = summarizeMargin(sales, NAMES);

    const total = r.byCustomer.reduce((sum, row) => sum + row.revenue, 0);
    expect(total).toBe(60_000);
    expect(r.byCustomer.some((row) => row.label === 'Розница и неопознанные')).toBe(true);
  });

  it('называет клиента по номеру, если имени нет в справочнике', () => {
    const r = summarizeMargin([sale({ customerId: 99 })], NAMES);
    expect(r.byCustomer[0].label).toBe('Клиент №99');
  });

  it('разделяет витрину и кассу', () => {
    const r = summarizeMargin(
      [sale({ channel: 'online' }), sale({ channel: 'pos', revenue: 12_000, cost: 4_000 })],
      NAMES,
    );

    expect(r.byChannel).toHaveLength(2);
    expect(r.byChannel.map((row) => row.label).sort()).toEqual(['Витрина', 'Касса и выезд']);
  });

  // У возврата или бесплатной выдачи выручки нет; ноль в доле маржи
  // читался бы как «продали по себестоимости», а этого не было.
  it('не выдумывает долю маржи без выручки', () => {
    const r = summarizeMargin([sale({ revenue: 0, cost: 0 })], NAMES);
    expect(r.byProduct[0].marginRate).toBeNull();
  });

  it('не склеивает разные удалённые товары в одну строку', () => {
    const r = summarizeMargin(
      [
        sale({ productId: null, productName: 'Базилик (удалён)' }),
        sale({ productId: null, productName: 'Горох (удалён)' }),
      ],
      NAMES,
    );

    expect(r.byProduct).toHaveLength(2);
  });

  it('на пустом периоде отдаёт пустые разрезы, а не падает', () => {
    const r = summarizeMargin([], NAMES);
    expect(r.byProduct).toEqual([]);
    expect(r.byCustomer).toEqual([]);
    expect(r.byChannel).toEqual([]);
  });
});
