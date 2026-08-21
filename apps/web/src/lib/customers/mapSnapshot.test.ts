import { describe, it, expect, beforeEach } from 'vitest';

import {
  SNAPSHOT_KEY,
  SNAPSHOT_MAX_AGE_MS,
  SNAPSHOT_MAX_BYTES,
  readSnapshot,
  saveSnapshot,
  snapshotTime,
  type SnapshotStorage,
} from './mapSnapshot';
import type { MapCollection } from './mapQuery';

// ══════════════════════════════════════════════════════════════════════
// Снимок карты для езды без связи.
//
// Проверяется то, из-за чего снимок опаснее его отсутствия: показанный
// под ЧУЖИМИ фильтрами (человек решит, что тойхон в Ургуте сотня),
// вчерашний под видом свежего и раздутый до чужой квоты.
// ══════════════════════════════════════════════════════════════════════

/** Хранилище в памяти: окружение тестов узловое, localStorage там нет. */
function fakeStorage(onSet?: () => void): SnapshotStorage & { raw: Map<string, string> } {
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

function collection(features = 0): MapCollection {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: features }, (_, i) => ({
      type: 'Feature' as const,
      id: i,
      geometry: { type: 'Point' as const, coordinates: [66.9, 39.6] as [number, number] },
      properties: {
        n: `Точка ${i}`,
        t: 'b2b',
        st: 'healthy' as const,
        sp: 0,
        oc: 0,
        dl: null,
        ov: null,
        vt: 'low' as const,
        d: null,
        ct: 'cafe',
        au: null,
        gs: null,
        ph: null,
        ad: null,
        gp: null,
        lv: null,
        k: 'customer' as const,
      },
    })),
    summary: {
      total: features,
      placed: features,
      unplaced: 0,
      byState: { prospect: 0, new: 0, healthy: features, slipping: 0, at_risk: 0, lost: 0 },
      revenueByState: { prospect: 0, new: 0, healthy: 0, slipping: 0, at_risk: 0, lost: 0 },
      spentPercentiles: { p50: 0, p80: 0 },
      districts: [],
    },
    unplaced: [],
  };
}

const NOW = new Date('2026-08-21T14:20:00').getTime();

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
});

describe('сохранение', () => {
  it('снимок возвращается под тем же ключом', () => {
    expect(saveSnapshot(collection(3), 'all|all', NOW, store)).toBe(true);
    const back = readSnapshot('all|all', NOW, store);
    expect(back?.collection.features).toHaveLength(3);
    expect(back?.at).toBe(NOW);
  });

  it('под чужими фильтрами не отдаётся', () => {
    // Точки всей области под фильтром «тойхоны Ургута» — это ложь, по
    // которой примут решение: человек решит, что их там сотня.
    saveSnapshot(collection(100), 'all|all', NOW, store);
    expect(readSnapshot('toyxona|urgut', NOW, store)).toBeNull();
  });

  it('слишком большой не пишется и чужую квоту не съедает', () => {
    // localStorage общий: раздуть его картой значит сломать корзину и
    // черновики. Отказ честнее вытеснения чужих данных.
    const huge = collection(20_000);
    expect(JSON.stringify(huge).length).toBeGreaterThan(SNAPSHOT_MAX_BYTES);
    expect(saveSnapshot(huge, 'all|all', NOW, store)).toBe(false);
    expect(store.raw.get(SNAPSHOT_KEY)).toBeUndefined();
  });

  it('отказ хранилища не поднимает исключение', () => {
    // Приватный режим и переполненная квота ведут себя одинаково, а человек
    // открыл карту, а не хранилище.
    const failing = fakeStorage(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveSnapshot(collection(1), 'all|all', NOW, failing)).not.toThrow();
    expect(saveSnapshot(collection(1), 'all|all', NOW, failing)).toBe(false);
  });

  it('без хранилища вовсе — не ошибка, а «нечего»', () => {
    // На сервере localStorage нет: обращение к нему уронило бы рендер.
    expect(saveSnapshot(collection(1), 'all|all', NOW, null)).toBe(false);
    expect(readSnapshot('all|all', NOW, null)).toBeNull();
  });
});

describe('чтение', () => {
  it('вчерашний снимок не выдаётся за свежий', () => {
    // Вчерашняя карта выглядит рабочей — по ней поедут.
    saveSnapshot(collection(5), 'all|all', NOW, store);
    expect(readSnapshot('all|all', NOW + SNAPSHOT_MAX_AGE_MS + 1, store)).toBeNull();
    expect(readSnapshot('all|all', NOW + SNAPSHOT_MAX_AGE_MS - 1, store)).not.toBeNull();
  });

  it('мусор в хранилище не роняет карту', () => {
    store.raw.set(SNAPSHOT_KEY, 'не json');
    expect(readSnapshot('all|all', NOW, store)).toBeNull();

    store.raw.set(SNAPSHOT_KEY, '{"key":"all|all","at":123}');
    expect(readSnapshot('all|all', NOW, store)).toBeNull();

    store.raw.set(SNAPSHOT_KEY, '[1,2,3]');
    expect(readSnapshot('all|all', NOW, store)).toBeNull();
  });

  it('пустого хранилища достаточно, чтобы ответить «нечего»', () => {
    expect(readSnapshot('all|all', NOW, store)).toBeNull();
  });
});

describe('подпись времени', () => {
  it('свежее — «только что», не «0 мин. назад»', () => {
    expect(snapshotTime(NOW, NOW)).toBe('только что');
    expect(snapshotTime(NOW, NOW + 30_000)).toBe('только что');
  });

  it('в пределах часа — минутами, дальше — часами', () => {
    expect(snapshotTime(NOW, NOW + 20 * 60_000)).toBe('20 мин. назад');
    expect(snapshotTime(NOW, NOW + 3 * 60 * 60_000)).toBe('в 14:20');
  });
});
