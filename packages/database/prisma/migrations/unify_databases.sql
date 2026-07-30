-- ============================================================================
-- Migration: Unify databases — move CRM tables into Prisma-managed database
-- ============================================================================
-- Выполнять НА БЭКЕНДЕ после prisma db push.
-- Этот скрипт:
--   1. Переименовывает init.sql таблицы с конфликтующими именами в crm_* 
--   2. Создаёт обратные views для совместимости с ботами (временно)
--   3. Создаёт новые таблицы для контент-публикаций и состояния совещаний
-- ============================================================================

-- ── Шаг 1: Переименовать конфликтующие таблицы ──────────────────────────

-- products (init.sql) → crm_products
-- Проверяем: если crm_products ещё нет, а products (с integer PK) есть
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
    -- Обратный view для совместимости бот-SQL
    CREATE OR REPLACE VIEW products AS SELECT * FROM crm_products;
    RAISE NOTICE 'products → crm_products (view создан)';
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
    CREATE OR REPLACE VIEW orders AS SELECT * FROM crm_orders;
    RAISE NOTICE 'orders → crm_orders (view создан)';
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
    CREATE OR REPLACE VIEW order_items AS SELECT * FROM crm_order_items;
    RAISE NOTICE 'order_items → crm_order_items (view создан)';
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
    CREATE OR REPLACE VIEW employees AS SELECT * FROM crm_employees;
    RAISE NOTICE 'employees → crm_employees (view создан)';
  END IF;
END $$;

-- ── Шаг 2: web_user_id колонка (связка Customer ↔ User) ────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS web_user_id VARCHAR(255) UNIQUE;

-- ── Шаг 3: Таблицы состояния ботов ──────────────────────────────────────
-- content_publications — замена content_status.json
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

-- knowledge_base — векторная база знаний
CREATE TABLE IF NOT EXISTS knowledge_base (
    id SERIAL PRIMARY KEY,
    chunk TEXT NOT NULL,
    embedding vector(1536),
    source VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ── Готово ───────────────────────────────────────────────────────────────
-- После выполнения этого скрипта:
-- 1. Prisma владеет crm_products, crm_orders, crm_order_items, crm_employees
-- 2. Views products, orders, order_items, employees обеспечивают обратную
--    совместимость для бот-SQL
-- 3. Постепенно боты перейдут на прямые имена crm_*, views будут удалены
