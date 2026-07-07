import asyncio
import logging
from sqlalchemy import text
from shared.database import get_session_ctx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_migration():
    async with get_session_ctx() as session:
        # Add bonus_balance to customers
        try:
            await session.execute(text("ALTER TABLE customers ADD COLUMN bonus_balance DECIMAL(15, 2) DEFAULT 0;"))
            logger.info("Added bonus_balance to customers")
        except Exception as e:
            logger.warning(f"bonus_balance might already exist: {e}")
            await session.rollback()

        # Create inventory table
        try:
            inventory_sql = """
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
            """
            await session.execute(text(inventory_sql))
            logger.info("Created inventory table")
            
            # Create trigger function if it doesn't exist (it should from init.sql, but just in case)
            trigger_func_sql = """
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
            await session.execute(text(trigger_func_sql))
            
            trigger_drop_sql = "DROP TRIGGER IF EXISTS trg_inventory_updated_at ON inventory;"
            await session.execute(text(trigger_drop_sql))

            trigger_create_sql = """
            CREATE TRIGGER trg_inventory_updated_at
                BEFORE UPDATE ON inventory
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
            """
            await session.execute(text(trigger_create_sql))
            logger.info("Created inventory trigger")
            
        except Exception as e:
            logger.error(f"Failed to create inventory table: {e}")
            await session.rollback()
            
        # Seed inventory with some basic items for Microgreen Uzbekistan
        try:
            check_sql = "SELECT count(*) FROM inventory"
            res = await session.execute(text(check_sql))
            if res.scalar() == 0:
                seed_sql = """
                INSERT INTO inventory (item_name, category, quantity, unit, min_stock) VALUES
                ('Семена Гороха', 'seeds', 10, 'kg', 2),
                ('Семена Рукколы', 'seeds', 2, 'kg', 0.5),
                ('Кокосовый субстрат', 'substrate', 20, 'piece', 5),
                ('Лотки малые', 'containers', 500, 'piece', 100),
                ('Лотки большие', 'containers', 300, 'piece', 50)
                """
                await session.execute(text(seed_sql))
                logger.info("Seeded inventory with default items")
        except Exception as e:
            logger.error(f"Failed to seed inventory: {e}")
            await session.rollback()

if __name__ == "__main__":
    asyncio.run(run_migration())
