import crypto from 'crypto';

import { describe, expect, it } from 'vitest';

import { looksLikeDeviceToken } from '@/middleware';

import { DEVICE_TOKEN_PREFIX, hashToken, mintToken } from './deviceAuth';

// Ключ устройства лежит в APK на телефоне сотрудника и разбирается любым
// желающим за десять минут. Всё, что он открывает, открыто и тому, кто
// вытащил его из чужого телефона, — поэтому здесь проверяется не «работает
// ли», а НАСКОЛЬКО МАЛО он может.

describe('mintToken', () => {
  it('ключ узнаётся по приставке — в логах и в чужих руках', () => {
    expect(mintToken().token.startsWith(DEVICE_TOKEN_PREFIX)).toBe(true);
  });

  it('в базу уходит отпечаток, а не ключ', () => {
    const { token, hash } = mintToken();

    expect(hash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(hash).not.toContain(token.slice(DEVICE_TOKEN_PREFIX.length));
    expect(hash).toHaveLength(64);
  });

  it('два ключа не совпадают — иначе один телефон отзывал бы все', () => {
    const a = mintToken().token;
    const b = mintToken().token;

    expect(a).not.toBe(b);
    // 32 байта случайности: перебор невозможен, и это единственное, на чём
    // здесь держится доступ.
    expect(a.length).toBeGreaterThan(DEVICE_TOKEN_PREFIX.length + 40);
  });

  it('отпечаток стабилен — иначе ключ переставал бы работать сам собой', () => {
    const { token, hash } = mintToken();
    expect(hashToken(token)).toBe(hash);
  });
});

describe('looksLikeDeviceToken — что ключ открывает в middleware', () => {
  const key = `Bearer ${mintToken().token}`;

  it('открывает свой трек и свою смену', () => {
    expect(looksLikeDeviceToken(key, '/api/admin/tracking/ping')).toBe(true);
    expect(looksLikeDeviceToken(key, '/api/shift')).toBe(true);
  });

  it('НЕ открывает ничего больше', () => {
    // Middleware проверяет только форму ключа — настоящую проверку делает
    // роут. Поэтому список путей и есть весь рубеж: путь, который не умеет
    // проверять ключ сам, откроется строкой «Bearer mgd_» кому угодно.
    for (const path of [
      '/api/admin/customers',
      '/api/admin/tracking/day',
      '/api/admin/tracking/live',
      '/api/admin/orders',
      '/api/inventory/employees',
      '/api/admin/settings',
      '/api/auth/device',
    ]) {
      expect(looksLikeDeviceToken(key, path)).toBe(false);
    }
  });

  it('огрызок ключа не проходит даже по форме', () => {
    expect(looksLikeDeviceToken('Bearer mgd_', '/api/shift')).toBe(false);
    expect(looksLikeDeviceToken('Bearer mgd_короткий', '/api/shift')).toBe(false);
    expect(looksLikeDeviceToken('Bearer mgd_' + 'a'.repeat(200), '/api/shift')).toBe(false);
  });

  it('чужая подпись ключом устройства не притворяется', () => {
    expect(looksLikeDeviceToken('Bearer secret-token-value', '/api/shift')).toBe(false);
    expect(looksLikeDeviceToken('mgd_без-Bearer-впереди', '/api/shift')).toBe(false);
    expect(looksLikeDeviceToken(null, '/api/shift')).toBe(false);
    expect(looksLikeDeviceToken('', '/api/shift')).toBe(false);
  });

  it('подпуть двери тоже открыт, а похожий чужой — нет', () => {
    expect(looksLikeDeviceToken(key, '/api/shift/anything')).toBe(true);
    // Приставка совпала бы при сравнении строк, но это другая дверь.
    expect(looksLikeDeviceToken(key, '/api/shifts')).toBe(false);
    expect(looksLikeDeviceToken(key, '/api/admin/shifts')).toBe(false);
  });
});
