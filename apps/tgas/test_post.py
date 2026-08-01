import asyncio
from aiogram import Bot
from shared.config import settings
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
import bots.content_bot.main as cb

async def main() -> None:
    cb._bot = Bot(token=settings.content_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    
    print("Testing evening recipe post...")
    try:
        await cb.evening_post()
        print("Evening post done.")
    except Exception as e:
        print(f"Exception caught in evening_post: {e}")
        
    await cb._bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
