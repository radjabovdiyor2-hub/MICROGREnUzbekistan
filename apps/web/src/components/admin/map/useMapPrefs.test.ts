import { describe, it, expect } from 'vitest';

import {
  DETAILED_BASE_KEY,
  FILTERS_OPEN_KEY,
  readFlag,
  writeFlag,
  type FlagStore,
} from './useMapPrefs';

// ══════════════════════════════════════════════════════════════════════
// Запомненные переключатели карты.
//
// Хранилище передаётся параметром: окружение тестов здесь узловое, без
// jsdom, и `window.localStorage` в нём просто нет.
// ══════════════════════════════════════════════════════════════════════

function fakeStore(initial: Record<string, string> = {}): FlagStore {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

/** Приватный режим и запрет хранилища: любое обращение бросает. */
const hostileStore: FlagStore = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('readFlag', () => {
  // Разница принципиальна для фильтров: они развёрнуты по умолчанию, и
  // «ни разу не трогали» обязано отличаться от «свернул».
  it('ни разу не трогали — берётся умолчание, а не false', () => {
    expect(readFlag(fakeStore(), FILTERS_OPEN_KEY, true)).toBe(true);
    expect(readFlag(fakeStore(), DETAILED_BASE_KEY, false)).toBe(false);
  });

  it('сохранённое значение перебивает умолчание в обе стороны', () => {
    expect(readFlag(fakeStore({ [FILTERS_OPEN_KEY]: '0' }), FILTERS_OPEN_KEY, true)).toBe(false);
    expect(readFlag(fakeStore({ [DETAILED_BASE_KEY]: '1' }), DETAILED_BASE_KEY, false)).toBe(true);
  });

  it('мусор в хранилище читается как «выключено», а не как правда', () => {
    expect(readFlag(fakeStore({ x: 'да' }), 'x', true)).toBe(false);
  });

  it('без хранилища — умолчание: на сервере его нет вовсе', () => {
    expect(readFlag(null, FILTERS_OPEN_KEY, true)).toBe(true);
  });

  // Приватный режим Safari бросает на самом обращении к localStorage.
  // Уронить из-за этого карту нельзя: переключатель просто не запоминается.
  it('враждебное хранилище не роняет чтение', () => {
    expect(readFlag(hostileStore, FILTERS_OPEN_KEY, true)).toBe(true);
  });
});

describe('writeFlag', () => {
  it('пишет так, как потом прочитается', () => {
    const store = fakeStore();
    writeFlag(store, FILTERS_OPEN_KEY, false);
    expect(readFlag(store, FILTERS_OPEN_KEY, true)).toBe(false);

    writeFlag(store, FILTERS_OPEN_KEY, true);
    expect(readFlag(store, FILTERS_OPEN_KEY, false)).toBe(true);
  });

  it('без хранилища и на квоте молчит, а не бросает', () => {
    expect(() => writeFlag(null, FILTERS_OPEN_KEY, true)).not.toThrow();
    expect(() => writeFlag(hostileStore, FILTERS_OPEN_KEY, true)).not.toThrow();
  });

  it('ключи разных переключателей не совпадают', () => {
    expect(FILTERS_OPEN_KEY).not.toBe(DETAILED_BASE_KEY);
  });
});
