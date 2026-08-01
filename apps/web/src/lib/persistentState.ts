'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Состояние, переживающее перезагрузку вкладки.
//
// Провайдеры корзины, избранного, города и языка держали одну и ту же пару
// эффектов: первый читал localStorage на маунте и звал setState, второй писал
// туда изменения под флагом loaded. Чтение через setState в эффекте —
// как раз то, что ломается на конкурентном рендеринге: React вправе
// отрисовать значение по умолчанию и показать его пользователю до гидрации.
//
// useSyncExternalStore — штатный способ подписаться на внешний источник.
// Значение берётся из хранилища прямо при рендере на клиенте, а на сервере
// отдаётся значение по умолчанию, так что разметка сходится.
//
// Побочная выгода: список слушателей общий, поэтому корзина синхронна между
// вкладками — раньше вторая вкладка затирала первую при следующей записи.
// ══════════════════════════════════════════════════════════════════════

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function subscribe(key: string, listener: Listener): () => void {
  let forKey = listeners.get(key);
  if (!forKey) {
    forKey = new Set();
    listeners.set(key, forKey);
  }
  forKey.add(listener);

  // Событие storage приходит только от других вкладок — свои изменения
  // разносит notify().
  const onStorage = (e: StorageEvent) => { if (e.key === key) listener(); };
  window.addEventListener('storage', onStorage);

  return () => {
    forKey.delete(listener);
    if (forKey.size === 0) listeners.delete(key);
    window.removeEventListener('storage', onStorage);
  };
}

/** Приватный режим и переполненная квота роняют доступ к хранилищу. */
function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Не удалось сохранить «${key}»:`, err);
  }
  notify(key);
}

export interface Codec<T> {
  parse: (raw: string) => T;
  serialize: (value: T) => string;
}

/** Для значений, которые уже лежат в хранилище строкой как есть. */
export const STRING_CODEC: Codec<string> = {
  parse: (raw) => raw,
  serialize: (value) => value,
};

/** Для массивов и объектов. */
export const JSON_CODEC: Codec<unknown> = {
  parse: (raw) => JSON.parse(raw),
  serialize: (value) => JSON.stringify(value),
};

/**
 * Значение из localStorage как обычное состояние.
 *
 * `fallback` и `codec` обязаны быть стабильными — объявляйте их на уровне
 * модуля. Литерал `[]` в аргументе создаёт новый массив на каждом рендере, и
 * потребители, у которых значение стоит в зависимостях, будут перезапускаться
 * вхолостую.
 */
export function usePersistentState<T>(
  key: string,
  fallback: T,
  codec: Codec<T> = JSON_CODEC as Codec<T>,
): [T, (next: T | ((prev: T) => T)) => void] {
  const raw = useSyncExternalStore(
    useCallback((listener: Listener) => subscribe(key, listener), [key]),
    useCallback(() => readRaw(key), [key]),
    // На сервере хранилища нет: отдаём null, и рендер идёт от fallback.
    useCallback(() => null, []),
  );

  const parse = useCallback((stored: string | null): T => {
    if (stored === null) return fallback;
    try {
      return codec.parse(stored);
    } catch (err) {
      // Данные в хранилище повреждены — работаем от значения по умолчанию,
      // а не роняем всё приложение на разборе чужой строки.
      console.warn(`Повреждённое значение «${key}» в localStorage:`, err);
      return fallback;
    }
  }, [key, fallback, codec]);

  const value = useMemo(() => parse(raw), [parse, raw]);

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    // Предыдущее значение берём из хранилища, а не из замыкания: между
    // рендерами его могла изменить другая вкладка.
    const resolved = typeof next === 'function'
      ? (next as (prev: T) => T)(parse(readRaw(key)))
      : next;
    writeRaw(key, codec.serialize(resolved));
  }, [key, codec, parse]);

  return [value, setValue];
}
