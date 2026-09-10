import { describe, expect, it } from 'vitest';

import { DEVICE_KEY_STORAGE, deviceLabel, forgetDeviceKey, readDeviceKey, writeDeviceKey } from './deviceKey';

// Хранилище в вебе умеет быть недоступным (приватное окно, запрет на
// хранение данных). Ключ при этом просто не находится — и запись дня
// продолжает идти по сессии. Падать здесь нельзя ни в одном случае.

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    dump: () => Object.fromEntries(data),
  };
}

function throwingStorage() {
  return {
    getItem: () => {
      throw new Error('storage disabled');
    },
    setItem: () => {
      throw new Error('storage disabled');
    },
    removeItem: () => {
      throw new Error('storage disabled');
    },
  };
}

describe('хранение ключа устройства', () => {
  it('сохранённый ключ читается обратно', () => {
    const storage = fakeStorage();
    writeDeviceKey(storage, 'mgd_abc123');

    expect(readDeviceKey(storage)).toBe('mgd_abc123');
    expect(storage.dump()[DEVICE_KEY_STORAGE]).toBe('mgd_abc123');
  });

  it('чужая строка ключом не считается', () => {
    // В хранилище могло остаться что угодно от прежних версий. Отправить
    // это в заголовке значит получить отказ навсегда вместо записи дня.
    expect(readDeviceKey(fakeStorage({ [DEVICE_KEY_STORAGE]: 'Bearer xxx' }))).toBeNull();
    expect(readDeviceKey(fakeStorage({ [DEVICE_KEY_STORAGE]: '' }))).toBeNull();
    expect(readDeviceKey(fakeStorage())).toBeNull();
  });

  it('закрытое хранилище — это отсутствие ключа, а не падение', () => {
    const storage = throwingStorage();

    expect(readDeviceKey(storage)).toBeNull();
    expect(() => writeDeviceKey(storage, 'mgd_abc')).not.toThrow();
    expect(() => forgetDeviceKey(storage)).not.toThrow();
  });

  it('забытый ключ не находится', () => {
    const storage = fakeStorage({ [DEVICE_KEY_STORAGE]: 'mgd_abc' });
    forgetDeviceKey(storage);

    expect(readDeviceKey(storage)).toBeNull();
  });
});

describe('deviceLabel', () => {
  it('владелец узнаёт телефон по модели, а не по строке версий', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; 23021RAAEG Build/TKQ1) AppleWebKit/537.36 Chrome/120';
    expect(deviceLabel(ua)).toBe('23021RAAEG Build/TKQ1');
  });

  it('модели нет — подпись всё равно человеческая', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 13)')).toBe('Телефон');
    expect(deviceLabel('')).toBe('Телефон');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 10; wv)')).toBe('Телефон');
  });

  it('подпись не разрастается: её читают в списке', () => {
    const long = `Mozilla/5.0 (Linux; Android 13; ${'X'.repeat(200)}) Chrome/120`;
    expect(deviceLabel(long).length).toBeLessThanOrEqual(60);
  });
});
