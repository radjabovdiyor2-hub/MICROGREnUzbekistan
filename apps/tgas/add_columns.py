import asyncio
from shared.database import engine
from sqlalchemy import text


async def main() -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS message_id BIGINT, ADD COLUMN IF NOT EXISTS chat_id BIGINT;"
            )
        )
        print("Columns added")


if __name__ == "__main__":
    asyncio.run(main())
