import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════════════
// Разовый заполнитель `stock_movements.sold_at` — деловой даты операции.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ, А НЕ ДЕФОЛТ В СХЕМЕ
//
// Колонку сразу объявили бы `DateTime @default(now())` — и Postgres проставил
// бы это значение ВСЕМ существующим строкам разом. Вся история продаж съехала
// бы на момент деплоя: выручка прошлых месяцев схлопнулась бы в один день,
// а отчёты за закрытые периоды перестали бы сходиться с уже отправленными.
//
// Поэтому колонка добавляется нулевой, заполняется здесь построчно из
// `created_at` (для старых записей время записи И ЕСТЬ деловая дата — другой
// у них не было), и только потом становится обязательной с дефолтом.
//
// Скрипт идемпотентен: трогает только строки, где `sold_at IS NULL`.
// Повторный запуск ничего не меняет.
//
//   npx tsx prisma/backfill-sold-at.ts
// ══════════════════════════════════════════════════════════════════════

async function main() {
  // Считаем и пишем СЫРЫМ SQL, а не через модель.
  //
  // Скрипт запускается ПОСРЕДИНЕ миграции: колонка уже добавлена нулевой, но
  // сгенерированный клиент может описывать её как обязательную (он собран из
  // итоговой схемы). Тогда `where: { soldAt: null }` не проходит валидацию
  // Prisma и заполнитель падает — ровно на том шаге, ради которого написан.
  // Сырой запрос от моделей не зависит и отработает при любом клиенте.
  const [{ pending }] = await prisma.$queryRaw<{ pending: bigint }[]>`
    SELECT count(*) AS pending FROM stock_movements WHERE sold_at IS NULL
  `;
  if (Number(pending) === 0) {
    console.log('sold_at: заполнять нечего — пустых строк нет.');
    return;
  }

  console.log(`sold_at: заполняю ${pending} строк из created_at…`);

  // Одним UPDATE, а не построчно: движений склада десятки тысяч, и цикл по
  // ним открыл бы столько же транзакций. Значение берётся из соседней колонки
  // ТОЙ ЖЕ строки, поэтому `updateMany` не годится — он умеет только
  // одинаковое значение на всех.
  const updated = await prisma.$executeRaw`
    UPDATE stock_movements SET sold_at = created_at WHERE sold_at IS NULL
  `;

  const [{ left }] = await prisma.$queryRaw<{ left: bigint }[]>`
    SELECT count(*) AS left FROM stock_movements WHERE sold_at IS NULL
  `;
  console.log(`sold_at: заполнено ${updated}, осталось пустых ${left}.`);
  if (Number(left) > 0) throw new Error('sold_at заполнен не полностью — не переводите колонку в NOT NULL');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
