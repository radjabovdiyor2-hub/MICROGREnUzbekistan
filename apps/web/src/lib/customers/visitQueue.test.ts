import { describe, it, expect, beforeEach } from 'vitest';

import {
  MAX_AGE_MS,
  MAX_QUEUE,
  VISIT_QUEUE_KEY,
  dequeue,
  enqueue,
  readQueue,
  splitByAge,
  visitKey,
  writeQueue,
  type QueueStorage,
  type QueuedVisit,
} from './visitQueue';

// ══════════════════════════════════════════════════════════════════════
// Очередь отметок, сделанных без связи.
//
// Проверяется то, из-за чего очередь хуже её отсутствия: потерянная
// отметка (человек съездил зря), удвоенная (два визита вместо одного) и
// застрявшая навсегда — с типом, которого справочник больше не знает.
// ══════════════════════════════════════════════════════════════════════

function fakeStorage(onSet?: () => void): QueueStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => {
      onSet?.();
      raw.set(k, v);
    },
  };
}

const NOW = new Date('2026-08-22T10:00:00').getTime();

function visit(over: Partial<QueuedVisit> = {}): QueuedVisit {
  const customerId = over.customerId ?? 7;
  const visitedAt = over.visitedAt ?? NOW;
  return {
    key: over.key ?? visitKey(customerId, visitedAt),
    customerId,
    type: over.type ?? 'visit_deal',
    note: over.note ?? '',
    visitedAt,
  };
}

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
});

describe('постановка в очередь', () => {
  it('дребезг кнопки не удваивает визит', () => {
    const once = enqueue([], visit());
    expect(enqueue(once, visit())).toHaveLength(1);
  });

  it('«не застал», а через час «договорились» — два разных события', () => {
    // Оба обязаны доехать: это история одного дня, а не опечатка.
    const first = enqueue([], visit({ type: 'visit_absent', visitedAt: NOW }));
    const both = enqueue(first, visit({ type: 'visit_deal', visitedAt: NOW + 3_600_000 }));
    expect(both).toHaveLength(2);
  });

  it('потолок держится: очередь живёт в общем хранилище', () => {
    let queue: QueuedVisit[] = [];
    for (let i = 0; i < MAX_QUEUE + 10; i++) {
      queue = enqueue(queue, visit({ customerId: i, visitedAt: NOW + i }));
    }
    expect(queue).toHaveLength(MAX_QUEUE);
  });

  it('длинная заметка режется, а не теряет всю отметку', () => {
    const long = enqueue([], visit({ note: 'я'.repeat(900) }));
    expect(long[0].note.length).toBeLessThanOrEqual(500);
  });
});

describe('чтение из хранилища', () => {
  it('возвращает то, что положили', () => {
    writeQueue([visit()], store);
    expect(readQueue(store)).toHaveLength(1);
  });

  it('запись с типом, которого справочник больше не знает, выбрасывается', () => {
    // Иначе она застрянет навсегда: сервер ответит 400, а очередь будет
    // пробовать снова при каждом появлении связи.
    store.raw.set(
      VISIT_QUEUE_KEY,
      JSON.stringify([visit(), { ...visit({ customerId: 9 }), type: 'visit_выдумка' }]),
    );
    expect(readQueue(store).map((v) => v.customerId)).toEqual([7]);
  });

  it('мусор не роняет карту', () => {
    store.raw.set(VISIT_QUEUE_KEY, 'не json');
    expect(readQueue(store)).toEqual([]);

    store.raw.set(VISIT_QUEUE_KEY, '{"а":1}');
    expect(readQueue(store)).toEqual([]);
  });

  it('без хранилища — пусто, а не исключение', () => {
    expect(readQueue(null)).toEqual([]);
    expect(writeQueue([visit()], null)).toBe(false);
  });

  it('отказ хранилища не поднимает исключение', () => {
    const failing = fakeStorage(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeQueue([visit()], failing)).not.toThrow();
    expect(writeQueue([visit()], failing)).toBe(false);
  });
});

describe('отправленное уходит из очереди', () => {
  it('убирается ровно одна запись', () => {
    const queue = [visit({ customerId: 1, visitedAt: NOW }), visit({ customerId: 2, visitedAt: NOW })];
    expect(dequeue(queue, visitKey(1, NOW)).map((v) => v.customerId)).toEqual([2]);
  });

  it('чужой ключ ничего не трогает', () => {
    const queue = [visit()];
    expect(dequeue(queue, 'выдумка')).toHaveLength(1);
  });
});

describe('протухшие отметки', () => {
  it('старше недели отделяются от свежих', () => {
    // Отправить их молча значило бы записать в журнал задним числом то,
    // о чём человек уже не помнит подробностей.
    const old = visit({ customerId: 1, visitedAt: NOW - MAX_AGE_MS - 1 });
    const fresh = visit({ customerId: 2, visitedAt: NOW - 60_000 });
    const split = splitByAge([old, fresh], NOW);
    expect(split.stale.map((v) => v.customerId)).toEqual([1]);
    expect(split.fresh.map((v) => v.customerId)).toEqual([2]);
  });

  it('ровно на границе — ещё свежая', () => {
    const edge = visit({ visitedAt: NOW - MAX_AGE_MS });
    expect(splitByAge([edge], NOW).fresh).toHaveLength(1);
  });
});
