import { describe, it, expect } from 'vitest';

import { buildLlmsTxt, type LlmsTxtInput } from './llmsTxt';

const INPUT: LlmsTxtInput = {
  domain: 'https://microgreenuzbekistan.com',
  categories: [
    { nameUz: "Mikroko'katlar", slug: 'microgreens', count: 20 },
    { nameUz: "Urug'lar", slug: 'seeds', count: 8 },
  ],
  deliveryFee: 25000,
  freeThreshold: 500000,
  timePromise: '30-90',
  phone: '+998 94 999 95 99',
  telegramChannelUrl: 'https://t.me/Microgreen_Uzbekistan',
  telegramBotUrl: 'https://t.me/Microgreenuzbekistan_bot',
  instagramUrl: 'https://www.instagram.com/microgreenuzbekistan',
  address: 'Samarqand, Ray Center',
};

describe('buildLlmsTxt', () => {
  it('ведёт агента к машиночитаемому списку товаров, а не заменяет его', () => {
    // Товары здесь не перечисляются намеренно: цены и остатки живут в
    // фиде и меняются каждый час. Второй источник правды разошёлся бы.
    const text = buildLlmsTxt(INPUT);
    expect(text).toContain('/feed/agents.json');
    expect(text).toContain('/feed/google.xml');
  });

  it('называет разделы и число товаров в них', () => {
    const text = buildLlmsTxt(INPUT);
    expect(text).toContain("[Mikroko'katlar](https://microgreenuzbekistan.com/catalog/microgreens): 20");
  });

  it('печатает деньги без разрядного пробела-неразрывника', () => {
    // `toLocaleString('ru-RU')` ставит U+00A0. В простом тексте он
    // выглядит как обычный пробел, но ломает поиск и сравнение строк
    // у того, кто этот файл читает машиной.
    const text = buildLlmsTxt(INPUT);
    expect(text).toContain("25 000 so'm");
    expect(text).not.toMatch(/\u00a0/);
  });

  it('на пустом каталоге не рисует пустой список разделов', () => {
    // Пустой перечень агент прочитает как «товара нет вовсе».
    const text = buildLlmsTxt({ ...INPUT, categories: [] });
    expect(text).toContain("Hozircha bo'limlar ro'yxati mavjud emas");
  });
});
