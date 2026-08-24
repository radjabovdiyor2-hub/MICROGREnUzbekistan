import { describe, expect, it } from 'vitest';

import { fieldCustomerData, parseFieldCustomer } from './createFromField';

// ══════════════════════════════════════════════════════════════════════
// Заведение клиента с карты.
//
// Разбор тела и форма записи — то место, где ошибка не падает, а тихо
// портит базу: клиент без имени, пин, который назавтра переставит ночной
// геокодер, или частное лицо там, где стоит ресторан.
// ══════════════════════════════════════════════════════════════════════

const ok = (body: unknown) => {
  const r = parseFieldCustomer(body);
  if (!r.ok) throw new Error('ожидался разбор, а пришёл отказ: ' + r.error);
  return r.value;
};

describe('разбор', () => {
  it('берёт имя, телефон, тип и координаты', () => {
    const v = ok({
      name: '  Плов Центр  ',
      phone: ' +998901112233 ',
      companyType: 'restaurant',
      latitude: 39.6547,
      longitude: 66.9758,
      accuracyM: 12.7,
    });
    expect(v.name).toBe('Плов Центр');
    expect(v.phone).toBe('+998901112233');
    expect(v.companyType).toBe('restaurant');
    expect(v.latitude).toBeCloseTo(39.6547);
    expect(v.accuracyM).toBe(13);
  });

  it('без имени отказывает — по нему клиента ищут', () => {
    expect(parseFieldCustomer({ name: '' }).ok).toBe(false);
    expect(parseFieldCustomer({ name: 'П' }).ok).toBe(false);
    expect(parseFieldCustomer({}).ok).toBe(false);
  });

  it('пустой телефон — это null, а не пустая строка', () => {
    // Пустая строка в колонке телефона выглядит как «телефон есть», и
    // карточка предлагает по нему позвонить.
    expect(ok({ name: 'Кафе', phone: '   ' }).phone).toBeNull();
  });

  it('чужой тип заведения отклоняется, а не пишется как есть', () => {
    expect(parseFieldCustomer({ name: 'Кафе', companyType: 'teahouse' }).ok).toBe(false);
    // Настоящий тип из справочника проходит.
    expect(ok({ name: 'Кафе', companyType: 'chaikhana' }).companyType).toBe('chaikhana');
  });

  it('координаты вне диапазона — отказ, а не молчаливый ноль', () => {
    expect(parseFieldCustomer({ name: 'Кафе', latitude: 200, longitude: 0 }).ok).toBe(false);
  });

  it('без координат заводится: не всегда GPS берётся', () => {
    const v = ok({ name: 'Кафе у рынка' });
    expect(v.latitude).toBeNull();
    expect(v.longitude).toBeNull();
  });
});

describe('форма записи', () => {
  it('это лид, найденный ногами, и он B2B', () => {
    const d = fieldCustomerData(ok({ name: 'Плов Центр', latitude: 39.65, longitude: 66.97 }));
    expect(d.status).toBe('lead');
    expect(d.source).toBe('field');
    expect(d.customerType).toBe('b2b');
  });

  it('пин помечен ручным — ночной геокодер его не тронет', () => {
    const d = fieldCustomerData(ok({ name: 'Плов Центр', latitude: 39.65, longitude: 66.97 }));
    expect(d.geoSource).toBe('manual');
    expect(d.geoPrecision).toBe('exact');
  });

  it('без координат полей геолокации нет вовсе', () => {
    // Не «нули», а отсутствие: ноль-ноль — точка в Атлантике, и она честно
    // покажется на карте посреди океана.
    const d = fieldCustomerData(ok({ name: 'Кафе' }));
    expect('latitude' in d).toBe(false);
    expect('geoSource' in d).toBe(false);
  });

  it('имя дублируется в companyName — по нему ищет офис', () => {
    expect(fieldCustomerData(ok({ name: 'Плов Центр' })).companyName).toBe('Плов Центр');
  });
});
