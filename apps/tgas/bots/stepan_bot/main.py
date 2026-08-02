import asyncio
import logging
import sys
from pathlib import Path
from aiohttp import web
from aiohttp.web import Request

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.redis import RedisStorage

# Добавляем корень проекта в sys.path
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from shared.config import settings  # noqa: E402
from shared.event_bus import event_bus  # noqa: E402
from shared.health import start_heartbeat  # noqa: E402
from shared.scheduler import BotScheduler  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [СТЕПАН] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = BotScheduler("stepan_bot")


async def main() -> None:
    if not settings.stepan_bot_token:
        logger.error("FATAL: STEPAN_BOT_TOKEN is missing!")
        sys.exit(1)

    storage = RedisStorage.from_url(settings.redis_url)
    bot = Bot(
        token=settings.stepan_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=storage)

    # 1. Routers
    from bots.stepan_bot.handlers import all_routers
    from shared.task_ui import task_ui_router
    from shared.group_orchestrator import create_group_router
    from bots.stepan_bot.handlers.assistant import brain

    dp.include_router(task_ui_router)
    for router in all_routers:
        dp.include_router(router)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        brain,
        wake_words=[
            "степан", "стёпа", "степа", "stepan", "шеф", "босс",
            "менеджер", "директор", "отдел devops", "devops", "девопс",
            "отдел qa", "тестирование", "качество", "отдел r&d",
            "r&d", "исследования", "разработка", "отдел логистик",
            "логистика", "доставка",
        ],
    )
    dp.include_router(group_router)

    # 2. EventBus events
    from bots.stepan_bot.handlers.event_handlers import (
        on_any_event,
        handle_pm_task_created,
        handle_task_completed,
        handle_ig_dm,
    )
    from shared.notifications import register_pm_handlers

    for event_type in [
        "order_created",
        "complaint_received",
        "application_received",
        "large_expense_alert",
        "task_created",
        "task_completed",
        "b2b_lead_created",
        "order_status_changed",
        "feedback_received",
        "DELIVERY_STATUS_REPORT",
        "new_message",
    ]:
        event_bus.on(event_type, lambda p: on_any_event(p, bot))

    event_bus.on("TASK_COMPLETED", lambda p: handle_task_completed(p, bot))
    event_bus.on("TASK_CREATED", lambda p: handle_pm_task_created(p, bot))
    event_bus.on("ig_dm_received", lambda p: handle_ig_dm(p, bot))
    register_pm_handlers(event_bus, bot)

    # 3. Scheduled Tasks
    from bots.stepan_bot.handlers.background_tasks import (
        check_deadlines, check_followups, evening_summary, weekly_report,
        auto_task_creation, bot_health_check, bot_health_summary,
        daily_backup, token_refresh, kpi_watchdog_job,
        cron_magazine_prepare, cron_magazine_finalize, cron_magazine_print_run,
        daily_report, process_green_box_subscriptions
    )
    
    scheduler.add_interval(name="check_deadlines", func=lambda: check_deadlines(bot), seconds=3600)
    scheduler.add_interval(name="check_followups", func=lambda: check_followups(bot), seconds=1800)
    scheduler.add_cron(name="evening_summary", func=lambda: evening_summary(bot), hour=20, minute=0)
    scheduler.add_cron(name="weekly_report", func=lambda: weekly_report(bot), hour=9, minute=5, day_of_week=0)
    scheduler.add_interval(name="auto_task_creation", func=lambda: auto_task_creation(bot), seconds=4 * 3600)
    scheduler.add_interval(name="bot_health_check", func=lambda: bot_health_check(bot), seconds=300)
    scheduler.add_cron(name="bot_health_summary", func=lambda: bot_health_summary(bot), hour=9, minute=0)
    scheduler.add_cron(name="daily_backup", func=lambda: daily_backup(bot), hour=3, minute=0)
    scheduler.add_interval(name="token_refresh", func=token_refresh, seconds=86400 * 7)
    
    if getattr(settings, "kpi_watchdog_enabled", True):
        scheduler.add_cron(
            name="kpi_watchdog",
            func=lambda: kpi_watchdog_job(bot),
            hour=getattr(settings, "kpi_watchdog_hour", 11),
            minute=0,
        )

    scheduler.add_cron(name="magazine_cron_prepare", func=cron_magazine_prepare, day_of_week=2, hour=9, minute=0)
    scheduler.add_cron(name="magazine_cron_finalize", func=cron_magazine_finalize, day_of_week=3, hour=12, minute=0)
    scheduler.add_cron(name="magazine_cron_print_run", func=lambda: cron_magazine_print_run(bot), day_of_week=4, hour=8, minute=0)

    # Подписки «Зелёная Коробка»: каждый день в 8:00 создаёт заказы на завтра
    scheduler.add_cron(name="green_box_subscriptions", func=lambda: process_green_box_subscriptions(bot), hour=8, minute=0)

    # 4. BotBus listener
    from shared.bot_bus import start_listener as bus_listen
    from bots.stepan_bot.handlers.bus_handlers import bus_get_tasks, bus_get_deadlines, bus_force_learning_cycle
    
    asyncio.create_task(
        bus_listen(
            "stepan_bot",
            {
                "get_tasks": bus_get_tasks,
                "get_deadlines": bus_get_deadlines,
                "force_learning_cycle": bus_force_learning_cycle,
            },
        )
    )

    # 5. n8n Webhook / Startup
    async def n8n_webhook_handler(request: Request) -> web.Response:
        try:
            data = await request.json()
            action = data.get("action")
            if action == "daily_report":
                asyncio.create_task(daily_report(bot))
            elif action == "evening_summary":
                asyncio.create_task(evening_summary(bot))
            elif action == "check_deadlines":
                asyncio.create_task(check_deadlines(bot))
            elif action == "weekly_report":
                asyncio.create_task(weekly_report(bot))
            elif action == "auto_task_creation":
                asyncio.create_task(auto_task_creation(bot))
            elif action == "check_followups":
                asyncio.create_task(check_followups(bot))
            elif action == "bus_get_tasks":
                result = await bus_get_tasks({})
                return web.json_response(result)
            elif action == "bus_get_deadlines":
                result = await bus_get_deadlines({})
                return web.json_response(result)
            else:
                return web.json_response({"status": "error", "message": "Unknown action"}, status=400)
            return web.json_response({"status": "ok", "action": action})
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    app = web.Application()
    app.router.add_post("/n8n-webhook", n8n_webhook_handler)
    await event_bus.start_listening(8081, app)

    async def on_startup() -> None:
        logger.info("🤖 Степан запущен! Готов помогать.")
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if admin_id:
            try:
                await bot.send_message(
                    admin_id,
                    "🤖 <b>Степан на связи!</b>\n\n"
                    "Я ваш личный помощник. Пишите мне любые задачи,\n"
                    "вопросы или поручения — я разберусь.\n\n"
                    "💡 Примеры:\n"
                    "• <i>Подготовить 50 лотков руколы к пятнице</i>\n"
                    "• <i>Сколько мы заработали за эту неделю?</i>\n"
                    "• <i>Найди курьера на полный день</i>\n"
                    "• <i>Напиши пост для Instagram про скидку 20%</i>\n"
                    "• <i>Какой статус по всем задачам?</i>",
                )
            except Exception:
                pass

    dp.startup.register(on_startup)

    logger.info("🤖 Запуск Степана...")
    try:
        await scheduler.start()
        asyncio.create_task(start_heartbeat("stepan_bot"))
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()

if __name__ == "__main__":
    asyncio.run(main())
