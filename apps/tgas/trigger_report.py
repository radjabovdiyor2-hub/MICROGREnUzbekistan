import asyncio
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from shared.config import settings
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from bots.stepan_bot.main import daily_report
import bots.stepan_bot.main

async def run_report():
    bot = Bot(
        token=settings.stepan_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    bots.stepan_bot.main._bot = bot
    await daily_report()
    await bot.session.close()

if __name__ == "__main__":
    asyncio.run(run_report())
