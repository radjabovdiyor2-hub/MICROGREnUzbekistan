import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════════════
// Каталог витрины из прайса и каталога — они и есть источник правды.
//
// `apps/web/public/catalog/price-list.html` и `product-catalog.html` — те
// самые файлы, что владелец отдаёт клиентам: 34 позиции в трёх категориях.
// Раньше состав базы жил отдельной жизнью: там было ~50 товаров, включая
// оборудование и наборы, которых в прайсе нет вовсе, а количество не
// сходилось ни по одной категории.
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

/** Единица измерения по категории — в прайсе она указана в шапке таблицы. */
const CATEGORY_UNIT: Record<string, string> = {
  microgreens: 'лоток',
  'baby-leaf': '100 г',
  salads: 'кг',
};

interface Parsed {
  file: string;
  slug: string;
  nameRu: string;
  nameUz: string;
  price: number;
  descriptionRu: string;
  isHit: boolean;
}

/** `noxat_micro.png` → `noxat-micro`. Разводит тёзок: руккола есть и в
 *  микрозелени, и в бейби-листе, а имена файлов уже различаются. */
const slugOf = (file: string) => file.replace(/\.png$/i, '').replace(/_/g, '-');

const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Цены и названия — из прайса. Порядок строк = порядок категорий в файле. */
function parsePriceList(): Omit<Parsed, 'descriptionRu' | 'isHit'>[] {
  const html = readFileSync(join(CATALOG_DIR, 'price-list.html'), 'utf8');
  // `[\s\S]` вместо флага `s`: та же регулярка живёт в тесте витрины
  // (apps/web/src/lib/production/catalogImport.test.ts), а там target ES2017
  // и dotAll недоступен. Держим формы одинаковыми, чтобы расхождение было видно.
  const re =
    /<td class="c-img"><img src="([^"]+)"[\s\S]*?<td class="c-nm">([^<]*)<span class="c-lt">([^<]*)<\/span>[\s\S]*?<td class="c-pr[^"]*">([^<]*)<\/td>/g;

  const out: Omit<Parsed, 'descriptionRu' | 'isHit'>[] = [];
  for (const m of html.matchAll(re)) {
    const [, file, nameRu, nameUz, priceRaw] = m;
    const price = Number(priceRaw.replace(/\D/g, ''));
    if (!price) throw new Error(`Нет цены у «${nameRu.trim()}» (${file})`);
    out.push({ file, slug: slugOf(file), nameRu: nameRu.trim(), nameUz: nameUz.trim(), price });
  }
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

/** Категория по номеру строки: прайс идёт микрозелень → бейби-лист → салаты. */
function categoryOf(index: number): keyof typeof CATEGORY_UNIT {
  if (index < 18) return 'microgreens';
  if (index < 28) return 'baby-leaf';
  return 'salads';
}

async function main() {
  const priced = parsePriceList();
  const described = parseCatalog();

  if (priced.length !== 34) {
    throw new Error(`Прайс разобран неверно: ${priced.length} позиций вместо 34`);
  }

  const items: (Parsed & { category: string })[] = priced.map((p, i) => ({
    ...p,
    ...(described.get(p.file) ?? { descriptionRu: '', isHit: false }),
    category: categoryOf(i),
  }));

  const categories = await prisma.category.findMany({
    where: { slug: { in: Object.keys(CATEGORY_UNIT) } },
  });
  const byslug = new Map(categories.map((c) => [c.slug, c.id]));
  for (const slug of Object.keys(CATEGORY_UNIT)) {
    if (!byslug.has(slug)) throw new Error(`Нет категории «${slug}» — сначала прогоните seed.ts`);
  }

  let created = 0;
  let updated = 0;

  for (const item of items) {
    const data = {
      nameRu: item.nameRu,
      nameUz: item.nameUz,
      price: item.price,
      unit: CATEGORY_UNIT[item.category],
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

export { parsePriceList, parseCatalog, slugOf, categoryOf, CATEGORY_UNIT };
export type { Parsed };
