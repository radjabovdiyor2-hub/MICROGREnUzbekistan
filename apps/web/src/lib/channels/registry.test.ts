import { describe, it, expect } from 'vitest';

import { channelForSource } from './registry';

describe('channelForSource', () => {
  it('узнаёт код канала в самом себе', () => {
    expect(channelForSource('tezkor')).toBe('tezkor');
    expect(channelForSource('uzum')).toBe('uzum');
  });

  it('засчитывает заказы витринного бота Telegram-каналу', () => {
    // Бот пишет `telegram_bot` с 2024 года, код канала — `telegram`.
    // Пока их не связали, экран «Каналы продаж» показывал по Telegram
    // ноль заказов при живой торговле.
    expect(channelForSource('telegram_bot')).toBe('telegram');
    expect(channelForSource('telegram')).toBe('telegram');
  });

  it('не приписывает каналу заказы витрины, админки и офиса', () => {
    // Офис заводит заказ от имени клиента, пришедшего откуда угодно.
    // Приписать его каналу значило бы выдумать источник.
    expect(channelForSource('web')).toBeNull();
    expect(channelForSource('web_admin')).toBeNull();
    expect(channelForSource('ai_office')).toBeNull();
    expect(channelForSource(null)).toBeNull();
    expect(channelForSource('')).toBeNull();
  });
});
