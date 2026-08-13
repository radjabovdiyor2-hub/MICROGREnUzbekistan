-- ============================================================================
-- Migration: Unify databases — move CRM tables into Prisma-managed database
-- ============================================================================
-- Выполняется НА БЭКЕНДЕ ДО/ПОСЛЕ prisma db push.
-- Скрипт идемпотентный (безопасен для повторных запусков).
-- ============================================================================

-- ── Шаг 0: Расширения, без которых db push не проходит ──────────────────
--
-- knowledge_base.embedding объявлен как Unsupported("vector(1536)"), поэтому
-- `prisma db push` создаёт колонку типа vector. На проде расширение включено
-- давно (осталось от apps/tgas/database/init.sql, который в прод больше не
-- монтируется), и именно поэтому поломка не видна: на пересозданном томе
-- деплой упал бы на db-push с `type "vector" does not exist` — ровно так,
-- как упал CI. Строка идемпотентная и на живой базе ничего не делает.
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Шаг 1: Переименовать конфликтующие таблицы ──────────────────────────

-- products (init.sql) → crm_products
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'products'
    AND table_schema = 'public'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'id'
    AND data_type = 'integer'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_products'
    AND table_schema = 'public'
  )
  THEN
    ALTER TABLE products RENAME TO crm_products;
    RAISE NOTICE 'products → crm_products';
  END IF;
END $$;

-- orders (init.sql) → crm_orders
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'orders'
    AND table_schema = 'public'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'id'
    AND data_type = 'integer'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_orders'
    AND table_schema = 'public'
  )
  THEN
    ALTER TABLE orders RENAME TO crm_orders;
    RAISE NOTICE 'orders → crm_orders';
  END IF;
END $$;

-- order_items (init.sql) → crm_order_items
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items'
    AND table_schema = 'public'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'id'
    AND data_type = 'integer'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_order_items'
    AND table_schema = 'public'
  )
  THEN
    ALTER TABLE order_items RENAME TO crm_order_items;
    RAISE NOTICE 'order_items → crm_order_items';
  END IF;
END $$;

-- employees (init.sql) → crm_employees
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'employees'
    AND table_schema = 'public'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'id'
    AND data_type = 'integer'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_employees'
    AND table_schema = 'public'
  )
  THEN
    ALTER TABLE employees RENAME TO crm_employees;
    RAISE NOTICE 'employees → crm_employees';
  END IF;
END $$;

-- ── Шаг 2: Снятие старых CHECK-ограничений и переименование ключей/последовательностей ─
ALTER TABLE crm_orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE crm_orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE crm_orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE crm_products DROP CONSTRAINT IF EXISTS products_category_check;
ALTER TABLE crm_products DROP CONSTRAINT IF EXISTS products_unit_check;
ALTER TABLE crm_employees DROP CONSTRAINT IF EXISTS employees_status_check;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_pkey') THEN
    ALTER TABLE crm_orders RENAME CONSTRAINT orders_pkey TO crm_orders_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_number_key') THEN
    ALTER TABLE crm_orders RENAME CONSTRAINT orders_order_number_key TO crm_orders_order_number_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_pkey') THEN
    ALTER TABLE crm_products RENAME CONSTRAINT products_pkey TO crm_products_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_pkey') THEN
    ALTER TABLE crm_order_items RENAME CONSTRAINT order_items_pkey TO crm_order_items_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_pkey') THEN
    ALTER TABLE crm_employees RENAME CONSTRAINT employees_pkey TO crm_employees_pkey;
  END IF;
END $$;

ALTER SEQUENCE IF EXISTS orders_id_seq RENAME TO crm_orders_id_seq;
ALTER SEQUENCE IF EXISTS products_id_seq RENAME TO crm_products_id_seq;
ALTER SEQUENCE IF EXISTS order_items_id_seq RENAME TO crm_order_items_id_seq;
ALTER SEQUENCE IF EXISTS employees_id_seq RENAME TO crm_employees_id_seq;

-- ── Шаг 3: web_user_id колонка (связка Customer ↔ User) ────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS web_user_id VARCHAR(255) UNIQUE;

-- ── Шаг 4: Таблицы состояния ботов (если не были созданы Prisma) ─────────
CREATE TABLE IF NOT EXISTS content_publications (
    id SERIAL PRIMARY KEY,
    date VARCHAR(10) NOT NULL,
    slot VARCHAR(20) NOT NULL,
    published_at VARCHAR(5),
    ig_posted BOOLEAN DEFAULT FALSE,
    media_id VARCHAR(64),
    file_path TEXT,
    caption TEXT,
    title VARCHAR(255),
    reach INTEGER,
    likes INTEGER,
    comments INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(date, slot)
);
CREATE INDEX IF NOT EXISTS idx_content_pub_date ON content_publications(date);

CREATE TABLE IF NOT EXISTS knowledge_base (
    id SERIAL PRIMARY KEY,
    chunk TEXT NOT NULL,
    embedding vector(1536),
    source VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
