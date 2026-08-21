import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Bootstrap seed guard for production deploys.
// The storefront DB (microgreen_db) gets its schema from `prisma db push`
// (compose service `db-push`) but NO data — so a fresh/empty prod comes up with
// an empty catalog. This runs the full seed ONLY when the catalog is empty, so:
//   - empty prod  -> catalog is populated
//   - populated prod -> skipped (never overwrites admin-edited prices/stock,
//     which seed.ts's upsert `update` branch would otherwise reset)
// Safe to run on every deploy. Web does NOT depend on this completing.
function runSeed(file: string) {
  // Resolve the sibling script from this module's URL so it's independent
  // of the launch cwd.
  const seedPath = fileURLToPath(new URL(file, import.meta.url));
  execSync(`npx tsx "${seedPath}"`, { stdio: 'inherit' });
}

async function run() {
  // ── Справочник культур — ВСЕГДА, отдельно от каталога ──
  //
  // Проверка «каталог пуст» тут не подходит: на рабочем проде каталог не пуст,
  // и весь блок ниже пропускается. Нормы культур при этом остались бы пустыми,
  // а без них посадка отказывает по КАЖДОЙ культуре («не заданы нормы расхода»)
  // — то есть производственный цикл не заработал бы после выкладки вообще.
  //
  // Сам скрипт идемпотентен: уже существующие (и уточнённые владельцем) нормы
  // он не трогает, поэтому безопасен на каждом деплое.
  runSeed('./seed-crop-norms.ts');

  // ── Справочник сырья — сразу после норм, потому что читает их ──
  //
  // До 10.08.2026 позиции сырья не засевались нигде: их заводили руками, и
  // на проде оказались одни семена гороха. Посадка ищет семена по культуре,
  // поэтому «посади кейл» упиралось не в нехватку, а в отсутствие позиции.
  // Остатки сидер ставит нулевые — сколько лежит, знает только владелец.
  runSeed('./seed-raw-materials.ts');

  // ── Справочник заведений области — ВСЕГДА, по той же причине ──
  //
  // Раздел «Клиенты» и карта на проде стояли пустыми: ночной сбор берёт по
  // одной категории за ночь и закрывает справочник за 14 ночей, а до тех пор
  // владелец открывает пустой экран. Здесь ложится основа — 211 заведений
  // Самарканда из открытых справочников (goldenpages.uz, top.uz, samcity.uz),
  // с которой уже можно работать в первый же день.
  //
  // Сидер идемпотентен по ключу (source, source_ref) и НЕ трогает ручной пин,
  // выясненную продавцом аудиторию и статус клиента — поэтому безопасен на
  // каждом деплое. Координаты он не ставит: их проставит геокодер офиса по
  // адресу через 2ГИС.
  runSeed('./seed-venues.ts');

  // ── Категории — ВСЕГДА, по той же причине, что нормы культур ──
  //
  // Их заводил только `seed.ts`, а он ниже запускается лишь при пустом
  // каталоге. На рабочем проде каталог не пуст, поэтому новая категория
  // (BALANS) не появилась бы, а `import-catalog.ts` на неизвестной категории
  // падает и роняет весь шаг засева деплоя.
  runSeed('./seed-categories.ts');

  // ── Расширение картинок — ВСЕГДА, по той же причине ──
  //
  // Файлы каталога перекодированы в WebP, исходные PNG удалены. `/catalog/*`
  // починит `import-catalog.ts` ниже, а `/uploads/*` проставляет только
  // `seed.ts` — а он на непустом каталоге не запускается. Без этой строки
  // товары прода остались бы со ссылками на удалённые файлы.
  //
  // Идемпотентен: `.webp` не трогает, повторный прогон ничего не меняет.
  runSeed('./backfill-image-ext.ts');

  const prisma = new PrismaClient();
  let count = 0;
  try {
    count = await prisma.product.count();
  } finally {
    await prisma.$disconnect();
  }

  if (count === 0) {
    console.log('🌱 seed-if-empty: catalog is empty — running full seed…');
    runSeed('./seed.ts');
  } else {
    console.log(`🌱 seed-if-empty: catalog already has ${count} products — skipping base seed.`);
  }

  // ── Каталог из прайса — ВСЕГДА, как и нормы культур ──
  //
  // Источник правды по составу и ценам — те самые два файла, которые владелец
  // отдаёт клиентам: apps/web/public/catalog/{price-list,product-catalog}.html.
  // Раньше база жила отдельной жизнью: ~50 товаров против 34 в прайсе, плюс
  // оборудование и наборы, которых в прайсе нет вовсе.
  //
  // Импорт идемпотентен: upsert по slug плюс гашение того, чего в прайсе нет.
  // Следствие, о котором надо помнить: цена, поправленная в админке, вернётся
  // к значению из HTML на следующем деплое. Менять цену — в price-list.html,
  // чтобы печатный прайс у клиента и сайт не расходились.
  runSeed('./import-catalog.ts');
}

run().catch((e) => {
  console.error('seed-if-empty failed:', e);
  process.exit(1);
});
