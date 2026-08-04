-- ════════════════════════════════════════════════════════════
-- Поиск клиента «как назвал человек» — индексы под shared/customer_repo.py
--
-- ЗАЧЕМ. Карточку клиента искали точным сравнением имени (`ILIKE :n` без
-- процентов), поэтому «Ресторан Жасмин» не находил «Жасмин», а латиница не
-- находила кириллицу. Продажа каждый раз заводила новую карточку. customer_repo
-- ищет подстрокой по всем написаниям и нечётко через pg_trgm — эти индексы
-- нужны, чтобы такой поиск не превращался в seq scan по всей базе клиентов.
--
-- Prisma триграммные индексы в schema.prisma не выражает, поэтому они здесь.
-- Именами они не пересекаются с генерируемыми Prisma (`customers_*_idx`),
-- поэтому последующий `db push` их НЕ тронет.
--
-- Поиск работает и БЕЗ этого файла: customer_repo ловит отсутствие pg_trgm и
-- честно остаётся без нечёткого прохода. Индексы — про скорость, не про
-- корректность.
--
-- ⚠️ CREATE INDEX CONCURRENTLY нельзя выполнять внутри транзакции — файл
--    намеренно НЕ обёрнут в BEGIN/COMMIT.
--
-- Запуск (idempotent — повторный прогон безопасен):
--   psql "$DATABASE_URL" -f packages/database/prisma/migrations/manual/2026-08-customer-search.sql
-- ════════════════════════════════════════════════════════════

-- Расширение уже поднимается в apps/tgas/database/init.sql, но на базе,
-- созданной Prisma с нуля, его нет — а без него оба индекса ниже не создадутся.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Нечёткий поиск и ILIKE '%...%' по имени и названию компании.
-- GIN + gin_trgm_ops покрывает оба: и word_similarity, и подстроку.
CREATE INDEX CONCURRENTLY IF NOT EXISTS customers_name_trgm_idx
  ON customers USING gin (lower(name) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS customers_company_name_trgm_idx
  ON customers USING gin (lower(company_name) gin_trgm_ops);

-- Поиск по телефону идёт по последним 9 цифрам, потому что в базе лежат
-- исторические записи в четырёх форматах («+998 66 233-45-67», «998662334567»,
-- «662334567»). Обычный индекс по колонке такому сравнению не помогает —
-- нужен функциональный, ровно по тому же выражению, что в customer_repo.
CREATE INDEX CONCURRENTLY IF NOT EXISTS customers_phone_tail_idx
  ON customers (RIGHT(regexp_replace(phone, '\D', '', 'g'), 9));
