import asyncio
from aiogram import Bot
from shared.config import settings

async def test() -> None:
    bot = Bot(token=settings.content_bot_token)
    try:
        await bot.send_message(-5095038892, 'Test from Content bot')
        print('Success!')
    except Exception as e:
        print('Error:', repr(e))
    finally:
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(test())
