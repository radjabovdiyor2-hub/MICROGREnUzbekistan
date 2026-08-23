import { describe, expect, it } from 'vitest';

import {
  BACKDATE_AFTER_MS,
  MAX_AGE_MS,
  MAX_QUEUE,
  dequeue,
  enqueue,
  newClientKey,
  readQueue,
  splitByAge,
  toRequestBody,
  writeQueue,
  type QueuedSale,
  type QueueStorage,
} from './saleQueue';

// ══════════════════════════════════════════════════════════════════════
// Очередь чеков, пробитых без связи.
//
// За каждой записью здесь стоит отданный товар и взятые деньги, поэтому
// цена ошибки выше, чем у очереди визитов: потерянная запись — это
// недостача, а отправленная дважды — вторая выручка и второе списание.
// ══════════════════════════════════════════════════════════════════════

function storage(initial?: string): QueueStorage & { value: string | null } {
  const box = {
    value: initial ?? null,
    getItem: () => box.value,
    setItem: (_k: string, v: string) => {
      box.value = v;
    },
  };
  return box;
}

function sale(key: string, soldAt = Date.now()): QueuedSale {
  return {
    key,
    soldAt,
    label: 'Плов Центр · 26 000',
    body: {
      items: [{ productId: 'p1', quantity: 2, price: 13_000 }],
      paymentMethod: 'cash',
      customerId: 42,
      performedBy: 'Aziz',
      origin: 'field',
      clientKey: key,
    },
  };
}

describe('постановка в очередь', () => {
  it('тот же ключ второй раз — тот же чек, а не новый', () => {
    const once = enqueue([], sale('k1'));
    expect(enqueue(once, sale('k1'))).toHaveLength(1);
  });

  it('разные чеки копятся', () => {
    expect(enqueue(enqueue([], sale('k1')), sale('k2'))).toHaveLength(2);
  });

  it('потолок очереди не пробивается', () => {
    let queue: QueuedSale[] = [];
    for (let i = 0; i < MAX_QUEUE + 5; i++) queue = enqueue(queue, sale(`k${i}`));
    expect(queue).toHaveLength(MAX_QUEUE);
  });

  it('снятие с очереди убирает ровно один чек', () => {
    const queue = enqueue(enqueue([], sale('k1')), sale('k2'));
    expect(dequeue(queue, 'k1').map((q) => q.key)).toEqual(['k2']);
  });
});

describe('чтение хранилища', () => {
  it('мусор не роняет кассу', () => {
    expect(readQueue(storage('не json'))).toEqual([]);
    expect(readQueue(storage('{"a":1}'))).toEqual([]);
    expect(readQueue(null)).toEqual([]);
  });

  it('запись и чтение возвращают то же самое', () => {
    const box = storage();
    writeQueue([sale('k1')], box);
    expect(readQueue(box).map((q) => q.key)).toEqual(['k1']);
  });

  it('чек с разошедшимся ключом отбрасывается', () => {
    // Ключ очереди и ключ идемпотентности обязаны совпадать: разойдись
    // они — и повторная отправка удвоила бы продажу.
    const broken = { ...sale('k1'), body: { ...sale('k1').body, clientKey: 'другой' } };
    expect(readQueue(storage(JSON.stringify([broken])))).toEqual([]);
  });

  it('чек без позиций отбрасывается', () => {
    const broken = { ...sale('k1'), body: { ...sale('k1').body, items: [] } };
    expect(readQueue(storage(JSON.stringify([broken])))).toEqual([]);
  });

  it('нецелая цена отбрасывается — сумма чека считается в сумах', () => {
    const broken = {
      ...sale('k1'),
      body: { ...sale('k1').body, items: [{ productId: 'p1', quantity: 1, price: 10.5 }] },
    };
    expect(readQueue(storage(JSON.stringify([broken])))).toEqual([]);
  });
});

describe('срок жизни', () => {
  it('свежее досылаем, протухшее — нет', () => {
    const now = Date.now();
    const { fresh, stale } = splitByAge(
      [sale('fresh', now - 1000), sale('old', now - MAX_AGE_MS - 1000)],
      now,
    );
    expect(fresh.map((q) => q.key)).toEqual(['fresh']);
    expect(stale.map((q) => q.key)).toEqual(['old']);
  });
});

describe('тело отложенного чека', () => {
  it('связь моргнула — деловая дата не меняется', () => {
    const now = Date.now();
    const body = toRequestBody(sale('k1', now - 1000), now);
    expect(body.soldAt).toBeUndefined();
    expect(body.backdateReason).toBeUndefined();
  });

  it('чек пролежал — уходит своей датой и с причиной', () => {
    const now = Date.now();
    const body = toRequestBody(sale('k1', now - BACKDATE_AFTER_MS - 1000), now);
    expect(typeof body.soldAt).toBe('string');
    // Сервер требует причину не короче трёх символов — без неё честный
    // офлайн-чек получил бы 400 и был бы выброшен как негодный.
    expect(String(body.backdateReason).length).toBeGreaterThan(3);
  });

  it('пролежавший чек объясняет свою цену', () => {
    const now = Date.now();
    const body = toRequestBody(sale('k1', now - BACKDATE_AFTER_MS - 1000), now);
    // Прайс за время без связи мог поменяться, и позиция без причины
    // получила бы «narx o'zgartirilgan, sabab majburiy».
    const items = body.items as { priceReason?: string }[];
    expect(items[0].priceReason).toContain('офлайн');
  });

  it('своя причина уступки не затирается', () => {
    const now = Date.now();
    const withReason = sale('k1', now - BACKDATE_AFTER_MS - 1000);
    withReason.body.items[0].priceReason = 'Договорная цена клиента';
    const items = toRequestBody(withReason, now).items as { priceReason?: string }[];
    expect(items[0].priceReason).toBe('Договорная цена клиента');
  });

  it('ключ идемпотентности едет вместе с чеком', () => {
    expect(toRequestBody(sale('k1')).clientKey).toBe('k1');
  });
});

describe('ключ идемпотентности', () => {
  it('каждый раз новый', () => {
    expect(newClientKey()).not.toBe(newClientKey());
  });

  it('помещается в колонку VarChar(64)', () => {
    expect(newClientKey().length).toBeLessThanOrEqual(64);
  });
});
