"""
Миграция v3 — приведение таблицы interactions в соответствие с кодом ботов.
==========================================================================
До этой миграции несколько запросов падали (UndefinedColumnError / нарушение
CHECK-констрейнта), потому что код обращался к колонкам order_id / resolved
и значениям interaction_type ('lead_welcome', 'b2b_offer_sent'), которых не
было в схеме. См. также database/init.sql (обновлён под ту же схему).

Скрипт идемпотентен — можно запускать повторно без вреда:
    python migrate_v3.py
"""

import asyncio
import logging
from sqlalchemy import text
from shared.database import get_session_ctx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Каждый шаг выполняется в отдельной транзакции: если один упадёт,
# остальные всё равно применятся.
STEPS = [
    ("order_id колонка",
     "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS order_id INTEGER "
     "REFERENCES orders(id) ON DELETE SET NULL"),
    ("resolved колонка",
     "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false"),
    ("customer_id -> NULLABLE",
     "ALTER TABLE interactions ALTER COLUMN customer_id DROP NOT NULL"),
    ("снять старый CHECK interaction_type",
     "ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_interaction_type_check"),
    ("добавить расширенный CHECK interaction_type",
     "ALTER TABLE interactions ADD CONSTRAINT interactions_interaction_type_check "
     "CHECK (interaction_type IN ("
     "'inquiry','order','complaint','feedback','followup','b2b_lead',"
     "'lead_welcome','b2b_offer_sent'))"),

    # ── Лид-генерация: поля источника/отзывов на customers ──
    ("customers.source",
     "ALTER TABLE customers ADD COLUMN IF NOT EXISTS source VARCHAR(50)"),
    ("customers.source_ref",
     "ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_ref VARCHAR(150)"),
    ("customers.review_score",
     "ALTER TABLE customers ADD COLUMN IF NOT EXISTS review_score NUMERIC(2,1)"),
    ("customers.review_summary",
     "ALTER TABLE customers ADD COLUMN IF NOT EXISTS review_summary TEXT"),
    ("уникальный индекс source+source_ref (дедуп)",
     "CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_source_ref "
     "ON customers (source, source_ref) WHERE source_ref IS NOT NULL"),

    # ── Авто-перевод лида в active при первом заказе (для конверсии воронки) ──
    ("функция promote_lead_on_order",
     "CREATE OR REPLACE FUNCTION promote_lead_on_order() RETURNS TRIGGER AS $$ "
     "BEGIN UPDATE customers SET status = 'active' "
     "WHERE id = NEW.customer_id AND status = 'lead'; RETURN NEW; END; $$ LANGUAGE plpgsql"),
    ("снять старый триггер promote_lead",
     "DROP TRIGGER IF EXISTS trg_promote_lead_on_order ON orders"),
    ("триггер trg_promote_lead_on_order",
     "CREATE TRIGGER trg_promote_lead_on_order AFTER INSERT ON orders "
     "FOR EACH ROW EXECUTE FUNCTION promote_lead_on_order()"),
]


async def run_migration():
    for label, sql in STEPS:
        async with get_session_ctx() as session:
            try:
                await session.execute(text(sql))
                logger.info("OK: %s", label)
            except Exception as e:  # noqa: BLE001
                logger.warning("Пропущено (%s): %s", label, e)
                await session.rollback()


if __name__ == "__main__":
    asyncio.run(run_migration())
