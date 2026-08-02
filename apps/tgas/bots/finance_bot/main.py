"""Finance Bot — main.py с EventBus интеграцией"""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from shared.notifications import register_finance_handlers
from bots.finance_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.finance_bot.handlers.start import ai_fin
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

from bots.finance_bot.handlers.tasks import register_finance_tasks
from bots.finance_bot.handlers.bus_handlers import (
    bus_get_balance,
    bus_add_expense,
    handle_task_created,
    handle_payment_received,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Scheduler ────────────────────────────────────────────────────────────
scheduler = BotScheduler("finance_bot")
register_finance_tasks(scheduler)


async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("finance_bot", payload)


async def main() -> None:
    if not settings.finance_bot_token:
        logger.error("FATAL: FINANCE_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.finance_bot_token,
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
        ai_fin,
        wake_words=["отдел финанс", "финансы", "finance", "бюджет", "касса"],
    )
    dp.include_router(group_router)

    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("PAYMENT_RECEIVED", handle_payment_received)
    register_finance_handlers(event_bus, bot)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8085)

    # Heartbeat + Scheduler
    asyncio.create_task(start_heartbeat("finance_bot"))
    await scheduler.start()

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen

    asyncio.create_task(
        bus_listen(
            "finance_bot",
            {
                "get_balance": bus_get_balance,
                "add_expense": bus_add_expense,
            },
        )
    )

    logger.info("Starting Finance Bot...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
