// ════════════════════════════════════════════════════════════
// Проверка состояния базы ПЕРЕД миграцией. Только чтение —
// скрипт ничего не создаёт, не меняет и не удаляет.
//
//   node scripts/db-preflight.mjs
//   DATABASE_URL="postgresql://..." node scripts/db-preflight.mjs
//
// Зачем: `prisma db push` переименование колонки делает как DROP + ADD и
// молча теряет данные. Перед запуском нужно видеть, что именно стоит на кону:
// сколько строк в magazine_events, живы ли данные в magazine_issues, какие
// новые таблицы уже созданы.
//
// Структуру читаем сырым SQL через information_schema. Prisma-клиент здесь
// безопасен именно потому, что $queryRawUnsafe не смотрит на модели: на базе
// со старой структурой запрос всё равно отработает.
// ════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const NEW_TABLES = ['dishes', 'guest_photos', 'loyalty_cards', 'recipes', 'recipe_steps', 'recipe_ingredients'];
const NEW_COLUMNS = [['restaurants', 'loyalty_goal'], ['restaurants', 'loyalty_reward_percent']];

async function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = await readFile(join(ROOT, '.env'), 'utf8');
    const m = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* .env может не быть */ }
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
  console.error('Проверьте DATABASE_URL: хост, порт, пользователя и пароль.');
  process.exit(1);
}

const q = (sql, ...params) => prisma.$queryRawUnsafe(sql, ...params);

const tableExists = async (t) =>
  (await q('select 1 as x from information_schema.tables where table_schema=current_schema() and table_name=$1', t)).length > 0;

const columnExists = async (t, c) =>
  (await q('select 1 as x from information_schema.columns where table_schema=current_schema() and table_name=$1 and column_name=$2', t, c)).length > 0;

// count(*)::int — иначе Postgres вернёт bigint, а он не сериализуется в JSON
const countRows = async (t) => {
  try { return Number((await q(`select count(*)::int as n from "${t}"`))[0].n); }
  catch { return null; }
};

const host = (() => { try { return new URL(url).host; } catch { return '—'; } })();
console.log(`\nБаза: ${host}\n${'─'.repeat(52)}`);

// ── 1. Переименование колонки событий ──
const hasEvents = await tableExists('magazine_events');
const hasChar = hasEvents && await columnExists('magazine_events', 'char_id');
const hasDish = hasEvents && await columnExists('magazine_events', 'dish_id');
const eventRows = hasEvents ? await countRows('magazine_events') : null;

console.log('\n1. magazine_events (история событий)');
if (!hasEvents) {
  console.log('   таблицы нет — будет создана, терять нечего');
} else {
  console.log(`   строк: ${eventRows}`);
  if (hasChar && !hasDish) {
    console.log('   колонка: char_id  → нужен ручной SQL');
    if (eventRows > 0) console.log(`   ⚠ без него db push удалит char_id и потеряет ${eventRows} записей`);
  } else if (hasDish && !hasChar) {
    console.log('   колонка: dish_id  → переименование уже выполнено ✓');
  } else if (hasDish && hasChar) {
    console.log('   ⚠ есть ОБЕ колонки — перенесите данные вручную и удалите лишнюю');
  } else {
    console.log('   ⚠ нет ни char_id, ни dish_id — проверьте структуру таблицы');
  }
}

// ── 2. Мёртвая таблица выпусков ──
const hasIssues = await tableExists('magazine_issues');
const issueRows = hasIssues ? await countRows('magazine_issues') : null;
console.log('\n2. magazine_issues (удаляется при db push)');
if (!hasIssues) {
  console.log('   таблицы уже нет ✓');
} else if (issueRows === 0) {
  console.log('   есть, строк 0 — удалять безопасно');
} else {
  console.log(`   ⚠ есть, строк ${issueRows} — данные будут ПОТЕРЯНЫ`);
  console.log('   раскомментируйте блок бэкапа в migrations/manual/2026-07-pre-push.sql');
}

// ── 3. Новые таблицы и колонки ──
console.log('\n3. Новые таблицы');
const missingTables = [];
for (const t of NEW_TABLES) {
  const ok = await tableExists(t);
  if (!ok) missingTables.push(t);
  console.log(`   ${ok ? '✓' : '·'} ${t}${ok ? '' : ' — будет создана'}`);
}
const missingColumns = [];
for (const [t, c] of NEW_COLUMNS) {
  const ok = await tableExists(t) && await columnExists(t, c);
  if (!ok) missingColumns.push(`${t}.${c}`);
}
if (missingColumns.length) console.log(`   · ${missingColumns.join(', ')} — будут добавлены`);

// ── Вердикт ──
console.log(`\n${'─'.repeat(52)}`);
const needsSql = hasChar && !hasDish;
const nothingToDo = !needsSql && !missingTables.length && !missingColumns.length && !hasIssues;

if (nothingToDo) {
  console.log('ВЕРДИКТ: миграция уже применена, делать нечего.');
} else if (needsSql) {
  console.log('ВЕРДИКТ: нужен ручной SQL, потом db push.\n');
  console.log('  pg_dump "$DATABASE_URL" > backup-$(date +%F).sql');
  console.log('  psql "$DATABASE_URL" -f packages/database/prisma/migrations/manual/2026-07-pre-push.sql');
  console.log('  npx prisma db push --schema=packages/database/prisma/schema.prisma --accept-data-loss');
  console.log('  npm run db:generate');
  console.log('\n  (--accept-data-loss нужен: удаляются мёртвая magazine_issues');
  console.log('   и её колонка magazine_subscribers.issue_id. Без флага push откажется.)');
} else {
  console.log('ВЕРДИКТ: опасных шагов нет, достаточно db push.\n');
  console.log('  pg_dump "$DATABASE_URL" > backup-$(date +%F).sql');
  console.log('  npx prisma db push --schema=packages/database/prisma/schema.prisma --accept-data-loss');
  console.log('  npm run db:generate');
  console.log('\n  (--accept-data-loss нужен: удаляются мёртвая magazine_issues');
  console.log('   и её колонка magazine_subscribers.issue_id. Без флага push откажется.)');
}
console.log('\nПодробности: docs/db-migration.md\n');

await prisma.$disconnect();
