import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════════════
// Каталог витрины из прайса и каталога — они и есть источник правды.
//
// `apps/web/public/catalog/price-list.html` и `product-catalog.html` — те
// самые файлы, что владелец отдаёт клиентам. Раньше состав базы жил отдельной
// жизнью: там было ~50 товаров, включая оборудование и наборы, которых в
// прайсе нет вовсе, а количество не сходилось ни по одной категории.
//
// Состав категорий задаёт сам прайс: каждая <table> объявляет `data-category`,
// `data-unit` и `data-count` (см. parsePriceList). Ни здесь, ни в тесте нет
// зашитого числа позиций — добавление секции не требует правок в коде.
//
// ПРАЙС — ЕДИНСТВЕННЫЙ ИСТОЧНИК ЦЕН
//
// Импорт идёт при каждом деплое, поэтому цена, поправленная в админке,
// вернётся к значению из HTML. Это осознанно: у клиента на руках печатный
// прайс, и он обязан совпадать с сайтом. Менять цену — в price-list.html.
//
// ЛИШНЕЕ ГАСИМ, А НЕ УДАЛЯЕМ
//
// `OrderItem` и `GreenBoxItem` объявлены с Restrict — удаление проданного
// товара просто не пройдёт. `StockMovement` объявлен с Cascade — удаление
// стёрло бы весь складской журнал товара, а из него считается выручка кассы:
// она обнулилась бы задним числом. Единственный безопасный способ убрать
// товар с витрины — `isActive = false`.
// ══════════════════════════════════════════════════════════════════════

const CATALOG_DIR = join(__dirname, '../../../apps/web/public/catalog');

interface Parsed {
  file: string;
  slug: string;
  nameRu: string;
  nameUz: string;
  price: number;
  category: string;
  unit: string;
  descriptionRu: string;
  isHit: boolean;
}

/** `noxat_micro.webp` → `noxat-micro`. Разводит тёзок: руккола есть и в
 *  микрозелени, и в бейби-листе, а имена файлов уже различаются. */
const slugOf = (file: string) => file.replace(/\.(png|webp)$/i, '').replace(/_/g, '-');

const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/**
 * Таблица прайса объявляет о себе сама: категорию, единицу измерения и число
 * строк. Раньше категория выводилась из порядкового номера строки
 * (`index < 18 → микрозелень`), а единица бралась из карты «одна на категорию».
 * Из-за этого вставка строки в середину прайса молча перекладывала товары в
 * чужую категорию, а категория с разными единицами внутри (микс за 100 г и
 * кит за штуку) была невыразима вовсе.
 */
const TABLE_RE = /<table\b([^>]*)>([\s\S]*?)<\/table>/g;

/** `[\s\S]` вместо флага `s`: та же регулярка живёт в тесте витрины
 *  (apps/web/src/lib/production/catalogImport.test.ts), а там target ES2017
 *  и dotAll недоступен. Держим формы одинаковыми, чтобы расхождение было видно. */
const ROW_RE =
  /<td class="c-img"><img src="([^"]+)"[\s\S]*?<td class="c-nm">([^<]*)<span class="c-lt">([^<]*)<\/span>[\s\S]*?<td class="c-pr[^"]*">([^<]*)<\/td>/g;

const attrOf = (tag: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** Цены, названия, категория и единица — из прайса. */
function parsePriceList(): Omit<Parsed, 'descriptionRu' | 'isHit'>[] {
  const html = readFileSync(join(CATALOG_DIR, 'price-list.html'), 'utf8');
  const out: Omit<Parsed, 'descriptionRu' | 'isHit'>[] = [];

  for (const [, tag, body] of html.matchAll(TABLE_RE)) {
    const category = attrOf(tag, 'data-category');
    const unit = attrOf(tag, 'data-unit');
    const declared = Number(attrOf(tag, 'data-count'));

    if (!category || !unit || !Number.isInteger(declared)) {
      throw new Error(
        `В прайсе есть <table> без data-category / data-unit / data-count. ` +
          `Добавили секцию — объявите её: <table data-category="..." data-unit="..." data-count="N">.`,
      );
    }

    const rows = [...body.matchAll(ROW_RE)];
    // Защита на месте разбора: сломанная разметка одной строки раньше просто
    // роняла товар с витрины, и заметить это было нечем.
    if (rows.length !== declared) {
      throw new Error(
        `Секция «${category}»: разобрано ${rows.length} строк вместо ${declared}. Сверьте разметку прайса.`,
      );
    }

    for (const [, file, nameRu, nameUz, priceRaw] of rows) {
      const price = Number(priceRaw.replace(/\D/g, ''));
      if (!price) throw new Error(`Нет цены у «${nameRu.trim()}» (${file})`);
      out.push({
        file,
        slug: slugOf(file),
        nameRu: nameRu.trim(),
        nameUz: nameUz.trim(),
        price,
        category,
        unit,
      });
    }
  }

  if (!out.length) throw new Error('Прайс разобран пустым — проверьте price-list.html');
  return out;
}

/** Описания и теги — из каталога, по имени картинки. */
function parseCatalog(): Map<string, { descriptionRu: string; isHit: boolean }> {
  const html = readFileSync(join(CATALOG_DIR, 'product-catalog.html'), 'utf8');
  const re =
    /<div class="pc-img"><img src="([^"]+)"[^>]*>[\s\S]*?<div class="pc-n">([^<]*)<\/div>[\s\S]*?<div class="pc-nr">([^<]*)<\/div>[\s\S]*?<div class="pc-d">([\s\S]*?)<\/div>[\s\S]*?<div class="pc-t">([\s\S]*?)<\/div>/g;

  const out = new Map<string, { descriptionRu: string; isHit: boolean }>();
  for (const m of html.matchAll(re)) {
    const [, file, , , desc, tags] = m;
    out.set(file, { descriptionRu: strip(desc), isHit: tags.includes('Хит продаж') });
  }
  return out;
}

async function main() {
  const priced = parsePriceList();
  const described = parseCatalog();

  const items: Parsed[] = priced.map((p) => ({
    ...p,
    ...(described.get(p.file) ?? { descriptionRu: '', isHit: false }),
  }));

  const used = [...new Set(items.map((i) => i.category))];
  const categories = await prisma.category.findMany({ where: { slug: { in: used } } });
  const byslug = new Map(categories.map((c) => [c.slug, c.id]));
  for (const slug of used) {
    if (!byslug.has(slug)) throw new Error(`Нет категории «${slug}» — сначала прогоните seed.ts`);
  }

  let created = 0;
  let updated = 0;

  for (const item of items) {
    const data = {
      nameRu: item.nameRu,
      nameUz: item.nameUz,
      price: item.price,
      unit: item.unit,
      descriptionRu: item.descriptionRu || null,
      images: [`/catalog/${item.file}`],
      categoryId: byslug.get(item.category)!,
      isFeatured: item.isHit,
      isActive: true,
    };

    const existing = await prisma.product.findUnique({ where: { slug: item.slug } });
    if (existing) {
      await prisma.product.update({ where: { slug: item.slug }, data });
      updated++;
    } else {
      await prisma.product.create({
        data: { ...data, slug: item.slug, brand: 'Microgreen UZ', stock: 0 },
      });
      created++;
    }
  }

  // Всё, чего нет в прайсе, уходит с витрины. Гасим, а не удаляем:
  // см. комментарий в шапке про StockMovement и выручку кассы.
  const keep = items.map((i) => i.slug);
  const hidden = await prisma.product.updateMany({
    where: { slug: { notIn: keep }, isActive: true },
    data: { isActive: false },
  });

  console.log(`Каталог из прайса: создано ${created}, обновлено ${updated}.`);
  console.log(`Скрыто с витрины (нет в прайсе): ${hidden.count}.`);
  console.log('Цены берутся из price-list.html — правьте там, а не в админке.');
}

// Запускаемся только при прямом вызове. Разборщики прайса и каталога
// импортируются тестами, и без этой проверки простой импорт модуля лез бы
// в базу и падал там, где базы нет.
if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export { parsePriceList, parseCatalog, slugOf };
export type { Parsed };
