import { describe, it, expect } from 'vitest';

import {
  availabilityFor,
  channelPrice,
  channelStock,
  isPastCutoff,
  isStale,
  type ChannelPolicy,
  type ChannelProduct,
} from './availability';

// ══════════════════════════════════════════════════════════════════════
// Защита свежего товара на чужих площадках.
//
// Проверяем ровно то, из-за чего площадка штрафует: отдали лоток, которого
// нет, или отдали его после того, как машина ушла. Отмена FBS позже суток
// стоит 9% заказа, и «наверное, ещё есть» — это её единственная причина.
// ══════════════════════════════════════════════════════════════════════

/** Полдень 29 августа 2026 по Самарканду (UTC+5) — до любой отсечки. */
const NOON = new Date('2026-08-29T07:00:00Z');
/** 21:00 по Самарканду — после отсечки 18:00. */
const EVENING = new Date('2026-08-29T16:00:00Z');

function policy(patch: Partial<ChannelPolicy> = {}): ChannelPolicy {
  return {
    code: 'tezkor',
    isActive: true,
    cities: ['samarkand'],
    stockBuffer: 2,
    markupPercent: 0,
    orderCutoff: '18:00',
    lastSyncAt: NOON,
    ...patch,
  };
}

function product(patch: Partial<ChannelProduct> = {}): ChannelProduct {
  return {
    id: 'p1',
    price: 15000,
    stock: 10,
    categorySlug: 'microgreens',
    isActive: true,
    ...patch,
  };
}

describe('channelStock', () => {
  it('держит буфер для своих заказов', () => {
    expect(channelStock(10, 2)).toBe(8);
  });

  it('дробный остаток округляет ВНИЗ — половину лотка не продать', () => {
    expect(channelStock(3.7, 0)).toBe(3);
  });

  it('никогда не уходит в минус', () => {
    expect(channelStock(1, 5)).toBe(0);
  });
});

describe('channelPrice', () => {
  it('поднимает цену на наценку канала и округляет ВВЕРХ до сотни', () => {
    // 15 000 + 12% = 16 800 ровно
    expect(channelPrice(15000, 12)).toBe(16800);
    // 15 000 + 7% = 16 050 → вверх до 16 100, а не вниз: округление вниз
    // отдаёт площадке нашу маржу
    expect(channelPrice(15000, 7)).toBe(16100);
  });

  it('без наценки цена каталога не меняется', () => {
    expect(channelPrice(15000, 0)).toBe(15000);
  });

  it('не прибавляет лишнюю сотню на плавающей точке', () => {
    // 25 000 + 10% — ровно 27 500. Через `1 + n/100` получалось
    // 27500.000000000004, и округление вверх давало 27 600: сто сумов
    // из воздуха на каждой позиции. Поймано живым прогоном, не тестом.
    expect(channelPrice(25000, 10)).toBe(27500);
    expect(channelPrice(35000, 10)).toBe(38500);
    expect(channelPrice(29000, 20)).toBe(34800);
  });
});

describe('isPastCutoff', () => {
  it('до отсечки — нет, после — да', () => {
    expect(isPastCutoff(policy(), NOON)).toBe(false);
    expect(isPastCutoff(policy(), EVENING)).toBe(true);
  });

  it('пустая или кривая отсечка означает «отсечки нет», а не полночь', () => {
    expect(isPastCutoff(policy({ orderCutoff: null }), EVENING)).toBe(false);
    expect(isPastCutoff(policy({ orderCutoff: '25:00' }), EVENING)).toBe(false);
    expect(isPastCutoff(policy({ orderCutoff: 'вечером' }), EVENING)).toBe(false);
  });
});

describe('isStale', () => {
  it('канал, которому остатки шлём мы, устаревает через час', () => {
    const hourAgo = new Date(NOON.getTime() - 61 * 60 * 1000);
    expect(isStale(policy({ lastSyncAt: hourAgo }), NOON)).toBe(true);
    expect(isStale(policy(), NOON)).toBe(false);
  });

  it('фидовый канал не устаревает: выгрузку забирает площадка сама', () => {
    const dayAgo = new Date(NOON.getTime() - 24 * 60 * 60 * 1000);
    expect(isStale(policy({ code: 'google_shopping', lastSyncAt: dayAgo }), NOON)).toBe(false);
  });
});

describe('availabilityFor', () => {
  it('отдаёт остаток за вычетом буфера и цену канала', () => {
    const state = availabilityFor(product(), policy({ markupPercent: 10 }), NOON);
    expect(state).toEqual({ available: true, quantity: 8, price: 16500 });
  });

  it('после окна отгрузки скоропорт снимается до утра', () => {
    const state = availabilityFor(product(), policy(), EVENING);
    expect(state.available).toBe(false);
  });

  it('непортящийся товар окно отгрузки не касается', () => {
    const state = availabilityFor(product({ categorySlug: 'seeds' }), policy(), EVENING);
    expect(state.available).toBe(true);
  });

  it('скоропорт не уходит на площадку, которая его не возит', () => {
    const state = availabilityFor(product(), policy({ code: 'sello' }), NOON);
    expect(state).toEqual({
      available: false,
      reason: 'Скоропорт не выставляется на этой площадке',
    });
  });

  it('без города доставки свежее не выставляется вовсе', () => {
    const state = availabilityFor(product(), policy({ cities: [] }), NOON);
    expect(state.available).toBe(false);
  });

  it('остаток в пределах буфера — это «нет в наличии»', () => {
    const state = availabilityFor(product({ stock: 2 }), policy(), NOON);
    expect(state).toEqual({ available: false, reason: 'Нет остатка сверх буфера' });
  });

  it('выключенный канал не отдаёт ничего', () => {
    const state = availabilityFor(product(), policy({ isActive: false }), NOON);
    expect(state).toEqual({ available: false, reason: 'Канал выключен' });
  });

  it('неизвестный код канала не выдумывается', () => {
    const state = availabilityFor(product(), policy({ code: 'ozon' }), NOON);
    expect(state).toEqual({ available: false, reason: 'Канал не описан в реестре' });
  });

  it('неизвестная категория считается скоропортом — ошибка в безопасную сторону', () => {
    const state = availabilityFor(product({ categorySlug: 'nonexistent' }), policy(), EVENING);
    expect(state.available).toBe(false);
  });
});
