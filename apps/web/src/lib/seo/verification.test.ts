import { describe, it, expect } from 'vitest';

import { domainVerification } from './verification';

describe('domainVerification', () => {
  it('выводит только заданные метки', () => {
    expect(domainVerification({ NEXT_PUBLIC_YANDEX_VERIFICATION: 'abc123' }))
      .toEqual({ 'yandex-verification': 'abc123' });
  });

  it('собирает Яндекс и Meta вместе', () => {
    const tags = domainVerification({
      NEXT_PUBLIC_YANDEX_VERIFICATION: 'abc123',
      NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION: 'fb456',
    });
    expect(tags).toEqual({
      'yandex-verification': 'abc123',
      'facebook-domain-verification': 'fb456',
    });
  });

  it('пустая переменная не превращается в пустую метку', () => {
    // `KEY=` в .env даёт пустую строку. Метка с пустым токеном —
    // не «не настроено», а непройденная проверка: площадка читает её,
    // не находит совпадения и помечает домен как чужой.
    expect(domainVerification({ NEXT_PUBLIC_YANDEX_VERIFICATION: '' })).toBeUndefined();
    expect(domainVerification({ NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION: '   ' })).toBeUndefined();
    expect(domainVerification({})).toBeUndefined();
  });

  it('обрезает пробелы вокруг токена', () => {
    // Токен копируют из кабинета вместе с переводом строки.
    expect(domainVerification({ NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION: ' fb456 ' }))
      .toEqual({ 'facebook-domain-verification': 'fb456' });
  });
});
