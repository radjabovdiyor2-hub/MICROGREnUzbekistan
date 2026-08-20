import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════════════
// Разовый переписыватель расширения картинок товаров: `.png` → `.webp`.
//
// ЗАЧЕМ ОН НУЖЕН, ЕСЛИ ЕСТЬ import-catalog
//
// Файлы public/catalog и public/uploads перекодированы в WebP, исходные PNG
// удалены. Ссылки в базе при этом остались старыми, и починятся они не везде:
//
//   • `/catalog/*` — чинит `import-catalog.ts`: он гоняется на КАЖДОМ деплое
//     и переписывает `images` из price-list.html, где расширения уже новые.
//   • `/uploads/*` — не чинит НИКТО. Их проставляет `seed.ts`, а он
//     запускается только на пустом каталоге (см. seed-if-empty.ts). На
//     рабочем проде каталог не пуст — значит товары так и остались бы со
//     ссылками на удалённые файлы, то есть с битыми картинками.
//
// Поэтому переписываем прямо в базе, а не полагаемся на сидер.
//
// Скрипт идемпотентен: `.webp` он не трогает, повторный запуск ничего не
// меняет. Внешние адреса (http/https) не трогает тоже — там свои файлы.
//
//   npx tsx prisma/backfill-image-ext.ts
// ══════════════════════════════════════════════════════════════════════

/** Локальные каталоги, чьи файлы перекодированы. Внешние URL не трогаем. */
const LOCAL_PREFIXES = ['/catalog/', '/uploads/'];

const rewrite = (url: string): string =>
  LOCAL_PREFIXES.some((p) => url.startsWith(p)) ? url.replace(/\.png$/i, '.webp') : url;

async function main() {
  const products = await prisma.product.findMany({ select: { id: true, images: true } });

  let touched = 0;
  for (const product of products) {
    const next = product.images.map(rewrite);
    // Сравниваем поэлементно, а не по JSON: порядок в массиве значим (первая
    // картинка — обложка карточки), и сохранять надо только реально изменённые.
    if (next.every((url, i) => url === product.images[i])) continue;

    await prisma.product.update({ where: { id: product.id }, data: { images: next } });
    touched++;
  }

  console.log(
    touched === 0
      ? `🖼  backfill-image-ext: переписывать нечего (${products.length} товаров уже на .webp)`
      : `🖼  backfill-image-ext: обновлено ${touched} из ${products.length} товаров`,
  );
}

main()
  .catch((e) => {
    console.error('backfill-image-ext failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
