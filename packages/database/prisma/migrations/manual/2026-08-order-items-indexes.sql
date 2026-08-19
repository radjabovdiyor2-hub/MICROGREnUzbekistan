-- ════════════════════════════════════════════════════════════
-- Индексы `order_items` и сортировок каталога.
--
-- ЗАЧЕМ
--
-- У `order_items` не было НИ ОДНОГО индекса, а Postgres не индексирует внешние
-- ключи сам. Значит, каждый из этих запросов шёл последовательным сканом всей
-- таблицы позиций:
--
--   • `orderItem.count({ where: { productId } })` — проверка перед удалением
--     товара в админке. Это и есть «кнопка удаления думает несколько секунд».
--   • `include: { items: … }` в списке заказов, книге продаж и зеркале CRM.
--
-- `products (created_at)` и `products (price)` покрывают сортировки каталога
-- `newest` и `price_asc`/`price_desc` (apps/web/src/app/api/products/route.ts):
-- без них любая сортировка, кроме «сначала избранные», читала таблицу целиком
-- и сортировала результат в памяти.
--
-- Имена совпадают с теми, что генерирует Prisma по @@index в schema.prisma,
-- поэтому последующий `db push` НЕ будет их пересоздавать.
--
-- CONCURRENTLY — создание без блокировки записи в таблицу.
-- ⚠️ CREATE INDEX CONCURRENTLY нельзя выполнять внутри транзакции — запускать
--    по одному, без BEGIN/COMMIT. Поэтому файл НЕ обёрнут в транзакцию.
--
-- Запуск (idempotent — повторный прогон безопасен):
--   psql "$DATABASE_URL" -f packages/database/prisma/migrations/manual/2026-08-order-items-indexes.sql
-- ════════════════════════════════════════════════════════════

-- Позиции заказа: и по заказу (список заказов), и по товару (удаление товара)
CREATE INDEX CONCURRENTLY IF NOT EXISTS order_items_order_id_idx   ON order_items (order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS order_items_product_id_idx ON order_items (product_id);

-- Каталог: сортировки «сначала новые» и по цене
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_created_at_idx ON products (created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_price_idx      ON products (price);
