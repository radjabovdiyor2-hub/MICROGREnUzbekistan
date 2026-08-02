"""Franchise Bot — main.py"""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from shared.health import start_heartbeat

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call
    await _shared_roll_call("franchise_bot", payload)

async def handle_task_created(payload: dict) -> None:
    # Handle task creation if assigned to 'franchise'
    task = payload.get("task", {})
    if task.get("department") == "franchise":
        logger.info(f"Franchise task created: {task}")
        # Will handle logic here or in separate handler

async def main() -> None:
    if not getattr(settings, "franchise_bot_token", None):
        # We will use a dummy token if not set or just skip if we want it to run without telegram for now
        logger.warning("FRANCHISE_BOT_TOKEN is missing! Running without TG Polling.")
        bot = None
        dp = None
    else:
        bot = Bot(
            token=settings.franchise_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))

    await init_db()

    # Franchise connects to bus
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8093)  # franchise port

    # Heartbeat
    asyncio.create_task(start_heartbeat("franchise_bot"))

    # Bot Bus
    from shared.bot_bus import start_listener as bus_listen
    from bots.franchise_bot.handlers.bus_handlers import bus_analyze_franchise
    
    asyncio.create_task(
        bus_listen(
            "franchise_bot",
            {
                "analyze_franchise": bus_analyze_franchise,
            },
        )
    )

    logger.info("Starting Franchise Bot...")
    try:
        if bot and dp:
            await bot.delete_webhook(drop_pending_updates=True)
            await dp.start_polling(bot)
        else:
            # Just keep alive if no telegram bot token
            while True:
                await asyncio.sleep(3600)
    finally:
        await event_bus.stop()
        if bot:
            await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
