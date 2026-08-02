"""HR Bot — main.py с EventBus интеграцией"""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from bots.hr_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.hr_bot.handlers.start import ai_hr
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat
from bots.hr_bot.handlers.scheduled import register_hr_scheduled_tasks
from bots.hr_bot.handlers.bus_handlers import bus_get_employees, handle_task_created

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Scheduler ────────────────────────────────────────────────────────────
scheduler = BotScheduler("hr_bot")
register_hr_scheduled_tasks(scheduler)


async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("hr_bot", payload)


async def main() -> None:
    if not settings.hr_bot_token:
        logger.error("FATAL: HR_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.hr_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.task_ui import task_ui_router

    dp.include_router(task_ui_router)
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        ai_hr,
        wake_words=["отдел кадр", "кадры", "hr", "персонал", "сотрудники"],
    )
    dp.include_router(group_router)

    # HR подключается к шине
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8084)  # mg_hr — порт из карты доставки event_bus

    # Heartbeat + Scheduler
    asyncio.create_task(start_heartbeat("hr_bot"))
    await scheduler.start()

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen

    asyncio.create_task(
        bus_listen(
            "hr_bot",
            {
                "get_employees": bus_get_employees,
            },
        )
    )

    logger.info("Starting HR Bot...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
