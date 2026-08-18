// ════════════════════════════════════════════════════════════
// Проверка базы ПЕРЕД миграцией на дробные продажи. Только чтение —
// скрипт ничего не создаёт, не меняет и не удаляет.
//
//   node scripts/db-preflight-sales.mjs
//   DATABASE_URL="postgresql://..." node scripts/db-preflight-sales.mjs
//
// Зачем он нужен
//
// Сама выкатка безопасна: `sold_at` объявлена нулевой, `db push` существующие
// строки не трогает, а заполнители идут той же командой контейнера `db-push`.
// Этот скрипт — не ворота, а способ ПОСМОТРЕТЬ, в каком состоянии база:
// заполнена ли деловая дата, восстановлены ли шапки чеков, влезает ли номер
// заказа витрины в зеркало CRM.
//
// Ненулевой код возврата остаётся ровно на один случай: колонки нет, а
// движения есть И у колонки в схеме появился дефолт. Тогда push действительно
// сотрёт историю, и об этом надо узнать до выкатки, а не после.
//
// Структуру читаем сырым SQL через information_schema: на базе со старой
// структурой Prisma-модели не совпадут, а $queryRawUnsafe отработает.
// ════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of ['.env', 'packages/database/.env']) {
    try {
      const env = await readFile(join(ROOT, file), 'utf8');
      const m = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* файла может не быть */ }
  }
  return null;
}

const url = await resolveUrl();
if (!url) {
  console.error('DATABASE_URL не найден — задайте переменную окружения или пропишите в .env');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
try {
  await prisma.$queryRawUnsafe('select 1');
} catch (e) {
  console.error(`Не удалось подключиться: ${String(e.message).split('\n').find((l) => l.trim()) ?? e.message}`);
  process.exit(1);
}

const q = (sql, ...params) => prisma.$queryRawUnsafe(sql, ...params);

/** Появился ли у `soldAt` дефолт в схеме — единственный опасный сценарий. */
async function defaultInSchema() {
  try {
    const schema = await readFile(join(ROOT, 'packages/database/prisma/schema.prisma'), 'utf8');
    return /soldAt\s+DateTime\s+@default/.test(schema);
  } catch {
    return false;
  }
}

const tableExists = async (t) =>
  (await q('select 1 as x from information_schema.tables where table_schema=current_schema() and table_name=$1', t)).length > 0;

const columnExists = async (t, c) =>
  (await q('select 1 as x from information_schema.columns where table_schema=current_schema() and table_name=$1 and column_name=$2', t, c)).length > 0;

// count(*)::int — иначе Postgres вернёт bigint, а он не сериализуется в JSON
const countRows = async (sql) => {
  try { return Number((await q(sql))[0].n); }
  catch { return null; }
};

const host = (() => { try { return new URL(url).host; } catch { return '—'; } })();
console.log(`\nБаза: ${host}\n${'─'.repeat(52)}`);

const blockers = [];
const todo = [];

// ── 1. Деловая дата продажи ──
console.log('\n1. stock_movements.sold_at (деловая дата)');
if (!await tableExists('stock_movements')) {
  console.log('   таблицы нет — база пустая, db push безопасен ✓');
} else {
  const movements = await countRows('select count(*)::int as n from stock_movements');
  const hasSoldAt = await columnExists('stock_movements', 'sold_at');

  if (!hasSoldAt && movements > 0) {
    // Колонка появится нулевой — существующие строки push не тронет, а
    // значения им проставит заполнитель сразу после (см. docker-compose.prod).
    console.log(`   колонки ещё нет, движений ${movements}`);
    console.log('   db push добавит её НУЛЕВОЙ и историю не тронет; заполнитель идёт следом ✓');
    if (await defaultInSchema()) {
      console.log('   ⚠ но в schema.prisma у колонки появился @default — тогда push сотрёт историю');
      blockers.push('Уберите @default у soldAt: на непустой таблице он проставит момент деплоя всем строкам');
    }
  } else if (!hasSoldAt) {
    console.log('   колонки нет, движений 0 — db push безопасен ✓');
  } else {
    const empty = await countRows('select count(*)::int as n from stock_movements where sold_at is null');
    if (empty > 0) {
      console.log(`   ⚠ колонка есть, но у ${empty} строк она пустая`);
      todo.push('npx tsx prisma/backfill-sold-at.ts — заполнить sold_at из created_at');
    } else {
      console.log(`   колонка на месте, пустых значений нет (движений ${movements}) ✓`);
    }
  }
}

// ── 2. Шапки чеков ──
console.log('\n2. pos_sales (шапка чека)');
if (!await tableExists('pos_sales')) {
  console.log('   таблицы нет — будет создана при db push');
} else if (!await columnExists('stock_movements', 'sale_id')) {
  console.log('   ⚠ таблица есть, а ссылки stock_movements.sale_id нет — структура рассогласована');
} else {
  const orphans = await countRows(
    "select count(*)::int as n from stock_movements " +
    "where sale_id is null and order_id is null and sale_price is not null " +
    "and (reason like '%(S-%' or reason like '%(R-%')",
  );
  if (orphans > 0) {
    console.log(`   ⚠ ${orphans} движений старых чеков без шапки`);
    console.log('   в отчёте смены такие чеки не сгруппируются, а возврат по ним пойдёт запасным путём');
    todo.push('npx tsx prisma/backfill-pos-sales.ts — восстановить шапки прошлых чеков');
  } else {
    console.log('   все чеки со шапками ✓');
  }
}

// ── 3. Номер заказа в зеркале CRM ──
console.log('\n3. crm_orders.order_number (ширина колонки)');
if (!await tableExists('crm_orders')) {
  console.log('   таблицы нет — будет создана при db push');
} else {
  const rows = await q(
    'select coalesce(character_maximum_length, 0)::int as len from information_schema.columns ' +
    "where table_schema=current_schema() and table_name='crm_orders' and column_name='order_number'",
  );
  const len = rows.length ? Number(rows[0].len) : 0;
  if (len && len < 32) {
    console.log(`   ⚠ VarChar(${len}) — номер витрины занимает 23 символа`);
    console.log('   заказы с сайта НЕ доезжают до CRM: вставка падает, ошибка гасится в /ingest/order');
    todo.push('db push расширит колонку до VarChar(32) — после деплоя проверьте, что заказы появляются в офисе');
  } else {
    console.log(`   VarChar(${len || '—'}) — номер витрины помещается ✓`);
  }
}

// ── Итог ──
console.log(`\n${'─'.repeat(52)}`);
if (blockers.length === 0 && todo.length === 0) {
  console.log('Всё на месте — миграция безопасна.\n');
} else {
  for (const t of todo) console.log(`  • ${t}`);
  for (const b of blockers) console.log(`  ✗ ${b}`);
  console.log('');
}

await prisma.$disconnect();

// Ненулевой код только у того, что теряет данные. Незаполненный backfill —
// это «сделайте после», а не «остановитесь»: он чинится повторным запуском.
if (blockers.length > 0) process.exit(1);
