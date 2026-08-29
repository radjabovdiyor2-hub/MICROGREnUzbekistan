import { describe, it, expect, vi, beforeEach } from 'vitest';

import { describeShortfalls, ingestChannelOrder, shortfalls } from './intake';
import type { ChannelOrderInput } from './orderSchema';

// ══════════════════════════════════════════════════════════════════════
// Приём заказа с площадки.
//
// Две вещи, которые обязаны работать, иначе канал приносит убыток:
// повторный вебхук не создаёт второй заказ (площадки повторяют доставку
// при любом таймауте), и заказ списывает остаток — списание живёт в
// `runAfterCreate`, а не в `createOrder`, и пропустить его значит продать
// один лоток дважды.
// ══════════════════════════════════════════════════════════════════════

const channelFindUnique = vi.fn();
const channelOrderFindUnique = vi.fn();
const channelOrderUpsert = vi.fn();
const productFindMany = vi.fn();
const orderUpdate = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    salesChannel: { findUnique: (a: unknown) => channelFindUnique(a) },
    channelOrder: {
      findUnique: (a: unknown) => channelOrderFindUnique(a),
      upsert: (a: unknown) => channelOrderUpsert(a),
    },
    product: { findMany: (a: unknown) => productFindMany(a) },
    order: { update: (a: unknown) => orderUpdate(a) },
  },
  Prisma: {},
}));

const createOrder = vi.fn();
vi.mock('@/lib/orders/create', () => ({ createOrder: (...a: unknown[]) => createOrder(...a) }));

const runAfterCreate = vi.fn();
vi.mock('@/lib/orders/afterCreate', () => ({
  runAfterCreate: (...a: unknown[]) => runAfterCreate(...a),
}));

vi.mock('@/lib/realtime/bus', () => ({ publish: vi.fn() }));

const ORDER: ChannelOrderInput = {
  externalId: 'TZK-1001',
  customer: { name: 'Ozod', phone: '+998901112233', address: 'Samarqand, Registon 1' },
  items: [{ productId: 'p1', quantity: 2, price: 17000 }],
};

function channelRow() {
  return {
    id: 'ch1',
    code: 'tezkor',
    isActive: true,
    cities: ['samarkand'],
    stockBuffer: 0,
    markupPercent: 10,
    orderCutoff: null,
    lastSyncAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  channelFindUnique.mockResolvedValue(channelRow());
  channelOrderFindUnique.mockResolvedValue(null);
  channelOrderUpsert.mockResolvedValue({});
  productFindMany.mockResolvedValue([{ id: 'p1', sku: 'MG-01', price: 15000 }]);
  orderUpdate.mockResolvedValue({});
  createOrder.mockResolvedValue({
    ok: true,
    order: { id: 'o1', orderNumber: 'M-42', items: [] },
    user: { id: 'u1' },
    customerName: 'Ozod',
  });
});

describe('ingestChannelOrder', () => {
  it('создаёт заказ и списывает остаток', async () => {
    const result = await ingestChannelOrder('tezkor', ORDER);

    expect(result).toEqual({ ok: true, orderId: 'o1', orderNumber: 'M-42', duplicate: false });
    expect(createOrder).toHaveBeenCalledTimes(1);
    // Без этого вызова остаток не спишется — весь смысл проверки
    expect(runAfterCreate).toHaveBeenCalledTimes(1);
  });

  it('повторный вебхук возвращает тот же заказ и НЕ создаёт второй', async () => {
    channelOrderFindUnique.mockResolvedValue({ orderId: 'o1', order: { orderNumber: 'M-42' } });

    const result = await ingestChannelOrder('tezkor', ORDER);

    expect(result).toEqual({ ok: true, orderId: 'o1', orderNumber: 'M-42', duplicate: true });
    expect(createOrder).not.toHaveBeenCalled();
    expect(runAfterCreate).not.toHaveBeenCalled();
  });

  it('цену в заказ не передаёт — её ставит каталог', async () => {
    await ingestChannelOrder('tezkor', ORDER);

    const [body] = createOrder.mock.calls[0];
    expect(body.items).toEqual([{ productId: 'p1', quantity: 2 }]);
    expect(body.source).toBe('tezkor');
  });

  it('записывает расхождение цены площадки с ценой канала', async () => {
    // Прайс 15 000 + наценка канала 10% = 16 500, площадка прислала 17 000
    await ingestChannelOrder('tezkor', ORDER);

    const call = channelOrderUpsert.mock.calls[0][0];
    expect(call.update.priceDelta).toBe((17000 - 16500) * 2);
  });

  it('товар не найден — отказ, а не заказ из половины позиций', async () => {
    productFindMany.mockResolvedValue([]);

    const result = await ingestChannelOrder('tezkor', ORDER);

    expect(result).toEqual({
      ok: false,
      error: 'Товар не найден в каталоге: p1',
      status: 422,
    });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('оплаченный на площадке заказ помечается оплаченным', async () => {
    await ingestChannelOrder('tezkor', { ...ORDER, paid: true });

    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { paymentStatus: 'PAID' },
    });
  });

  it('канал, который не принимает заказы, отвечает 404', async () => {
    const result = await ingestChannelOrder('google_shopping', ORDER);

    expect(result).toEqual({ ok: false, error: 'Канал не принимает заказы', status: 404 });
  });

  it('заказ, который не удалось создать, всё равно оставляет след', async () => {
    createOrder.mockResolvedValue({ ok: false, error: "Savat bo'sh", status: 400 });

    const result = await ingestChannelOrder('tezkor', ORDER);

    expect(result.ok).toBe(false);
    expect(channelOrderUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('shortfalls', () => {
  it('молчит, когда запаса хватает', () => {
    expect(shortfalls([{ name: 'Редис', quantity: 3, stock: 10 }])).toEqual([]);
    // Ровно столько, сколько есть, — это не нехватка.
    expect(shortfalls([{ name: 'Редис', quantity: 10, stock: 10 }])).toEqual([]);
  });

  it('называет позицию, которой продали больше, чем есть', () => {
    expect(shortfalls([
      { name: 'Редис', quantity: 12, stock: 10 },
      { name: 'Горох', quantity: 1, stock: 5 },
    ])).toEqual([{ name: 'Редис', requested: 12, available: 10 }]);
  });

  it('отрицательный остаток показывает нулём', () => {
    // Склад мог уйти в минус до внедрения атомарного списания.
    // Показать владельцу «-3 на складе» значит заставить его гадать.
    expect(shortfalls([{ name: 'Редис', quantity: 2, stock: -3 }]))
      .toEqual([{ name: 'Редис', requested: 2, available: 0 }]);
  });

  it('складывает описание для сигнала владельцу', () => {
    expect(describeShortfalls([
      { name: 'Редис', requested: 12, available: 10 },
      { name: 'Горох', requested: 4, available: 0 },
    ])).toBe('Редис: заказано 12, на складе 10; Горох: заказано 4, на складе 0');
  });
});
