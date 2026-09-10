import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_FACTOR, isOffline, isSlowLink, pollInterval, requestTimeoutMs } from './connection';

// Подменяем то, что в среде `node` отсутствует: сам navigator. Проверяется
// не браузер, а НАШЕ решение — как часто тревожить слабый канал и когда
// перестать. Ошибка здесь либо забивает канал в подвале, либо без повода
// замедляет всех остальных.

const original = globalThis.navigator;

function setNavigator(value: Partial<Navigator> & { connection?: unknown }) {
  Object.defineProperty(globalThis, 'navigator', {
    value, configurable: true, writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: original, configurable: true, writable: true,
  });
  vi.restoreAllMocks();
});

describe('isSlowLink', () => {
  it('2g и медленный 2g считаются слабыми', () => {
    setNavigator({ onLine: true, connection: { effectiveType: '2g' } });
    expect(isSlowLink()).toBe(true);
    setNavigator({ onLine: true, connection: { effectiveType: 'slow-2g' } });
    expect(isSlowLink()).toBe(true);
  });

  it('3g слабой НЕ считается', () => {
    // По этой шкале 3g — обычная городская связь. Записать её в слабые
    // значило бы втрое замедлить обновление половине без повода.
    setNavigator({ onLine: true, connection: { effectiveType: '3g' } });
    expect(isSlowLink()).toBe(false);
  });

  it('экономия трафика — просьба человека, и её слушаемся', () => {
    setNavigator({ onLine: true, connection: { effectiveType: '4g', saveData: true } });
    expect(isSlowLink()).toBe(true);
  });

  it('без Network Information API связь считается обычной', () => {
    // В Safari его нет вовсе: гадать в худшую сторону значит замедлить
    // всех владельцев iPhone без причины.
    setNavigator({ onLine: true });
    expect(isSlowLink()).toBe(false);
  });
});

describe('pollInterval', () => {
  it('на обычной связи интервал не меняется', () => {
    setNavigator({ onLine: true, connection: { effectiveType: '4g' } });
    expect(pollInterval(60_000)).toBe(60_000);
  });

  it('на слабой опрашиваем втрое реже', () => {
    setNavigator({ onLine: true, connection: { effectiveType: '2g' } });
    expect(pollInterval(60_000)).toBe(60_000 * SLOW_FACTOR);
  });

  it('без связи не опрашиваем вовсе', () => {
    // Запрос в никуда стоит времени и заряда, а сеть сама скажет, когда
    // вернётся, — событием `online`.
    setNavigator({ onLine: false, connection: { effectiveType: '4g' } });
    expect(pollInterval(60_000)).toBe(false);
    expect(isOffline()).toBe(true);
  });
});

describe('requestTimeoutMs', () => {
  it('на слабой связи ждём дольше, но всё-таки конечно', () => {
    setNavigator({ onLine: true, connection: { effectiveType: '2g' } });
    const slow = requestTimeoutMs(15_000);
    setNavigator({ onLine: true, connection: { effectiveType: '4g' } });
    const fast = requestTimeoutMs(15_000);
    expect(slow).toBeGreaterThan(fast);
    expect(slow).toBeLessThan(60_000);
  });
});
