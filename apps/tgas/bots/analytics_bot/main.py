"""Analytics Bot — main.py с EventBus интеграцией"""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from shared.notifications import register_analytics_handlers
from bots.analytics_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.analytics_bot.handlers.ai_analytics import ai_chat
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

from bots.analytics_bot.handlers.tasks import register_analytics_tasks
from bots.analytics_bot.handlers.bus_handlers import (
    bus_daily_kpi_snapshot,
    bus_get_report,
    bus_get_instagram_stats,
    bus_cohort_analysis,
    bus_rfm_segmentation,
    handle_task_created,
    get_top_products as _get_top_products,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Глобальные ссылки для задач ──────────────────────────────────────────
_bot: Bot = None
scheduler = BotScheduler("analytics_bot")

register_analytics_tasks(scheduler)

async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("analytics_bot", payload)


async def main() -> None:
    if not settings.analytics_bot_token:
        logger.error("FATAL: ANALYTICS_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    global _bot
    await init_db()
    bot = Bot(
        token=settings.analytics_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    _bot = bot
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.task_ui import task_ui_router

    dp.include_router(task_ui_router)
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        ai_chat,
        wake_words=["отдел аналитик", "аналитика", "analytics", "данные", "статистика"],
    )
    dp.include_router(group_router)

    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    register_analytics_handlers(event_bus, bot)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(
        8088
    )  # mg_analytics — порт из карты доставки event_bus

    # Пульс живости. start_heartbeat был импортирован в шапке модуля, но нигде
    # не вызывался: бот работал нормально, а ключа bot:heartbeat:analytics_bot
    # в Redis не появлялось никогда, и мониторинг вечно показывал
    # «Analytics — НЕ ЗАПУЩЕН». Сверка реестра — scripts/check_bot_roster.py.
    asyncio.create_task(start_heartbeat("analytics_bot"))

    # Планировщик тоже не запускался: задача monthly_executive была
    # зарегистрирована, в finally стоял scheduler.stop(), а start() не вызывался
    # ни разу — то есть месячный отчёт не выходил никогда. Второй дефект того же
    # класса, что и пропущенный heartbeat выше: код на месте, вызова нет.
    # Пять других задач (строки ~394-399) закомментированы намеренно — не трогаем.
    await scheduler.start()

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    from shared.event_bus import BotBusActions

    asyncio.create_task(
        bus_listen(
            "analytics_bot",
            {
                "get_report": bus_get_report,
                "get_instagram_stats": bus_get_instagram_stats,
                "cohort_analysis": bus_cohort_analysis,
                "rfm_segmentation": bus_rfm_segmentation,
                BotBusActions.GET_TOP_PRODUCTS: _get_top_products,
                # Кнопка «Снимок KPI» в веб-админке: тот же расчёт, что и в 20:00,
                # но по требованию владельца.
                "daily_kpi_snapshot": bus_daily_kpi_snapshot,
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
