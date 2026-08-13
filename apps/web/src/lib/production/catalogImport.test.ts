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
// Числа позиций здесь НЕ зашиты: их объявляет сам прайс в `data-count`,
// иначе каждая новая секция требовала бы правки теста.
// ══════════════════════════════════════════════════════════════════════

const CATALOG_DIR = join(process.cwd(), 'public/catalog');

const tableRe = /<table\b([^>]*)>([\s\S]*?)<\/table>/g;

// Флага `s` тут нет намеренно: target проекта — ES2017, а dotAll появился
// в ES2018, и `tsc --noEmit` на нём краснеет. `[\s\S]` делает то же самое.
const priceRe =
  /<td class="c-img"><img src="([^"]+)"[\s\S]*?<td class="c-nm">([^<]*)<span class="c-lt">([^<]*)<\/span>[\s\S]*?<td class="c-pr[^"]*">([^<]*)<\/td>/g;

const cardRe =
  /<div class="pc-img"><img src="([^"]+)"[^>]*>[\s\S]*?<div class="pc-n">([^<]*)<\/div>[\s\S]*?<div class="pc-nr">([^<]*)<\/div>[\s\S]*?<div class="pc-d">([\s\S]*?)<\/div>/g;

const slugOf = (file: string) => file.replace(/\.png$/i, '').replace(/_/g, '-');
const attrOf = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

interface Row {
  file: string;
  nameRu: string;
  nameUz: string;
  price: number;
  category: string;
  unit: string;
}

/** Секции прайса: тег таблицы + разобранные из неё строки. */
function sections(): { category?: string; unit?: string; declared: string | undefined; rows: Row[] }[] {
  const html = readFileSync(join(CATALOG_DIR, 'price-list.html'), 'utf8');
  return [...html.matchAll(tableRe)].map(([, tag, body]) => {
    const category = attrOf(tag, 'data-category');
    const unit = attrOf(tag, 'data-unit');
    return {
      category,
      unit,
      declared: attrOf(tag, 'data-count'),
      rows: [...body.matchAll(priceRe)].map((m) => ({
        file: m[1],
        nameRu: m[2].trim(),
        nameUz: m[3].trim(),
        price: Number(m[4].replace(/\D/g, '')),
        category: category ?? '',
        unit: unit ?? '',
      })),
    };
  });
}

const priceRows = (): Row[] => sections().flatMap((s) => s.rows);

describe('прайс-лист как источник каталога', () => {
  it('каждая таблица объявляет категорию, единицу и число строк', () => {
    const all = sections();
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      expect(s.category, 'data-category у таблицы прайса').toBeTruthy();
      expect(s.unit, 'data-unit у таблицы прайса').toBeTruthy();
      expect(s.declared, 'data-count у таблицы прайса').toBeTruthy();
    }
  });

  it('разобрано ровно столько строк, сколько объявлено в data-count', () => {
    for (const s of sections()) {
      expect(s.rows.length, `секция «${s.category}»`).toBe(Number(s.declared));
    }
  });

  it('у каждой позиции есть цена, картинка и оба названия', () => {
    for (const row of priceRows()) {
      expect(row.price, `цена у «${row.nameRu}»`).toBeGreaterThan(0);
      expect(row.file).toMatch(/\.png$/i);
      expect(row.nameRu.length).toBeGreaterThan(0);
      expect(row.nameUz.length).toBeGreaterThan(0);
    }
  });

  it('единица измерения одна на секцию, но у категории их может быть несколько', () => {
    // BALANS продаётся и упаковкой 100 г (миксы), и штукой (киты) — раньше
    // единица была жёстко одна на категорию, и такая линейка не выражалась.
    const balans = priceRows().filter((r) => r.category === 'balans');
    expect(balans.length).toBeGreaterThan(0);
    expect(new Set(balans.map((r) => r.unit)).size).toBeGreaterThan(1);
  });

  it('салаты стоят кратно дороже — это цена за килограмм', () => {
    const salads = priceRows().filter((r) => r.category === 'salads');
    expect(salads.length).toBeGreaterThan(0);
    expect(salads.every((r) => r.price >= 100_000)).toBe(true);
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
