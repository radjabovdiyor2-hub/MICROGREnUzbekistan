import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_SECTIONS, sectionHref } from './catalogSections';

// ══════════════════════════════════════════════════════════════════════
// Ряд разделов против прайса: ни одной двери в пустую комнату.
//
// ЧТО СЛУЧИЛОСЬ. Ряд на главной был своим списком, каталога — своим. Когда
// каталог перешёл на прайс из 70 позиций, «Цветы», «Семена» и «Оборудование»
// остались в разметке главной, хотя активных товаров в них стало ноль:
// человек нажимал и попадал в пустую комнату. Обратное расхождение жило
// рядом — соусов и четырёх линеек в ряду на главной не было вовсе, хотя в
// каталоге они есть.
//
// ПОЧЕМУ ЭТО НЕ ЛОВИЛОСЬ. Оба списка — валидный TypeScript, и сборка на них
// зелёная. Расхождение видно только при сверке с тем, что реально продаётся,
// а единственный источник этого — прайс: `import-catalog.ts` гасит
// (`isActive = false`) всё, чего в нём нет.
//
// ЗДЕСЬ СВЕРКА ИДЁТ В ОБЕ СТОРОНЫ: раздел без товаров — дверь в пустоту;
// товары без раздела — ассортимент, до которого не дойти.
// ══════════════════════════════════════════════════════════════════════

const CATALOG_DIR = join(process.cwd(), 'public/catalog');

const read = (file: string) => readFileSync(join(CATALOG_DIR, file), 'utf8');

/** Рубрики объявляет сам прайс: `<table data-category="...">`. */
const declaredCategories = () =>
  new Set(
    [...read('price-list.html').matchAll(/data-category="([^"]+)"/g)].map((m) => m[1]),
  );

/** Линейки объявляет каталог: `<span class="tag tag-line">KUNLIK</span>`. */
const declaredLines = () =>
  new Set(
    [...read('product-catalog.html').matchAll(/<span class="tag tag-line">([^<]+)<\/span>/g)]
      .map((m) => m[1].trim()),
  );

describe('Разделы каталога', () => {
  it('у каждой рубрики в ряду есть секция в прайсе', () => {
    const declared = declaredCategories();
    const dead = CATALOG_SECTIONS
      .filter((s) => s.kind === 'category' && s.slug && !declared.has(s.slug))
      .map((s) => s.slug);
    // «Все» пропускаем намеренно: у него нет своей секции — он снимает фильтр.
    expect(dead, 'раздел ведёт в рубрику, которой нет в прайсе').toEqual([]);
  });

  it('у каждой секции прайса есть раздел в ряду', () => {
    const inRow = new Set(CATALOG_SECTIONS.filter((s) => s.kind === 'category').map((s) => s.slug));
    const unreachable = [...declaredCategories()].filter((slug) => !inRow.has(slug));
    expect(unreachable, 'товары есть, а раздела к ним нет').toEqual([]);
  });

  it('каждая линейка ряда встречается в каталоге', () => {
    const declared = declaredLines();
    const dead = CATALOG_SECTIONS
      .filter((s) => s.kind === 'line' && !declared.has(s.slug))
      .map((s) => s.slug);
    expect(dead, 'линейка в ряду, а товаров с такой меткой нет').toEqual([]);
  });

  it('каждая линейка каталога доступна из ряда', () => {
    // BALANS помечен и линейкой, и рубрикой: у него своя упаковка и своя
    // страница метода, поэтому в ряду он стоит рубрикой. Дверь к нему есть —
    // этого и требуем, а не совпадения вида фильтра.
    const reachable = new Set(CATALOG_SECTIONS.map((s) => s.slug.toUpperCase()));
    const unreachable = [...declaredLines()].filter((line) => !reachable.has(line.toUpperCase()));
    expect(unreachable, 'линейка есть на товарах, а в ряду её нет').toEqual([]);
  });

  it('значок и цвет есть у каждого раздела, слаги не повторяются', () => {
    for (const section of CATALOG_SECTIONS) {
      expect(section.Icon, `${section.slug}: нет значка`).toBeTruthy();
      // Токен, а не литерал: иначе цвет не переключится вместе с темой.
      expect(section.color, `${section.slug}: цвет не токен`).toMatch(/^var\(--/);
    }
    const keys = CATALOG_SECTIONS.map((s) => `${s.kind}:${s.slug}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('адрес раздела ведёт туда, где фильтр применится', () => {
    const href = Object.fromEntries(
      CATALOG_SECTIONS.map((s) => [`${s.kind}:${s.slug}`, sectionHref(s)]),
    );
    expect(href['category:']).toBe('/catalog');
    expect(href['category:sauces']).toBe('/catalog/sauces');
    // У линейки своей страницы нет: каталог читает её из `?line=` при первой
    // отрисовке (`useCatalog`). Ссылка на `/catalog/KUNLIK` открыла бы пустоту.
    expect(href['line:KUNLIK']).toBe('/catalog?line=KUNLIK');
  });
});
