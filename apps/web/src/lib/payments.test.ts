import { vi, describe, it, expect, beforeEach } from 'vitest';

// Мок БД и side-effect синхронизации заказа — тестируем чистую маршрутизацию payable.
vi.mock('@repo/database', () => ({
  prisma: {
    printOrder: { findUnique: vi.fn(), update: vi.fn() },
    order: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('./orderSync', () => ({ syncOrderPaid: vi.fn() }));

import { prisma } from '@repo/database';
import { findPayableByRef, markPayablePaid } from './payments';

const db = prisma as unknown as {
  printOrder: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  order: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('payments · findPayableByRef', () => {
  it('префикс print_<id> → PrintOrder, amount = revenue', async () => {
    db.printOrder.findUnique.mockResolvedValue({ id: 'abc', revenue: 800_000, status: 'pending' });
    const p = await findPayableByRef('print_abc');
    expect(db.printOrder.findUnique).toHaveBeenCalledWith({ where: { id: 'abc' } });
    expect(p).toEqual({ kind: 'print', id: 'abc', amount: 800_000, paid: false });
    // storefront-путь не задет
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });

  it('оплаченный PrintOrder → paid: true', async () => {
    db.printOrder.findUnique.mockResolvedValue({ id: 'abc', revenue: 800_000, status: 'paid' });
    expect((await findPayableByRef('print_abc'))?.paid).toBe(true);
  });

  it('обычный ref → storefront Order, amount = total', async () => {
    db.order.findUnique.mockResolvedValueOnce({ id: 'ord1', total: 50_000, paymentStatus: 'PENDING' });
    const p = await findPayableByRef('ord1');
    expect(p).toEqual({ kind: 'order', id: 'ord1', amount: 50_000, paid: false });
    expect(db.printOrder.findUnique).not.toHaveBeenCalled();
  });

  it('несуществующий print → null', async () => {
    db.printOrder.findUnique.mockResolvedValue(null);
    expect(await findPayableByRef('print_missing')).toBeNull();
  });

  it('пустой ref → null', async () => {
    expect(await findPayableByRef('')).toBeNull();
  });
});

describe('payments · markPayablePaid (PrintOrder)', () => {
  it('идемпотентен: уже оплаченный тираж не апдейтится повторно', async () => {
    db.printOrder.findUnique.mockResolvedValue({ id: 'abc', status: 'paid' });
    const r = await markPayablePaid('print_abc');
    expect(db.printOrder.update).not.toHaveBeenCalled();
    expect(r?.status).toBe('paid');
  });

  it('pending тираж → помечается paid c paidAt', async () => {
    db.printOrder.findUnique.mockResolvedValue({ id: 'abc', status: 'pending' });
    db.printOrder.update.mockResolvedValue({ id: 'abc', status: 'paid' });
    await markPayablePaid('print_abc');
    expect(db.printOrder.update).toHaveBeenCalledTimes(1);
    const arg = db.printOrder.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'abc' });
    expect(arg.data.status).toBe('paid');
    expect(arg.data.paidAt).toBeInstanceOf(Date);
  });
});
