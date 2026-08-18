import { describe, expect, it, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Возврат дробного количества.
//
// Количества стали дробными, и сверка «вернули не больше проданного» пошла
// по числам с плавающей точкой: 1.3 в double чуть-чуть не 1.3. Строгое
// сравнение отбивало бы возврат РОВНО проданного количества — товар принесли
// целиком, а касса отвечает «столько не продавали». Допуск при этом обязан
// оставаться меньше половины хранимого знака, иначе лишнее пройдёт.
//
// Второе: номер чека переехал в колонку `saleNumber`, но у строк, записанных
// до неё, колонка пустая. Поиск обязан находить и такие — иначе возврат по
// старому чеку отвечал бы «Sotish topilmadi» на заведомо бывшую продажу.
// ══════════════════════════════════════════════════════════════════════

const tx = {
  stockMovement: { create: vi.fn() },
  product: { update: vi.fn() },
  posSale: { create: vi.fn(), findUnique: vi.fn() },
};

const findMany = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    stockMovement: { findMany: (...args: unknown[]) => findMany(...args) },
    product: { findMany: vi.fn(async () => [PRODUCT]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

import { processRefund } from './refund';

const PRODUCT = { id: 'p1', nameUz: 'Frize', unit: 'кг', stock: 0, price: 15_000 };
const SALE = 'S-20260818-ABCD1234';

interface Item { productId: string; quantity: number; price: number }

function request(items: Item[], saleNumber = SALE) {
  return {
    json: async () => ({ items, reason: 'брак', performedBy: 'Aziz', saleNumber }),
  } as unknown as Parameters<typeof processRefund>[0];
}

/** Первый вызов findMany — проданное, второй — уже возвращённое. */
function ledger(sold: number, returned: number) {
  findMany.mockReset();
  findMany
    .mockResolvedValueOnce(sold > 0 ? [{ productId: 'p1', quantity: -sold }] : [])
    .mockResolvedValueOnce(returned > 0 ? [{ productId: 'p1', quantity: returned }] : []);
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.stockMovement.create.mockResolvedValue({});
  tx.product.update.mockResolvedValue({});
  tx.posSale.create.mockResolvedValue({ id: 'refund-1' });
  tx.posSale.findUnique.mockResolvedValue({ id: 'sale-1' });
});

describe('дробный возврат', () => {
  it('возврат ровно проданного количества проходит', async () => {
    ledger(1.3, 0);
    const res = await processRefund(request([{ productId: 'p1', quantity: 1.3, price: 15_000 }]));
    expect(res.status).not.toBe(400);
  });

  it('часть проданного вернуть можно', async () => {
    ledger(1.3, 0);
    const res = await processRefund(request([{ productId: 'p1', quantity: 0.5, price: 15_000 }]));
    expect(res.status).not.toBe(400);
    expect(tx.stockMovement.create.mock.calls[0][0].data.quantity).toBe(0.5);
  });

  it('на сотую больше проданного — отказ', async () => {
    ledger(1.3, 0);
    const res = await processRefund(request([{ productId: 'p1', quantity: 1.31, price: 15_000 }]));
    expect(res.status).toBe(400);
  });

  it('повторный возврат сверх остатка не проходит', async () => {
    ledger(1.3, 1);
    const res = await processRefund(request([{ productId: 'p1', quantity: 0.5, price: 15_000 }]));
    expect(res.status).toBe(400);
  });

  it('остаток возвращается дробным, а не округлённым', async () => {
    ledger(1.3, 0);
    await processRefund(request([{ productId: 'p1', quantity: 1.3, price: 15_000 }]));
    expect(tx.product.update.mock.calls[0][0].data.stock.increment).toBe(1.3);
  });

  it('сумма возврата округляется по позиции', async () => {
    ledger(1.5, 0);
    const res = await processRefund(request([{ productId: 'p1', quantity: 1.5, price: 13_001 }]));
    expect((await res.json()).totalRefund).toBe(19_502);
  });

  it('три знака после запятой отклоняются', async () => {
    ledger(2, 0);
    const res = await processRefund(request([{ productId: 'p1', quantity: 1.234, price: 15_000 }]));
    expect(res.status).toBe(400);
  });

  it('несуществующий чек — 404', async () => {
    ledger(0, 0);
    const res = await processRefund(request([{ productId: 'p1', quantity: 1, price: 15_000 }]));
    expect(res.status).toBe(404);
  });

  it('без номера чека возврат не проходит', async () => {
    ledger(1, 0);
    const res = await processRefund(request([{ productId: 'p1', quantity: 1, price: 15_000 }], ''));
    expect(res.status).toBe(400);
  });
});

describe('поиск исходной продажи', () => {
  it('ищет и по колонке, и по тексту причины', async () => {
    // Колонка `saleNumber` появилась позже самих продаж: у старых строк она
    // пустая, и без второго условия возврат по такому чеку не нашёлся бы.
    ledger(1, 0);
    await processRefund(request([{ productId: 'p1', quantity: 1, price: 15_000 }]));
    const where = findMany.mock.calls[0][0].where as { OR?: unknown[] };
    expect(where.OR).toEqual([
      { sale: { number: SALE } },
      { reason: { contains: SALE } },
    ]);
  });

  it('возврат получает свою шапку со ссылкой на исходную продажу', async () => {
    ledger(1, 0);
    await processRefund(request([{ productId: 'p1', quantity: 1, price: 15_000 }]));
    const head = tx.posSale.create.mock.calls[0][0].data;
    expect(String(head.number).startsWith('R-')).toBe(true);
    expect(head.kind).toBe('refund');
    // Ссылка внешним ключом, а не вхождением номера в текст причины.
    expect(head.refundOfId).toBe('sale-1');
    expect(tx.stockMovement.create.mock.calls[0][0].data.saleId).toBe('refund-1');
  });
});
