import { describe, expect, it, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Касса: нулевой остаток, дробное количество, деловая дата и уступки.
//
// ПРО НУЛЕВОЙ ОСТАТОК
//
// После перехода каталога на прайс все товары создались заново с нулём, и
// касса встала: корзина молча не принимала товар, а сервер отвечал
// «omborda yetarli emas». При этом сайт в такой же ситуации заказ принимает —
// микрозелень растят под заказ, и это прямо заложено в lib/orders/afterCreate.
//
// Отказ по остатку на кассе означал буквально следующее: товар лежит на
// прилавке, покупатель у кассы, а чек не проходит из-за отставшего числа.
//
// ПРО ДЕЛОВУЮ ДАТУ
//
// Продажу, о которой вспомнили на следующий день, раньше можно было провести
// только сегодняшним числом — выручка ложилась не в тот день. Теперь дата
// задаётся явно, но правила у продавца и владельца разные, а тело запроса
// перестало быть источником правды об авторе чека.
// ══════════════════════════════════════════════════════════════════════

const tx = {
  product: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  stockMovement: { create: vi.fn() },
  debt: { create: vi.fn() },
  posSale: { create: vi.fn() },
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

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

import { prisma } from '@repo/database';
import { audit } from '@/lib/audit';
import { createSession, SESSION_COOKIE } from '@/lib/session';
import type { SessionRole } from '@/lib/session';
import { processSale } from './sale';

const PRODUCT = {
  id: 'p1',
  nameUz: 'Frize',
  unit: 'кг',
  stock: 0,
  price: 15_000,
  costPrice: 9_000,
};

interface Body {
  items: { productId: string; quantity: number; price: number; priceReason?: string }[];
  paymentMethod?: string;
  performedBy?: string;
  soldAt?: string;
  backdateReason?: string;
  discount?: { type: string; value: number; reason: string };
}

/** Запрос от сотрудника с подписанной сессией — как приходит из админки. */
async function request(body: Body, role: SessionRole = 'ADMIN', name = 'Egasi') {
  const token = await createSession({ role, name });
  return {
    json: async () => ({ paymentMethod: 'cash', ...body }),
    headers: new Headers({ cookie: `${SESSION_COOKIE}=${token}` }),
  } as unknown as Parameters<typeof processSale>[0];
}

const daysAgoIso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

const movements = () => tx.stockMovement.create.mock.calls.map((c) => c[0].data);
const header = () => tx.posSale.create.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-at-least-16-chars');
  (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([PRODUCT]);
  // Условное списание не срабатывает: остатка нет.
  tx.product.updateMany.mockResolvedValue({ count: 0 });
  tx.product.findUnique.mockResolvedValue({ stock: 0 });
  tx.stockMovement.create.mockResolvedValue({});
  tx.posSale.create.mockResolvedValue({ id: 'sale-1' });
});

describe('касса при нулевом остатке', () => {
  it('продажа проходит, а не отклоняется', async () => {
    const res = await processSale(await request({ items: [{ productId: 'p1', quantity: 2, price: 15_000 }] }));
    expect(res.status).not.toBe(400);
  });

  it('остаток не уходит в минус', async () => {
    await processSale(await request({ items: [{ productId: 'p1', quantity: 2, price: 15_000 }] }));
    // Ни одного вычитания без нижней границы: остаток либо уменьшается при
    // достаточном запасе, либо зажимается нулём.
    for (const call of tx.product.updateMany.mock.calls) {
      const where = call[0].where as { stock?: { gte?: number; gt?: number } };
      expect(where.stock?.gte ?? where.stock?.gt).toBeDefined();
    }
  });

  it('нехватка записана в журнал склада', async () => {
    await processSale(await request({ items: [{ productId: 'p1', quantity: 2, price: 15_000 }] }));
    const movement = movements()[0];
    expect(movement.note).toContain('сверх остатка');
    // Выручка не теряется: цена продажи в движении обязательна, по ней
    // считается касса в lib/revenue.
    expect(movement.salePrice).toBe(15_000);
  });

  it('несуществующий товар по-прежнему отклоняется', async () => {
    (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await processSale(await request({ items: [{ productId: 'нет', quantity: 1, price: 1 }] }));
    expect(res.status).toBe(404);
  });

  it('пустой чек по-прежнему отклоняется', async () => {
    const res = await processSale(await request({ items: [] }));
    expect(res.status).toBe(400);
  });
});

describe('дробное количество', () => {
  it('1.3 кг списывается как 1.3, а не как 1 или 2', async () => {
    await processSale(await request({ items: [{ productId: 'p1', quantity: 1.3, price: 15_000 }] }));
    expect(movements()[0].quantity).toBe(-1.3);
    expect(tx.product.updateMany.mock.calls[0][0].data.stock.decrement).toBe(1.3);
  });

  it('сумма чека округляется по позициям, а не в конце', async () => {
    const res = await processSale(await request({
      items: [
        { productId: 'p1', quantity: 1.5, price: 13_001, priceReason: 'оптом' },
        { productId: 'p1', quantity: 1.5, price: 13_001, priceReason: 'оптом' },
      ],
    }));
    // 19 501.5 → 19 502 на позицию. Округление общей суммы дало бы 39 003.
    expect((await res.json()).total).toBe(39_004);
  });

  it('три знака после запятой отклоняются — колонка хранит два', async () => {
    const res = await processSale(await request({ items: [{ productId: 'p1', quantity: 1.234, price: 15_000 }] }));
    expect(res.status).toBe(400);
  });
});

describe('уступка по цене', () => {
  it('без причины продажа не по прайсу не проходит', async () => {
    const res = await processSale(await request({ items: [{ productId: 'p1', quantity: 1.3, price: 13_000 }] }));
    expect(res.status).toBe(400);
  });

  it('с причиной проходит, а прайс остаётся в движении', async () => {
    await processSale(await request({
      items: [{ productId: 'p1', quantity: 1.3, price: 13_000, priceReason: 'опт от 1 кг' }],
    }));
    const movement = movements()[0];
    expect(movement.salePrice).toBe(13_000);
    // Без прайсовой цены уступку не с чем сравнить: сегодняшний прайс
    // к моменту вопроса уже поменяется.
    expect(movement.listPrice).toBe(15_000);
    // Причина — своей колонкой, а не строкой в примечании: «почему уступили»
    // спрашивают запросом, а не глазами.
    expect(movement.priceReason).toBe('опт от 1 кг');
  });

  it('уступка попадает в журнал действий', async () => {
    await processSale(await request({
      items: [{ productId: 'p1', quantity: 1.3, price: 13_000, priceReason: 'опт' }],
    }));
    const actions = (audit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].action);
    expect(actions).toContain('pos.price.override');
  });

  it('продажа по прайсу причины не требует', async () => {
    const res = await processSale(await request({ items: [{ productId: 'p1', quantity: 1, price: 15_000 }] }));
    expect(res.status).not.toBe(400);
  });
});

describe('скидка на весь чек', () => {
  it('уменьшает цену позиции, а не только итог', async () => {
    // Скидка обязана попасть в salePrice: выручка кассы считается как
    // quantity × salePrice, и иначе отчёт покажет сумму до скидки.
    const res = await processSale(await request({
      items: [{ productId: 'p1', quantity: 2, price: 15_000 }],
      discount: { type: 'percent', value: 10, reason: 'постоянный клиент' },
    }));
    const data = await res.json();
    expect(movements()[0].salePrice).toBe(13_500);
    // Скидка целиком описана в шапке чека, а не размазана по примечаниям.
    expect(header().discount).toBe(3_000);
    expect(header().discountReason).toBe('постоянный клиент');
    expect(data.gross).toBe(30_000);
    expect(data.total).toBe(27_000);
    expect(data.discount).toBe(3_000);
  });

  it('сумма движений совпадает с итогом чека', async () => {
    const res = await processSale(await request({
      items: [
        { productId: 'p1', quantity: 1.3, price: 15_000 },
        { productId: 'p1', quantity: 0.7, price: 15_000 },
      ],
      discount: { type: 'fixed', value: 5_000, reason: 'округлили' },
    }));
    const data = await res.json();
    const sum = movements().reduce(
      (acc, m) => acc + Math.round(m.salePrice * Math.abs(m.quantity)), 0,
    );
    expect(sum).toBe(data.total);
  });

  it('без причины скидка не принимается', async () => {
    const res = await processSale(await request({
      items: [{ productId: 'p1', quantity: 1, price: 15_000 }],
      discount: { type: 'percent', value: 10, reason: '' },
    }));
    expect(res.status).toBe(400);
  });
});

describe('продажа задним числом', () => {
  const item = { productId: 'p1', quantity: 1, price: 15_000 };

  it('деловая дата ложится в soldAt, а createdAt остаётся временем записи', async () => {
    const soldAt = daysAgoIso(2);
    await processSale(await request({ items: [item], soldAt, backdateReason: 'забыл провести' }));
    const movement = movements()[0];
    expect(new Date(movement.soldAt).toISOString()).toBe(soldAt);
    // createdAt не задаётся вовсе — его ставит база, и это время записи.
    expect(movement.createdAt).toBeUndefined();
    expect(header().backdated).toBe(true);
    expect(header().backdateReason).toBe('забыл провести');
  });

  it('номер чека строится от деловой даты', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const res = await processSale(await request({
      items: [item], soldAt: d.toISOString(), backdateReason: 'забыл провести',
    }));
    const expected = `S-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-`;
    expect((await res.json()).saleNumber.startsWith(expected)).toBe(true);
  });

  it('без причины не проходит', async () => {
    const res = await processSale(await request({ items: [item], soldAt: daysAgoIso(1) }));
    expect(res.status).toBe(400);
  });

  it('будущая дата не проходит даже у владельца', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const res = await processSale(await request({
      items: [item], soldAt: tomorrow.toISOString(), backdateReason: 'ошибка',
    }));
    expect(res.status).toBe(400);
  });

  it('продавцу глубже семи суток закрыто, а владельцу — нет', async () => {
    const old = daysAgoIso(30);
    const seller = await processSale(
      await request({ items: [item], soldAt: old, backdateReason: 'старая продажа' }, 'SELLER', 'Aziz'),
    );
    expect(seller.status).toBe(403);

    const owner = await processSale(
      await request({ items: [item], soldAt: old, backdateReason: 'старая продажа' }, 'ADMIN'),
    );
    expect(owner.status).not.toBe(403);
  });

  it('продавцу вчерашняя дата открыта', async () => {
    const res = await processSale(
      await request({ items: [item], soldAt: daysAgoIso(1), backdateReason: 'вчера забыл' }, 'SELLER', 'Aziz'),
    );
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
  });

  it('попадает в журнал действий', async () => {
    await processSale(await request({ items: [item], soldAt: daysAgoIso(1), backdateReason: 'вчера забыл' }));
    const actions = (audit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].action);
    expect(actions).toContain('pos.sale.backdated');
  });

  it('обычная продажа задним числом не считается', async () => {
    const res = await processSale(await request({ items: [item] }));
    expect((await res.json()).backdated).toBe(false);
    const actions = (audit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].action);
    expect(actions).not.toContain('pos.sale.backdated');
  });
});

describe('кто провёл продажу', () => {
  it('продавец не может подписать чек чужим именем', async () => {
    // Имя приходило строкой из тела и записывалось как есть — чек уходил
    // на чужую смену. Теперь у продавца оно берётся только из сессии.
    await processSale(
      await request({ items: [{ productId: 'p1', quantity: 1, price: 15_000 }], performedBy: 'Egasi' }, 'SELLER', 'Aziz'),
    );
    expect(movements()[0].performedBy).toBe('Aziz');
  });

  it('владелец заносит продажу за продавца', async () => {
    await processSale(
      await request({ items: [{ productId: 'p1', quantity: 1, price: 15_000 }], performedBy: 'Aziz' }, 'ADMIN'),
    );
    expect(movements()[0].performedBy).toBe('Aziz');
  });
});
