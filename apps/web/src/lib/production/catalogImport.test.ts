import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ══════════════════════════════════════════════════════════════════════
// Каталог витрины собирается из двух файлов, которые владелец отдаёт
// клиентам: public/catalog/price-list.html и product-catalog.html.
//
// Разбор идёт регулярками, а HTML владелец правит руками — значит, он может
// сломаться молча: цена не распознается, позиция выпадет, и товар просто
// исчезнет с сайта. Эти проверки держат формат: если он изменился, тест
// падает здесь, а не покупатель видит пустой каталог.
//
// Логика разбора продублирована из packages/database/prisma/import-catalog.ts
// намеренно: тестовый прогон витрины не тянет пакет базы и клиент Prisma.
// ══════════════════════════════════════════════════════════════════════

const CATALOG_DIR = join(process.cwd(), 'public/catalog');

// Флага `s` тут нет намеренно: target проекта — ES2017, а dotAll появился
// в ES2018, и `tsc --noEmit` на нём краснеет. `[\s\S]` делает то же самое.
const priceRe =
  /<td class="c-img"><img src="([^"]+)"[\s\S]*?<td class="c-nm">([^<]*)<span class="c-lt">([^<]*)<\/span>[\s\S]*?<td class="c-pr[^"]*">([^<]*)<\/td>/g;

const cardRe =
  /<div class="pc-img"><img src="([^"]+)"[^>]*>[\s\S]*?<div class="pc-n">([^<]*)<\/div>[\s\S]*?<div class="pc-nr">([^<]*)<\/div>[\s\S]*?<div class="pc-d">([\s\S]*?)<\/div>/g;

const slugOf = (file: string) => file.replace(/\.png$/i, '').replace(/_/g, '-');

function priceRows() {
  const html = readFileSync(join(CATALOG_DIR, 'price-list.html'), 'utf8');
  return [...html.matchAll(priceRe)].map((m) => ({
    file: m[1],
    nameRu: m[2].trim(),
    nameUz: m[3].trim(),
    price: Number(m[4].replace(/\D/g, '')),
  }));
}

describe('прайс-лист как источник каталога', () => {
  it('даёт ровно 34 позиции', () => {
    expect(priceRows()).toHaveLength(34);
  });

  it('у каждой позиции есть цена, картинка и оба названия', () => {
    for (const row of priceRows()) {
      expect(row.price, `цена у «${row.nameRu}»`).toBeGreaterThan(0);
      expect(row.file).toMatch(/\.png$/i);
      expect(row.nameRu.length).toBeGreaterThan(0);
      expect(row.nameUz.length).toBeGreaterThan(0);
    }
  });

  it('раскладка по категориям — 18 микрозелени, 10 бейби-листа, 6 салатов', () => {
    const rows = priceRows();
    expect(rows.slice(0, 18).every((r) => r.file.includes('micro') || r.file.includes('sango')
      || r.file.includes('pakchoy') || r.file.includes('mizuna_') || r.file.includes('gorchitsa'))).toBe(true);
    // Салаты идут последними и стоят кратно дороже: 100 000+ за килограмм
    expect(rows.slice(28).every((r) => r.price >= 100_000)).toBe(true);
  });

  it('slug из имени файла разводит тёзок', () => {
    // Руккола есть и в микрозелени, и в бейби-листе — под одним slug они
    // затёрли бы друг друга при upsert, и один товар пропал бы с витрины.
    const slugs = priceRows().map((r) => slugOf(r.file));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain('rukkola-micro');
    expect(slugs).toContain('rukkola-baby');
  });
});

describe('каталог как источник описаний', () => {
  it('описание есть у каждой позиции прайса', () => {
    const html = readFileSync(join(CATALOG_DIR, 'product-catalog.html'), 'utf8');
    const described = new Map(
      [...html.matchAll(cardRe)].map((m) => [m[1], m[4].replace(/<[^>]+>/g, '').trim()]),
    );
    for (const row of priceRows()) {
      const desc = described.get(row.file);
      expect(desc, `описание у «${row.nameRu}» (${row.file})`).toBeTruthy();
    }
  });
});
