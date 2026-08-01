"""Marketing Bot — main.py с EventBus интеграцией"""

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
from bots.marketing_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.marketing_bot.handlers.campaigns import ai_mkt
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

from bots.marketing_bot.handlers.tasks import register_marketing_tasks, followups_worker
from bots.marketing_bot.handlers.bus_handlers import (
    bus_send_broadcast,
    bus_b2b_outreach,
    bus_trigger_lead_audit,
    bus_collect_leads,
    get_pick_restaurant,
    handle_task_created,
    handle_magazine_published,
)
from bots.marketing_bot.handlers.b2b import b2b_router
from bots.marketing_bot.handlers.unsubscribe import unsubscribe_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = BotScheduler("marketing_bot")
register_marketing_tasks(scheduler)

async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call
    await _shared_roll_call("marketing_bot", payload)


async def main() -> None:
    if not settings.marketing_bot_token:
        logger.error("FATAL: MARKETING_BOT_TOKEN is missing!")
        import sys
        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.marketing_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    
    from shared.task_ui import task_ui_router
    dp.include_router(task_ui_router)
    
    for r in all_routers:
        dp.include_router(r)

    dp.include_router(unsubscribe_router)
    dp.include_router(b2b_router)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        ai_mkt,
        wake_words=["отдел маркетинг", "маркетинг", "marketing", "реклама"],
    )
    dp.include_router(group_router)

    await event_bus.connect()

    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("MAGAZINE_PUBLISHED", handle_magazine_published)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8086)

    await scheduler.start()
    asyncio.create_task(start_heartbeat("marketing_bot"))
    asyncio.create_task(followups_worker(bot))

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen

    asyncio.create_task(
        bus_listen(
            "marketing_bot",
            {
                "send_broadcast": bus_send_broadcast,
                "b2b_outreach": bus_b2b_outreach,
                "collect_leads": bus_collect_leads,
                "trigger_lead_audit": bus_trigger_lead_audit,
                BotBusActions.PICK_RESTAURANT: get_pick_restaurant,
            },
        )
    )

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
