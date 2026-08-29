import { describe, it, expect } from 'vitest';

import { renderGoogleMerchant } from './googleMerchant';
import { renderAgentFeed } from './agents';
import { renderMetaCsv } from './meta';
import type { FeedItem } from './items';

// ══════════════════════════════════════════════════════════════════════
// Рендеры фида.
//
// Главная проверка — экранирование: название товара и описание приходят из
// админки, и один символ `&` в них рвёт XML целиком. Merchant отвергает не
// позицию, а ВЕСЬ фид, то есть магазин исчезает из товарной выдачи из-за
// одной буквы. То же с запятой в CSV — она сдвигает колонки.
// ══════════════════════════════════════════════════════════════════════

function item(patch: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'p1',
    title: 'Rukkola',
    description: 'Yangi mikroko‘kat',
    link: 'https://microgreenuzbekistan.com/product/p1',
    imageLink: 'https://microgreenuzbekistan.com/img/1.jpg',
    additionalImages: [],
    price: 16500,
    oldPrice: null,
    available: true,
    quantity: 8,
    brand: 'Microgreen Uzbekistan',
    mpn: 'MG-01',
    googleCategory: 'Food, Beverages & Tobacco > Food Items',
    productType: "Mikroko'katlar",
    unit: 'лоток',
    shippingPrice: 15000,
    shippingPromise: '30-90',
    ...patch,
  };
}

describe('renderGoogleMerchant', () => {
  it('экранирует амперсанд и угловые скобки — иначе отвергается весь фид', () => {
    const xml = renderGoogleMerchant([item({ title: 'Salat "Bacio" & Romano <новинка>' })], 'uz');
    expect(xml).toContain('&amp;');
    expect(xml).not.toMatch(/<g:title>[^<]*&(?!amp;|quot;|apos;|lt;|gt;)/);
    expect(xml).toContain('&lt;новинка&gt;');
  });

  it('честно говорит, что штрихкода нет', () => {
    const xml = renderGoogleMerchant([item()], 'uz');
    expect(xml).toContain('<g:identifier_exists>false</g:identifier_exists>');
    expect(xml).toContain('<g:mpn>MG-01</g:mpn>');
  });

  it('недоступную позицию отдаёт как out_of_stock, но с ценой', () => {
    const xml = renderGoogleMerchant([item({ available: false, quantity: 0 })], 'uz');
    expect(xml).toContain('<g:availability>out_of_stock</g:availability>');
    expect(xml).toContain('<g:price>16500 UZS</g:price>');
    expect(xml).not.toContain('<g:quantity>');
  });

  it('без артикула поле не выдумывает', () => {
    const xml = renderGoogleMerchant([item({ mpn: null })], 'uz');
    expect(xml).not.toContain('<g:mpn>');
  });

  it('категорию Google отдаёт только когда она известна', () => {
    const xml = renderGoogleMerchant([item({ googleCategory: undefined })], 'uz');
    expect(xml).not.toContain('<g:google_product_category>');
  });

  it('пустой каталог остаётся валидным документом, а не ошибкой', () => {
    const xml = renderGoogleMerchant([], 'ru');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('</rss>');
  });
});

describe('renderAgentFeed', () => {
  it('отдаёт наличие, количество и единицу цены — этого нет в RSS', () => {
    const feed = renderAgentFeed([item()], 'uz', new Date('2026-08-29T07:00:00Z'));
    expect(feed.products[0].availability).toBe('in_stock');
    expect(feed.products[0].inventory_quantity).toBe(8);
    expect(feed.products[0].price_unit).toBe('лоток');
    expect(feed.generated_at).toBe('2026-08-29T07:00:00.000Z');
  });

  it('недоступная позиция не притворяется купленной', () => {
    const feed = renderAgentFeed([item({ available: false, quantity: 0 })], 'uz');
    expect(feed.products[0].availability).toBe('out_of_stock');
    expect(feed.products[0].inventory_quantity).toBe(0);
  });
});

describe('renderMetaCsv', () => {
  it('заворачивает поля с запятой и кавычками', () => {
    const csv = renderMetaCsv([item({ title: 'Salat "Bacio", 100 г' })]);
    const [, row] = csv.split('\n');
    expect(row).toContain('"Salat ""Bacio"", 100 г"');
    // Колонок ровно столько же, сколько в заголовке
    expect(csv.split('\n')[0].split(',').length).toBe(10);
  });

  it('перевод строки в описании не разрывает строку CSV', () => {
    const csv = renderMetaCsv([item({ description: 'Первая строка\nвторая' })]);
    expect(csv.split('\n').length).toBeGreaterThan(2);
    expect(csv).toContain('"Первая строка\nвторая"');
  });
});
