import { describe, expect, it, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Продажа на кассе при нулевом остатке.
//
// После перехода каталога на прайс все товары создались заново с нулём, и
// касса встала: корзина молча не принимала товар, а сервер отвечал
// «omborda yetarli emas». При этом сайт в такой же ситуации заказ принимает —
// микрозелень растят под заказ, и это прямо заложено в lib/orders/afterCreate.
//
// Отказ по остатку на кассе означал буквально следующее: товар лежит на
// прилавке, покупатель у кассы, а чек не проходит из-за отставшего числа.
// ══════════════════════════════════════════════════════════════════════

const tx = {
  product: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  stockMovement: { create: vi.fn() },
  debt: { create: vi.fn() },
};

vi.mock('@repo/database', () => ({
  prisma: {
    product: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

vi.mock('@/lib/orders/notify', () => ({
  notifyOfficePosSale: vi.fn(async () => undefined),
}));

import { prisma } from '@repo/database';
import { processSale } from './sale';

const PRODUCT = {
  id: 'p1',
  nameUz: "Rukkola",
  stock: 0,
  price: 25_000,
  costPrice: 10_000,
};

function request(items: unknown) {
  return {
    json: async () => ({ items, paymentMethod: 'cash', performedBy: 'Egasi' }),
  } as unknown as Parameters<typeof processSale>[0];
}

describe('касса при нулевом остатке', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([PRODUCT]);
    // Условное списание не срабатывает: остатка нет.
    tx.product.updateMany.mockResolvedValue({ count: 0 });
    tx.product.findUnique.mockResolvedValue({ stock: 0 });
    tx.stockMovement.create.mockResolvedValue({});
  });

  it('продажа проходит, а не отклоняется', async () => {
    const res = await processSale(request([{ productId: 'p1', quantity: 2, price: 25_000 }]));
    expect(res.status).not.toBe(400);
  });

  it('остаток не уходит в минус', async () => {
    await processSale(request([{ productId: 'p1', quantity: 2, price: 25_000 }]));
    // Ни одного вычитания без нижней границы: остаток либо уменьшается при
    // достаточном запасе, либо зажимается нулём.
    for (const call of tx.product.updateMany.mock.calls) {
      const where = call[0].where as { stock?: { gte?: number; gt?: number } };
      expect(where.stock?.gte ?? where.stock?.gt).toBeDefined();
    }
  });

  it('нехватка записана в журнал склада', async () => {
    await processSale(request([{ productId: 'p1', quantity: 2, price: 25_000 }]));
    const movement = tx.stockMovement.create.mock.calls[0][0].data;
    expect(movement.note).toContain('сверх остатка');
    // Выручка не теряется: цена продажи в движении обязательна, по ней
    // считается касса в lib/revenue.
    expect(movement.salePrice).toBe(25_000);
  });

  it('несуществующий товар по-прежнему отклоняется', async () => {
    (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await processSale(request([{ productId: 'нет', quantity: 1, price: 1 }]));
    expect(res.status).toBe(404);
  });

  it('пустой чек по-прежнему отклоняется', async () => {
    const res = await processSale(request([]));
    expect(res.status).toBe(400);
  });
});
