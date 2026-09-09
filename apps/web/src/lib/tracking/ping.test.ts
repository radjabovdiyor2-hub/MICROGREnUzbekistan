import { describe, expect, it } from 'vitest';

import {
  GAP_MS,
  MAX_BATCH,
  dropJumps,
  groupByLocalDay,
  readPing,
  readPingBatch,
  summarize,
  type TrackPingInput,
} from './ping';

// Самарканд, центр. Все точки ниже — вокруг него, чтобы расстояния были
// правдоподобными, а не «через полмира».
const BASE = { latitude: 39.654, longitude: 66.9597 };
const NOW = new Date('2026-09-09T12:00:00');

function raw(over: Record<string, unknown> = {}) {
  return {
    at: NOW.getTime() - 60_000,
    latitude: BASE.latitude,
    longitude: BASE.longitude,
    accuracyM: 12,
    source: 'telegram_live',
    ...over,
  };
}

/** Крошка в `metersEast` метрах восточнее базы, через `secAgo` секунд. */
function ping(secAgo: number, metersEast = 0, over: Partial<TrackPingInput> = {}): TrackPingInput {
  return {
    at: new Date(NOW.getTime() - secAgo * 1000),
    latitude: BASE.latitude,
    // На широте Самарканда градус долготы — примерно 86 км.
    longitude: BASE.longitude + metersEast / 86_000,
    accuracyM: 10,
    source: 'telegram_live',
    speedMps: null,
    headingDeg: null,
    ...over,
  };
}

describe('readPing', () => {
  it('принимает честную крошку', () => {
    const result = readPing(raw(), NOW);
    expect(result?.latitude).toBe(BASE.latitude);
    expect(result?.accuracyM).toBe(12);
    expect(result?.source).toBe('telegram_live');
  });

  it('отбрасывает ноль-ноль: это Атлантика, а не Самарканд', () => {
    expect(readPing(raw({ latitude: 0, longitude: 0 }), NOW)).toBeNull();
  });

  it('отбрасывает NaN и координаты вне глобуса', () => {
    expect(readPing(raw({ latitude: 'abc' }), NOW)).toBeNull();
    expect(readPing(raw({ latitude: 91 }), NOW)).toBeNull();
    expect(readPing(raw({ longitude: -181 }), NOW)).toBeNull();
  });

  it('не принимает замер из будущего: он ломает порядок трека', () => {
    expect(readPing(raw({ at: NOW.getTime() + 10 * 60_000 }), NOW)).toBeNull();
  });

  it('не принимает замер старше недели', () => {
    expect(readPing(raw({ at: NOW.getTime() - 8 * 24 * 3600_000 }), NOW)).toBeNull();
  });

  it('отбрасывает неизвестный источник', () => {
    expect(readPing(raw({ source: 'satellite' }), NOW)).toBeNull();
    expect(readPing(raw({ source: undefined }), NOW)).toBeNull();
  });

  it('точность и скорость необязательны — без них крошка остаётся годной', () => {
    const result = readPing(raw({ accuracyM: undefined, speedMps: undefined }), NOW);
    expect(result).not.toBeNull();
    expect(result?.accuracyM).toBeNull();
    expect(result?.speedMps).toBeNull();
  });

  it('курс вне 0..359 отбрасывается, сама крошка — нет', () => {
    expect(readPing(raw({ headingDeg: 360 }), NOW)?.headingDeg).toBeNull();
    expect(readPing(raw({ headingDeg: 359 }), NOW)?.headingDeg).toBe(359);
  });
});

describe('readPingBatch', () => {
  it('один кривой замер не роняет всю пачку', () => {
    const batch = readPingBatch(
      [raw(), raw({ latitude: 0, longitude: 0 }), raw({ at: NOW.getTime() - 30_000 })],
      NOW,
    );
    expect(batch).toHaveLength(2);
  });

  it('сортирует по времени: порядок прихода ничем не гарантирован', () => {
    const batch = readPingBatch(
      [raw({ at: NOW.getTime() - 10_000 }), raw({ at: NOW.getTime() - 90_000 })],
      NOW,
    );
    expect(batch[0].at.getTime()).toBeLessThan(batch[1].at.getTime());
  });

  it('обрезает пачку по MAX_BATCH', () => {
    const many = Array.from({ length: MAX_BATCH + 50 }, (_, i) =>
      raw({ at: NOW.getTime() - (i + 1) * 1000 }),
    );
    expect(readPingBatch(many, NOW).length).toBeLessThanOrEqual(MAX_BATCH);
  });

  it('не массив — пустая пачка, а не исключение', () => {
    expect(readPingBatch(null, NOW)).toEqual([]);
    expect(readPingBatch({ at: 1 }, NOW)).toEqual([]);
  });
});

describe('dropJumps', () => {
  it('выбрасывает прыжок GPS: за секунду на километр не уезжают', () => {
    const kept = dropJumps([ping(10), ping(9, 1000), ping(8, 5)]);
    expect(kept).toHaveLength(2);
    // Осталась опора и последняя честная точка, а не хвост после выброса.
    expect(kept[1].longitude).toBeCloseTo(BASE.longitude + 5 / 86_000, 6);
  });

  it('опора не уезжает за выбросом — хвост честных точек выживает', () => {
    const kept = dropJumps([ping(30), ping(29, 90_000), ping(20, 10), ping(10, 20)]);
    expect(kept).toHaveLength(3);
  });

  it('две крошки в одну секунду: вторая — дубль', () => {
    expect(dropJumps([ping(10), ping(10, 3)])).toHaveLength(1);
  });
});

describe('summarize', () => {
  it('считает путь по соседним крошкам', () => {
    const { meters } = summarize([ping(60), ping(30, 300), ping(0, 600)]);
    expect(meters).toBeGreaterThan(560);
    expect(meters).toBeLessThan(640);
  });

  it('разрыв связи не идёт в путь: прямая через полгорода — не дорога', () => {
    const long = GAP_MS / 1000 + 60;
    const { meters, gaps } = summarize([ping(long + 10, 0), ping(0, 4000)]);
    expect(gaps).toBe(1);
    expect(meters).toBe(0);
  });

  it('телефон на столе не набегает время в движении', () => {
    // Дрожание координаты на пару метров за минуту — это стоянка.
    const { movingSec } = summarize([ping(120), ping(60, 2), ping(0, 4)]);
    expect(movingSec).toBe(0);
  });

  it('поездка даёт время в движении', () => {
    const { movingSec } = summarize([ping(120), ping(60, 600), ping(0, 1200)]);
    expect(movingSec).toBe(120);
  });

  it('пустой и одиночный трек не ломают арифметику', () => {
    expect(summarize([])).toEqual({ meters: 0, movingSec: 0, gaps: 0 });
    expect(summarize([ping(0)])).toEqual({ meters: 0, movingSec: 0, gaps: 0 });
  });
});

describe('groupByLocalDay', () => {
  it('раскладывает по МЕСТНЫМ суткам, а не по UTC', () => {
    // 00:30 по местному времени — это ещё «сегодня», хотя по UTC вчера.
    const early = { ...ping(0), at: new Date('2026-09-09T00:30:00') };
    const late = { ...ping(0), at: new Date('2026-09-08T23:30:00') };
    const days = groupByLocalDay([late, early]);
    expect([...days.keys()].sort()).toEqual(['2026-09-08', '2026-09-09']);
  });

  it('весь день в одной корзине', () => {
    const days = groupByLocalDay([ping(3600), ping(1800), ping(0)]);
    expect(days.size).toBe(1);
    expect([...days.values()][0]).toHaveLength(3);
  });
});
