import asyncio
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
import logging

logging.basicConfig(level=logging.INFO)


async def main():
    from shared.config import settings
    import bots.stepan_bot.main as stepan_main

    bot = Bot(
        token=settings.stepan_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    stepan_main._bot = bot

    print("Triggering magazine pipeline...")
    await stepan_main.run_magazine_pipeline()
    print("Pipeline completed or error returned!")

    await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
