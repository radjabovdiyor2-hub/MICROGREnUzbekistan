'use client';

import { useCallback, useState } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Запомненные переключатели карты.
//
// Свернул фильтры или выбрал подробную подложку — и это должно пережить
// перезагрузку: карту открывают каждое утро, и повторять один и тот же
// выбор ежедневно значит его не сделать.
//
// Хранилище передаётся параметром — по той же причине, что и в
// mapSnapshot.ts и dayRoute.ts: окружение тестов здесь узловое, без
// jsdom, и `window.localStorage` в нём просто нет. Заодно это честно
// работает при серверном рендере.
// ══════════════════════════════════════════════════════════════════════

export const FILTERS_OPEN_KEY = 'mg-map-filters-open';
export const DETAILED_BASE_KEY = 'mg-map-detailed-base';

/** Минимум того, что нам нужно от localStorage. */
export interface FlagStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readFlag(
  store: FlagStore | null,
  key: string,
  fallback: boolean,
): boolean {
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    // Ни разу не трогали — берём умолчание, а не `false`. Разница
    // принципиальна для фильтров: развёрнуты по умолчанию.
    return raw === null ? fallback : raw === '1';
  } catch {
    // Приватный режим и запрет хранилища. Не повод падать: переключатель
    // просто перестаёт запоминаться.
    return fallback;
  }
}

export function writeFlag(store: FlagStore | null, key: string, value: boolean): void {
  if (!store) return;
  try {
    store.setItem(key, value ? '1' : '0');
  } catch {
    // Квота или запрет: см. выше.
  }
}

function browserStore(): FlagStore | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

/** Булев переключатель, который помнит себя между сессиями. */
export function useRememberedFlag(
  key: string,
  fallback: boolean,
): [boolean, (value: boolean) => void] {
  // Ленивый инициализатор, а не эффект: чтение в эффекте дало бы кадр со
  // свёрнутыми фильтрами перед их раскрытием — то самое мигание, которое
  // читается как «оно само схлопнулось».
  const [value, setValue] = useState(() => readFlag(browserStore(), key, fallback));

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      writeFlag(browserStore(), key, next);
    },
    [key],
  );

  return [value, set];
}
