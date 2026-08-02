"""Support Bot — main.py с EventBus интеграцией"""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from fastapi import Request

from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from bots.support_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.support_bot.handlers.faq import ai_chat
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

from bots.support_bot.handlers.tasks import (
    register_support_tasks,
    csat_survey_check,
    complaint_followup,
    delivery_status_report,
    faq_analysis,
    auto_poll_instagram_dms,
)
from bots.support_bot.handlers.bus_handlers import (
    bus_handle_complaint,
    bus_check_instagram_dm,
    handle_task_created,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Планировщик ──────────────────────────────────────────────────────────
scheduler = BotScheduler("support_bot")
register_support_tasks(scheduler)


async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("support_bot", payload)


async def main() -> dict:
    if not settings.support_bot_token:
        logger.error("FATAL: SUPPORT_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.support_bot_token,
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
        ai_chat,
        wake_words=["отдел поддержк", "поддержка", "support", "жалоба", "клиент"],
    )
    dp.include_router(group_router)

    # Support публикует события (жалобы), но не слушает Redis
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    # EventBus теперь слушает через встроенный aiohttp сервер ниже

    # Запуск планировщика и heartbeat
    await scheduler.start()
    asyncio.create_task(start_heartbeat("support_bot"))

    # ── Webhook Server для n8n ──
    from aiohttp import web

    async def n8n_webhook_handler(request: Request) -> dict:
        try:
            data = await request.json()
            action = data.get("action")
            if action == "csat_survey_check":
                asyncio.create_task(csat_survey_check())
            elif action == "complaint_followup":
                asyncio.create_task(complaint_followup())
            elif action == "delivery_status_report":
                asyncio.create_task(delivery_status_report())
            elif action == "faq_analysis":
                asyncio.create_task(faq_analysis())
            elif action == "auto_poll_instagram_dms":
                asyncio.create_task(auto_poll_instagram_dms())
            else:
                return web.json_response(
                    {"status": "error", "message": "Unknown action"}, status=400
                )
            return web.json_response({"status": "ok", "action": action})
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    app = web.Application()
    app.router.add_post("/n8n-webhook", n8n_webhook_handler)
    await event_bus.start_listening(
        8083, app
    )  # mg_support — порт из карты доставки event_bus

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen

    asyncio.create_task(
        bus_listen(
            "support_bot",
            {
                "handle_complaint": bus_handle_complaint,
                "check_instagram_dm": bus_check_instagram_dm,
            },
        )
    )

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        event_bus.on("ROLL_CALL", handle_roll_call)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
