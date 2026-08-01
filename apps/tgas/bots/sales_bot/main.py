"""Sales Bot — main.py с EventBus интеграцией"""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from shared.event_bus import BotBusActions
from bots.sales_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.sales_bot.handlers.ai_chat import ai_fallback
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

from bots.sales_bot.handlers.bus_handlers import (
    handle_payment_received,
    handle_magazine_published,
    bus_get_orders,
    bus_get_b2b_targets,
    bus_get_clients,
    bus_register_sale,
    bus_add_product,
    bus_sync_catalog,
    _sell_magazine_ads,
)
from bots.sales_bot.handlers.tasks_handler import (
    handle_task_created,
    bus_process_ig_order,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

scheduler = BotScheduler("sales_bot")


async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("sales_bot", payload)


async def main() -> None:
    if not settings.sales_bot_token:
        logger.error("FATAL: SALES_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.sales_bot_token,
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
        ai_fallback,
        wake_words=["отдел продаж", "продажи", "sales", "сейлз"],
    )
    dp.include_router(group_router)

    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("PAYMENT_RECEIVED", handle_payment_received)
    event_bus.on("ROLL_CALL", handle_roll_call)
    event_bus.on("MAGAZINE_PUBLISHED", handle_magazine_published)
    await event_bus.start_listening(8082)

    asyncio.create_task(start_heartbeat("sales_bot"))
    await scheduler.start()

    from shared.bot_bus import start_listener as bus_listen

    asyncio.create_task(
        bus_listen(
            "sales_bot",
            {
                "get_orders": bus_get_orders,
                "get_clients": bus_get_clients,
                "process_ig_order": bus_process_ig_order,
                "get_b2b_targets": bus_get_b2b_targets,
                "register_sale": bus_register_sale,
                "add_product": bus_add_product,
                "sync_catalog_from_storefront": bus_sync_catalog,
                BotBusActions.SELL_MAGAZINE_ADS: _sell_magazine_ads,
            },
        )
    )

    logger.info("Starting Sales Bot...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
