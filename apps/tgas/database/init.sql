-- ============================================================================
-- Microgreen Uzbekistan — Полная схема базы данных
-- Версия: 1.0
-- Описание: Схема для системы AI-сотрудников микрозелени
-- Валюта: UZS (Узбекский сум)
-- Языки: uz (узбекский), ru (русский)
-- ============================================================================

-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- для полнотекстового поиска
CREATE EXTENSION IF NOT EXISTS "vector";   -- для векторного поиска (RAG)

-- ============================================================================
-- Функция автоматического обновления updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Функция автогенерации номера заказа MG-XXXXXX
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 4) AS INTEGER)), 0) + 1
    INTO next_num
    FROM orders;
    NEW.order_number = 'MG-' || LPAD(next_num::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Таблица: customers (Клиенты)
-- Хранит данные о клиентах B2B (рестораны, кафе, отели) и B2C (частные лица)
-- ============================================================================
CREATE TABLE IF NOT EXISTS customers (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255),
    phone           VARCHAR(20),
    telegram_id     BIGINT UNIQUE,
    telegram_username VARCHAR(255),
    email           VARCHAR(255),
    customer_type   VARCHAR(10) DEFAULT 'b2c'
                        CHECK (customer_type IN ('b2b', 'b2c')),
    company_name    VARCHAR(255),
    company_type    VARCHAR(50)
                        CHECK (company_type IS NULL OR company_type IN (
                            'restaurant', 'cafe', 'hotel', 'catering', 'retail', 'other'
                        )),
    address         TEXT,
    city            VARCHAR(100) DEFAULT 'Samarqand',
    language        VARCHAR(5) DEFAULT 'ru',
    total_spent     DECIMAL(15, 2) DEFAULT 0,
    bonus_balance   DECIMAL(15, 2) DEFAULT 0,
    orders_count    INTEGER DEFAULT 0,
    last_order_date TIMESTAMP,
    status          VARCHAR(20) DEFAULT 'lead'
                        CHECK (status IN ('lead', 'active', 'vip', 'churned')),
    notes           TEXT,
    -- ── Лид-генерация (сбор ресторанов из внешних источников) ──
    source          VARCHAR(50),          -- откуда лид: 2gis, google, manual, instagram
    source_ref      VARCHAR(150),         -- внешний ID/URL для дедупликации
    review_score    NUMERIC(2, 1),        -- рейтинг заведения (напр. 4.5)
    review_summary  TEXT,                 -- краткая выжимка отзывов для персонализации КП
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Уникальность внешнего источника (дедуп при повторном сборе)
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_source_ref
    ON customers (source, source_ref)
    WHERE source_ref IS NOT NULL;

COMMENT ON TABLE customers IS 'Клиенты — B2B (HoReCa) и B2C (частные лица)';
COMMENT ON COLUMN customers.customer_type IS 'Тип клиента: b2b — юр. лицо, b2c — физ. лицо';
COMMENT ON COLUMN customers.company_type IS 'Тип заведения для B2B-клиентов';
COMMENT ON COLUMN customers.status IS 'Статус воронки: lead → active → vip | churned';
COMMENT ON COLUMN customers.total_spent IS 'Общая сумма покупок в UZS';

CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Таблица: products (Товары)
-- Каталог продукции: микрозелень, салаты, семена, оборудование
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
    id              SERIAL PRIMARY KEY,
    name_uz         VARCHAR(255) NOT NULL,
    name_ru         VARCHAR(255) NOT NULL,
    category        VARCHAR(50) NOT NULL
                        CHECK (category IN (
                            'microgreens', 'baby-leaf', 'salads', 'flowers',
                            'seeds', 'substrate', 'equipment', 'sets'
                        )),
    price           DECIMAL(12, 2) NOT NULL,
    old_price       DECIMAL(12, 2),
    unit            VARCHAR(20) NOT NULL
                        CHECK (unit IN ('kg', 'g', 'piece', 'pack', 'set')),
    stock_qty       DECIMAL(10, 2) DEFAULT 0,
    min_order_qty   DECIMAL(10, 2) DEFAULT 0.1,
    image_url       TEXT,
    description_uz  TEXT,
    description_ru  TEXT,
    nutrition_info  JSONB,
    is_active       BOOLEAN DEFAULT TRUE,
    sort_order      INTEGER DEFAULT 0,
    -- Ссылка на товар витрины (Prisma cuid). Каталог-мастер — витрина; офис
    -- зеркалит через shared.catalog_sync. NULL = нативный офисный товар.
    storefront_id   VARCHAR(64),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Идемпотентность синка каталога: один офисный товар на один товар витрины.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_storefront_id
    ON products(storefront_id) WHERE storefront_id IS NOT NULL;

COMMENT ON TABLE products IS 'Каталог продукции Microgreen Uzbekistan';
COMMENT ON COLUMN products.name_uz IS 'Название товара на узбекском языке';
COMMENT ON COLUMN products.name_ru IS 'Название товара на русском языке';
COMMENT ON COLUMN products.price IS 'Текущая цена в UZS';
COMMENT ON COLUMN products.old_price IS 'Старая цена (для отображения скидки)';
COMMENT ON COLUMN products.nutrition_info IS 'Пищевая ценность в формате JSON';

-- ============================================================================
-- Таблица: orders (Заказы)
-- Заказы клиентов с доставкой по Самарканду
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
    id              SERIAL PRIMARY KEY,
    customer_id     INTEGER NOT NULL
                        REFERENCES customers(id) ON DELETE RESTRICT,
    order_number    VARCHAR(20) UNIQUE,
    total_amount    DECIMAL(15, 2) NOT NULL DEFAULT 0,
    delivery_fee    DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'new'
                        CHECK (status IN (
                            'new', 'confirmed', 'preparing', 'ready',
                            'delivering', 'delivered', 'cancelled'
                        )),
    payment_status  VARCHAR(20) DEFAULT 'pending'
                        CHECK (payment_status IN ('pending', 'paid', 'overdue')),
    payment_method  VARCHAR(20)
                        CHECK (payment_method IS NULL OR payment_method IN (
                            'cash', 'card', 'click', 'payme', 'transfer'
                        )),
    delivery_address TEXT,
    delivery_date   DATE,
    delivery_time_slot VARCHAR(50),
    courier_id      INTEGER,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE orders IS 'Заказы — основная таблица заказов клиентов';
COMMENT ON COLUMN orders.order_number IS 'Номер заказа в формате MG-XXXXXX';
COMMENT ON COLUMN orders.total_amount IS 'Итоговая сумма заказа в UZS';
COMMENT ON COLUMN orders.delivery_fee IS 'Стоимость доставки (бесплатно от 500 000 сум)';
COMMENT ON COLUMN orders.payment_method IS 'Способ оплаты: наличные, карта, Click, Payme, перевод';
COMMENT ON COLUMN orders.delivery_time_slot IS 'Временной слот доставки, напр. "10:00-12:00"';

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_orders_generate_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION generate_order_number();

-- Автоматический перевод клиента из лида в активные при первом заказе.
-- Ловит ВСЕ пути создания заказа (sales, IG DM и т.д.) — единый источник правды
-- для расчёта конверсии в B2B-воронке.
CREATE OR REPLACE FUNCTION promote_lead_on_order()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE customers
       SET status = 'active'
     WHERE id = NEW.customer_id AND status = 'lead';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_promote_lead_on_order
    AFTER INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION promote_lead_on_order();

-- ============================================================================
-- Таблица: order_items (Позиции заказа)
-- Товарные позиции внутри каждого заказа
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_items (
    id              SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL
                        REFERENCES orders(id) ON DELETE CASCADE,
    product_id      INTEGER NOT NULL
                        REFERENCES products(id) ON DELETE RESTRICT,
    quantity        DECIMAL(10, 2) NOT NULL,
    unit            VARCHAR(20) NOT NULL,
    unit_price      DECIMAL(12, 2) NOT NULL,
    total_price     DECIMAL(12, 2) NOT NULL
);

COMMENT ON TABLE order_items IS 'Позиции заказа — товары внутри заказа';
COMMENT ON COLUMN order_items.unit_price IS 'Цена за единицу на момент заказа (фиксируется)';
COMMENT ON COLUMN order_items.total_price IS 'Итого по позиции = quantity × unit_price';

-- ============================================================================
-- Таблица: interactions (Взаимодействия)
-- Журнал всех коммуникаций с клиентами через ботов
-- ============================================================================
CREATE TABLE IF NOT EXISTS interactions (
    id              SERIAL PRIMARY KEY,
    customer_id     INTEGER
                        REFERENCES customers(id) ON DELETE CASCADE,
    order_id        INTEGER
                        REFERENCES orders(id) ON DELETE SET NULL,
    channel         VARCHAR(20) DEFAULT 'telegram',
    interaction_type VARCHAR(30) NOT NULL
                        CHECK (interaction_type IN (
                            'inquiry', 'order', 'complaint', 'feedback',
                            'followup', 'b2b_lead', 'lead_welcome', 'b2b_offer_sent'
                        )),
    bot_name        VARCHAR(50),
    summary         TEXT,
    resolved        BOOLEAN DEFAULT false,
    created_at      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE interactions IS 'Журнал взаимодействий — все контакты с клиентами';
COMMENT ON COLUMN interactions.bot_name IS 'Имя бота-сотрудника, обработавшего обращение';
COMMENT ON COLUMN interactions.interaction_type IS 'Тип обращения: запрос, заказ, жалоба, отзыв, B2B-лид';

-- ============================================================================
-- Таблица: tasks (Задачи)
-- Управление задачами команды (используется PM-ботом)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,
    assignee        VARCHAR(255),
    department      VARCHAR(50),
    status          VARCHAR(20) DEFAULT 'todo'
                        CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
    priority        VARCHAR(10) DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    deadline        DATE,
    description     TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE tasks IS 'Задачи команды — управление проектами';
COMMENT ON COLUMN tasks.assignee IS 'Ответственный за задачу';
COMMENT ON COLUMN tasks.department IS 'Отдел: sales, marketing, production, logistics, hr';

-- ============================================================================
-- Таблица: finances (Финансы)
-- Учёт доходов и расходов компании
-- ============================================================================
CREATE TABLE IF NOT EXISTS finances (
    id              SERIAL PRIMARY KEY,
    type            VARCHAR(10) NOT NULL
                        CHECK (type IN ('income', 'expense')),
    amount          DECIMAL(15, 2) NOT NULL,
    category        VARCHAR(50) NOT NULL,
    description     TEXT,
    related_order_id INTEGER
                        REFERENCES orders(id) ON DELETE SET NULL,
    receipt_url     TEXT,
    date            DATE DEFAULT CURRENT_DATE,
    created_at      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE finances IS 'Финансы — учёт доходов и расходов';
COMMENT ON COLUMN finances.type IS 'Тип операции: income — доход, expense — расход';
COMMENT ON COLUMN finances.category IS 'Категория: sales, delivery, salary, rent, seeds, packaging и т.д.';
COMMENT ON COLUMN finances.related_order_id IS 'Связанный заказ (для доходов от продаж)';

-- ============================================================================
-- Таблица: employees (Сотрудники)
-- Данные о сотрудниках компании (курьеры, садоводы и т.д.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS employees (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL,
    phone           VARCHAR(20),
    telegram_id     BIGINT,
    status          VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'on_leave')),
    salary          DECIMAL(12, 2),
    created_at      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE employees IS 'Сотрудники компании';
COMMENT ON COLUMN employees.role IS 'Роль: courier, grower, manager, admin';
COMMENT ON COLUMN employees.salary IS 'Зарплата в UZS';

-- ============================================================================
-- Таблица: followups (Напоминания)
-- Запланированные follow-up сообщения клиентам
-- ============================================================================
CREATE TABLE IF NOT EXISTS followups (
    id              SERIAL PRIMARY KEY,
    customer_id     INTEGER NOT NULL
                        REFERENCES customers(id) ON DELETE CASCADE,
    scheduled_at    TIMESTAMP NOT NULL,
    message         TEXT NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'cancelled')),
    created_at      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE followups IS 'Напоминания — отложенные сообщения клиентам';
COMMENT ON COLUMN followups.scheduled_at IS 'Дата и время отправки напоминания';
COMMENT ON COLUMN followups.status IS 'Статус: pending — ожидает, sent — отправлено, cancelled — отменено';

-- ============================================================================
-- ИНДЕКСЫ
-- ============================================================================

-- Клиенты: быстрый поиск по Telegram и телефону
CREATE INDEX IF NOT EXISTS idx_customers_telegram_id ON customers(telegram_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_customer_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);

-- Товары: фильтрация по категории и активности
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_sort_order ON products(sort_order);

-- Заказы: поиск по номеру, клиенту, статусу, дате
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Позиции заказа: связи
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Взаимодействия: по клиенту и дате
CREATE INDEX IF NOT EXISTS idx_interactions_customer_id ON interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_interactions_bot_name ON interactions(bot_name);

-- Задачи: по статусу, ответственному и приоритету
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);

-- Финансы: по типу, дате и категории
CREATE INDEX IF NOT EXISTS idx_finances_type ON finances(type);
CREATE INDEX IF NOT EXISTS idx_finances_date ON finances(date);
CREATE INDEX IF NOT EXISTS idx_finances_category ON finances(category);
CREATE INDEX IF NOT EXISTS idx_finances_related_order_id ON finances(related_order_id);

-- Сотрудники: по telegram_id и статусу
CREATE INDEX IF NOT EXISTS idx_employees_telegram_id ON employees(telegram_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

-- Напоминания: по клиенту, статусу и времени отправки
CREATE INDEX IF NOT EXISTS idx_followups_customer_id ON followups(customer_id);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
CREATE INDEX IF NOT EXISTS idx_followups_scheduled_at ON followups(scheduled_at);

-- ============================================================================
-- Таблица: inventory (Складской учёт)
-- Учёт семян, субстратов, лотков и готовой продукции
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory (
    id              SERIAL PRIMARY KEY,
    item_name       VARCHAR(255) NOT NULL,
    category        VARCHAR(50) NOT NULL
                        CHECK (category IN ('seeds', 'substrate', 'containers', 'fertilizer', 'finished_goods', 'other')),
    quantity        DECIMAL(10, 2) DEFAULT 0,
    unit            VARCHAR(20) NOT NULL
                        CHECK (unit IN ('kg', 'g', 'piece', 'liter', 'pack')),
    min_stock       DECIMAL(10, 2) DEFAULT 0,
    last_restock    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE inventory IS 'Складской учёт сырья и материалов';

CREATE TRIGGER trg_inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Готово! Схема Microgreen Uzbekistan инициализирована.
-- ============================================================================
CREATE TABLE IF NOT EXISTS storefront_outbox (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);