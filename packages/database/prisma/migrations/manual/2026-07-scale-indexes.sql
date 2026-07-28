-- ════════════════════════════════════════════════════════════
-- Индексы для масштабирования ГОРЯЧИХ запросов (готовность к росту нагрузки).
--
-- Соответствуют @@index в schema.prisma. Имена совпадают с теми, что генерирует
-- Prisma, поэтому последующий `db push` НЕ будет их пересоздавать.
--
-- CONCURRENTLY — создание без блокировки записи в таблицу (важно на большой БД).
-- ⚠️ CREATE INDEX CONCURRENTLY нельзя выполнять внутри транзакции — запускать по
--    одному, без BEGIN/COMMIT. Поэтому файл НЕ обёрнут в транзакцию.
--
-- Запуск (idempotent — повторный прогон безопасен):
--   psql "$DATABASE_URL" -f packages/database/prisma/migrations/manual/2026-07-scale-indexes.sql
-- ════════════════════════════════════════════════════════════

-- Заказы: списки с пагинацией «сначала новые»
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_user_id_created_at_idx ON orders (user_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_status_created_at_idx ON orders (status, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_phone_idx             ON orders (phone);

-- Каталог: товары категории, только активные
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_category_id_is_active_idx ON products (category_id, is_active);

-- Отзывы товара (лента отзывов на странице товара)
CREATE INDEX CONCURRENTLY IF NOT EXISTS reviews_product_id_idx ON reviews (product_id);

-- Устаревшие одиночные индексы заказов заменены композитными (их дропнет `db push`):
--   DROP INDEX CONCURRENTLY IF EXISTS orders_user_id_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS orders_status_idx;
