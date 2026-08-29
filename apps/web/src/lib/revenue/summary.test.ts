import { describe, it, expect } from 'vitest';
import { summarize, demandByProduct } from './summary';
import type { SalesLedger } from './salesLedger';

// Проверяем ровно то, что владелец видел на экране «Сводка»:
// «Выручка за сегодня 1 200 000» при разбивке 0 + 600 000 + 50 000.
// Причина — онлайн-заказ считался дважды (сам заказ + его складское
// движение), а доставка не входила в выручку вообще.

const TODAY = new Date('2026-08-04T12:00:00');
const SINCE = new Date('2026-08-04T00:00:00');

function ledger(partial: Partial<SalesLedger> = {}): SalesLedger {
  return {
    sales: [],
    orders: [],
    returns: [],
    costOf: () => 0,
    ...partial,
  };
}

describe('свод выручки', () => {
  it('разбивка складывается в выручку — иначе экран противоречит сам себе', () => {
    const result = summarize(
      ledger({
        sales: [
          {
            productId: 'p1',
            productName: 'Горох',
            quantity: 40,
            revenue: 600_000,
            cost: 320_000,
            at: TODAY,
            channel: 'online',
            customerId: null,
          },
        ],
        orders: [
          {
            id: 'o1',
            at: TODAY,
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            goods: 600_000,
            deliveryFee: 50_000,
            discount: 0,
            total: 650_000,
            channel: 'online',
          },
        ],
      }),
      SINCE,
    );

    expect(result.goods).toBe(600_000);
    expect(result.delivery).toBe(50_000);
    expect(result.revenue).toBe(650_000);
    expect(result.goods + result.delivery - result.discount - result.returns).toBe(
      result.revenue,
    );
  });

  it('онлайн-заказ не удваивается складским движением', () => {
    // Реестр отдаёт позицию заказа ОДИН раз: движение с orderId в него не
    // попадает по построению (см. фильтр в salesLedger). Здесь фиксируем
    // следствие: 600 000 остаются 600 000, а не превращаются в 1 200 000.
    const result = summarize(
      ledger({
        sales: [
          {
            productId: 'p1',
            productName: 'Горох',
            quantity: 40,
            revenue: 600_000,
            cost: 320_000,
            at: TODAY,
            channel: 'online',
            customerId: null,
          },
        ],
        orders: [
          {
            id: 'o1',
            at: TODAY,
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            goods: 600_000,
            deliveryFee: 0,
            discount: 0,
            total: 600_000,
            channel: 'online',
          },
        ],
      }),
      SINCE,
    );

    expect(result.revenue).toBe(600_000);
    expect(result.cost).toBe(320_000);
    expect(result.profit).toBe(280_000);
  });

  it('продажа в долг попадает в выручку и в счётчик кассы', () => {
    // «Qarzga sotish» не проходила фильтр «Do'kon sotish» и пропадала из
    // счётчика POS, оставаясь при этом в выручке — плитка «POS продаж: 0 шт»
    // соседствовала с выручкой, куда эта продажа входила.
    const result = summarize(
      ledger({
        sales: [
          {
            productId: 'p1',
            productName: 'Горох',
            quantity: 5,
            revenue: 75_000,
            cost: 40_000,
            at: TODAY,
            channel: 'pos',
            customerId: null,
          },
        ],
      }),
      SINCE,
    );

    expect(result.goodsPos).toBe(75_000);
    expect(result.posSales).toBe(1);
    expect(result.revenue).toBe(75_000);
  });

  it('скидка вычитается один раз, на уровне заказа', () => {
    const result = summarize(
      ledger({
        sales: [
          {
            productId: 'p1',
            productName: 'Горох',
            quantity: 10,
            revenue: 150_000,
            cost: 80_000,
            at: TODAY,
            channel: 'online',
            customerId: null,
          },
        ],
        orders: [
          {
            id: 'o1',
            at: TODAY,
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            goods: 150_000,
            deliveryFee: 20_000,
            discount: 30_000,
            total: 140_000,
            channel: 'online',
          },
        ],
      }),
      SINCE,
    );

    expect(result.revenue).toBe(140_000);
    expect(result.revenue).toBe(result.orders === 1 ? 140_000 : NaN);
  });

  it('возврат уменьшает выручку', () => {
    const result = summarize(
      ledger({
        sales: [
          {
            productId: 'p1',
            productName: 'Горох',
            quantity: 10,
            revenue: 150_000,
            cost: 80_000,
            at: TODAY,
            channel: 'pos',
            customerId: null,
          },
        ],
        returns: [
          {
            productId: 'p1',
            productName: 'Горох',
            quantity: 2,
            amount: 30_000,
            at: TODAY,
          },
        ],
      }),
      SINCE,
    );

    expect(result.returns).toBe(30_000);
    expect(result.revenue).toBe(120_000);
    expect(result.returnCount).toBe(1);
  });

  it('чек из трёх позиций — одна продажа, а не три', () => {
    const at = TODAY;
    const result = summarize(
      ledger({
        sales: ['a', 'b', 'c'].map((id) => ({
          productId: id,
          productName: id,
          quantity: 1,
          revenue: 10_000,
          cost: 5_000,
          at,
          channel: 'pos' as const,
          customerId: null,
        })),
      }),
      SINCE,
    );

    expect(result.posSales).toBe(1);
    expect(result.averageCheck).toBe(30_000);
  });

  it('вне периода ничего не считается', () => {
    const result = summarize(
      ledger({
        sales: [
          {
            productId: 'p1',
            productName: 'Горох',
            quantity: 10,
            revenue: 150_000,
            cost: 80_000,
            at: new Date('2026-08-03T23:59:00'),
            channel: 'pos',
            customerId: null,
          },
        ],
      }),
      SINCE,
    );

    expect(result.revenue).toBe(0);
  });
});

describe('спрос по товарам', () => {
  it('складывает продажи одного товара из обоих каналов', () => {
    const demand = demandByProduct(
      ledger({
        sales: [
          {
            productId: 'p1',
            productName: 'Горох',
            quantity: 10,
            revenue: 150_000,
            cost: 80_000,
            at: TODAY,
            channel: 'online',
            customerId: null,
          },
          {
            productId: 'p1',
            productName: 'Горох',
            quantity: 5,
            revenue: 75_000,
            cost: 40_000,
            at: TODAY,
            channel: 'pos',
            customerId: null,
          },
        ],
      }),
      SINCE,
    );

    expect(demand.get('p1')?.sold).toBe(15);
    expect(demand.get('p1')?.revenue).toBe(225_000);
  });
});
