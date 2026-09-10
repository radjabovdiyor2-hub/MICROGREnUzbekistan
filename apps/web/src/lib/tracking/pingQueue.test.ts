import { describe, expect, it } from 'vitest';

import {
  MAX_ACCURACY_M,
  MAX_QUEUE,
  MIN_INTERVAL_MS,
  PING_QUEUE_KEY,
  enqueue,
  readQueue,
  shouldKeep,
  takeBatch,
  writeQueue,
  type QueuedPing,
} from './pingQueue';
import { MAX_BATCH } from './ping';

// Здесь решают, какая крошка попадёт в день человека, а какая исчезнет
// навсегда. Ошибка в любую сторону тихая: слишком строго — день пустой и
// «человек никуда не ездил»; слишком мягко — трек дрожит и пробег врёт.

const base: QueuedPing = {
  at: 1_700_000_000_000,
  latitude: 39.654,
  longitude: 66.9597,
  accuracyM: 20,
  source: 'pwa',
  speedMps: null,
  headingDeg: null,
};

/** Точка, смещённая на север примерно на `m` метров. */
function moved(from: QueuedPing, m: number, afterMs: number): QueuedPing {
  return { ...from, at: from.at + afterMs, latitude: from.latitude + m / 111_320 };
}

describe('shouldKeep', () => {
  it('первую крошку берём всегда', () => {
    expect(shouldKeep(null, base)).toBe(true);
  });

  it('прошёл интервал — берём, даже если человек стоял', () => {
    // Стоянка тоже факт: без точек «стоял у клиента час» неотличимо от
    // «выключил телефон».
    expect(shouldKeep(base, { ...base, at: base.at + MIN_INTERVAL_MS })).toBe(true);
  });

  it('интервал не прошёл и человек на месте — пропускаем', () => {
    expect(shouldKeep(base, moved(base, 3, 5_000))).toBe(false);
  });

  it('интервал не прошёл, но человек уехал — берём', () => {
    // Машина на проспекте: ждать сорок пять секунд значит считать путь по
    // хорде через кварталы.
    expect(shouldKeep(base, moved(base, 300, 5_000))).toBe(true);
  });

  it('замер хуже допустимого радиуса — не позиция, а догадка по вышке', () => {
    expect(shouldKeep(null, { ...base, accuracyM: MAX_ACCURACY_M + 1 })).toBe(false);
  });

  it('радиус ровно на границе ещё принимаем', () => {
    expect(shouldKeep(null, { ...base, accuracyM: MAX_ACCURACY_M })).toBe(true);
  });

  it('радиус не сообщён — это не повод выбрасывать замер', () => {
    // NULL означает «источник промолчал», а не «точность плохая».
    expect(shouldKeep(null, { ...base, accuracyM: null })).toBe(true);
  });

  it('крошка из прошлого относительно принятой — сбитые часы, пропускаем', () => {
    // Порядок трека важнее одной точки: замер «назад во времени» дал бы
    // отрицательный отрезок и сломал бы арифметику дня.
    expect(shouldKeep(base, { ...base, at: base.at - 1_000 })).toBe(false);
    expect(shouldKeep(base, { ...base, at: base.at })).toBe(false);
  });
});

describe('enqueue', () => {
  it('добавляет в конец', () => {
    // Время передаём явно: иначе проверка зависела бы от настенных
    // часов и однажды покраснела бы оттого, что фикстура состарилась.
    const q = enqueue([base], moved(base, 100, 60_000), base.at);
    expect(q).toHaveLength(2);
    expect(q[1].at).toBeGreaterThan(q[0].at);
  });

  it('при переполнении режет СТАРОЕ, а не новое', () => {
    // Свежий хвост отвечает на вопрос «где человек сейчас»; утренний
    // отрезок к этому моменту почти всегда уже отправлен.
    const full = Array.from({ length: MAX_QUEUE }, (_, i) => ({ ...base, at: base.at + i }));
    const q = enqueue(full, { ...base, at: base.at + 999_999 }, base.at);
    expect(q).toHaveLength(MAX_QUEUE);
    expect(q[q.length - 1].at).toBe(base.at + 999_999);
    expect(q[0].at).toBe(base.at + 1);
  });

  it('выбрасывает то, что старше срока хранения', () => {
    const old = { ...base, at: base.at - 8 * 24 * 60 * 60 * 1000 };
    const q = enqueue([old], base, base.at);
    expect(q).toHaveLength(1);
    expect(q[0].at).toBe(base.at);
  });
});

describe('takeBatch', () => {
  it('не отдаёт больше, чем принимает сервер', () => {
    // Всё сверх `MAX_BATCH` сервер молча отрежет, а очередь сочла бы
    // отправленным — и хвост пачки пропал бы без следа.
    const many = Array.from({ length: MAX_BATCH + 10 }, (_, i) => ({ ...base, at: base.at + i }));
    expect(takeBatch(many)).toHaveLength(MAX_BATCH);
  });
});

/** Хранилище в памяти: тесты не должны зависеть от окружения браузера. */
function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    data,
  };
}

describe('очередь в хранилище', () => {
  it('записанное читается обратно', () => {
    const s = memory();
    writeQueue(s, [base]);
    expect(readQueue(s)).toEqual([base]);
  });

  it('пусто — пустая очередь, а не падение', () => {
    expect(readQueue(memory())).toEqual([]);
  });

  it('мусор в хранилище — пустая очередь, а не падение', () => {
    // Чужая вкладка, старая версия, оборванная запись: потерять экран
    // целиком из-за одной битой строки нельзя.
    expect(readQueue(memory({ [PING_QUEUE_KEY]: 'не json' }))).toEqual([]);
    expect(readQueue(memory({ [PING_QUEUE_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it('битые записи отсеиваются поштучно, целые остаются', () => {
    const raw = JSON.stringify([base, { latitude: 'нет' }, { ...base, at: base.at + 1 }]);
    expect(readQueue(memory({ [PING_QUEUE_KEY]: raw }))).toHaveLength(2);
  });

  it('отказ хранилища — false, а не исключение', () => {
    // Приватный режим и переполнение: запись при этом продолжается, она
    // просто не переживёт перезагрузку.
    const broken = {
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(writeQueue(broken, [base])).toBe(false);
  });
});
