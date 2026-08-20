import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════════════
// Разовый заполнитель `product_name` в позициях заказов и движениях склада.
//
// ЗАЧЕМ
//
// Товар теперь можно удалить из каталога окончательно: связь обнуляется
// (`onDelete: SetNull`), а строка истории остаётся. Название такой строки
// живёт в снимке `product_name` — ровно как цена позиции живёт в `price`.
//
// У записей, сделанных до появления колонки, снимка нет. Пока товар в
// каталоге, название придёт из живой связи и разницы не видно. Но стоит
// удалить товар — и в книге продаж появится безымянная сумма, задним числом
// и без возможности восстановить, что именно продали.
//
// Поэтому колонка добавляется НУЛЕВОЙ (иначе `db push` на проде потребовал бы
// значение для существующих строк), а здесь заполняется из текущей карточки.
//
// Скрипт идемпотентен: трогает только строки, где `product_name IS NULL`
// и товар ещё существует. Повторный запуск ничего не меняет.
//
//   npx tsx prisma/backfill-product-names.ts
// ══════════════════════════════════════════════════════════════════════

/**
 * Сырой SQL, а не модели — по той же причине, что и в `backfill-sold-at`:
 * скрипт работает ПОСРЕДИНЕ миграции, и сгенерированный клиент может ещё не
 * знать о колонке. Одним UPDATE с JOIN: строк десятки тысяч, и цикл по ним
 * открыл бы столько же транзакций.
 */
async function fill(table: string, label: string): Promise<void> {
  const [{ pending }] = await prisma.$queryRawUnsafe<{ pending: bigint }[]>(
    `SELECT count(*) AS pending FROM ${table} WHERE product_name IS NULL AND product_id IS NOT NULL`,
  );
  if (Number(pending) === 0) {
    console.log(`${label}: заполнять нечего.`);
    return;
  }

  console.log(`${label}: заполняю ${pending} строк из карточек товаров…`);
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE ${table} AS t SET product_name = p.name_uz
       FROM products AS p
      WHERE t.product_id = p.id AND t.product_name IS NULL`,
  );

  const [{ left }] = await prisma.$queryRawUnsafe<{ left: bigint }[]>(
    `SELECT count(*) AS left FROM ${table} WHERE product_name IS NULL AND product_id IS NOT NULL`,
  );
  console.log(`${label}: заполнено ${updated}, осталось пустых ${left}.`);

  // Не бросаем: остаться могли только строки, чей товар уже удалён из
  // каталога другим путём. Восстанавливать название неоткуда, а падение
  // заполнителя остановило бы выкатку целиком — цена несоразмерна.
  if (Number(left) > 0) {
    console.warn(`${label}: у ${left} строк товар не найден — название останется пустым.`);
  }
}

async function main() {
  await fill('order_items', 'order_items.product_name');
  await fill('stock_movements', 'stock_movements.product_name');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
