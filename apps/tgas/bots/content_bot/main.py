import asyncio
import logging
import os
from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.filters import Command
from aiogram.types import Message

from bots.content_bot.handlers import all_routers
from shared.ai_engine import AIEngine
from shared.prompts import TEAM_CONTEXT
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from shared.event_bus import BotBusActions
from shared.group_orchestrator import create_group_router
from shared.health import start_heartbeat
from shared.scheduler import BotScheduler
from shared.utils import simulate_typing

from bots.content_bot.handlers.tasks import (
    register_content_tasks,
    morning_post,
    evening_post,
    weekly_grid_post,
    reel_post,
)
from bots.content_bot.handlers.bus_handlers import (
    bus_publish_story,
    bus_generate_meme,
    bus_get_status,
    bus_get_last_post,
    bus_sync_publication_metrics,
    bus_product_description,
    _draft_magazine,
)
from bots.content_bot.handlers.tasks_handler import handle_task_created

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

scheduler = BotScheduler("content_bot")

async def ai_fallback(msg: Message) -> None:
    ai = AIEngine()
    await simulate_typing(msg, delay=2)
    r = await ai.chat_completion(
        f"{TEAM_CONTEXT}\n\nТы контент-менеджер Microgreen Uzbekistan. Помогай пользователю.",
        msg.text,
    )
    await msg.answer(r)

test_router = Router()

def _is_admin(message: Message) -> bool:
    return (
        bool(message.from_user) and message.from_user.id in settings.admin_telegram_ids
    )

@test_router.message(Command("testday"))
async def cmd_test_day(message: Message, bot: Bot) -> None:
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    import random
    from datetime import date, timedelta

    random_days = random.randint(0, 365)
    test_date = date.today() + timedelta(days=random_days)

    await message.answer(
        f"🧪 <b>Тестовый прогон на день со случайным смещением ({test_date.strftime('%d.%m.%Y')})</b>\n"
        "Всё уйдёт <b>только в Telegram</b>, в Instagram НЕ публикуется.\n"
        "Генерация займёт пару минут…"
    )
    set_dry_run(True)
    try:
        await message.answer("⏳ ① Утренний сторис…")
        await morning_post(bot, d=test_date)
        await message.answer("⏳ ② Вечерний сторис-рецепт…")
        await evening_post(bot, d=test_date)
        await message.answer("⏳ ③ Пост недели в ленту…")
        await weekly_grid_post(bot, d=test_date)
        await message.answer(
            "✅ Готово. Всё отправлено только в Telegram (Instagram не тронут)."
        )
    finally:
        set_dry_run(False)

@test_router.message(Command("teststory"))
async def cmd_test_story(message: Message, bot: Bot) -> None:
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    import random
    from datetime import date, timedelta
    from shared.content_plan import get_daily_morning_format

    random_days = random.randint(0, 365)
    test_date = date.today() + timedelta(days=random_days)
    fmt = get_daily_morning_format(test_date)

    await message.answer(
        f"🧪 Тест сторис со случайным смещением ({test_date.strftime('%d.%m.%Y')}, формат: {fmt['ru']})…"
    )
    set_dry_run(True)
    try:
        await morning_post(bot, d=test_date)
        await message.answer("✅ Готово (в Instagram не публиковалось).")
    finally:
        set_dry_run(False)

@test_router.message(Command("testevening"))
async def cmd_test_evening(message: Message, bot: Bot) -> None:
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    import random
    from datetime import date, timedelta
    from shared.content_plan import build_recipe_brief

    random_days = random.randint(0, 365)
    test_date = date.today() + timedelta(days=random_days)
    brief = build_recipe_brief(test_date)

    await message.answer(
        f"🧪 Тест вечернего сторис-рецепта со случайным смещением ({test_date.strftime('%d.%m.%Y')})\n"
        f"Кухня: {brief['cuisine']}, Формат: {brief['format']}, Зелень: {brief['hero']}…"
    )
    set_dry_run(True)
    try:
        await evening_post(bot, d=test_date)
        await message.answer("✅ Готово (в Instagram не публиковалось).")
    finally:
        set_dry_run(False)

@test_router.message(Command("testgrid"))
async def cmd_test_grid(message: Message, bot: Bot) -> None:
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    import random
    from datetime import date, timedelta
    from shared.content_plan import get_weekly_grid_pillar

    random_days = random.randint(0, 365)
    test_date = date.today() + timedelta(days=random_days)
    pillar = get_weekly_grid_pillar(test_date)

    await message.answer(
        f"🧪 Тест поста недели со случайным смещением ({test_date.strftime('%d.%m.%Y')}, рубрика: {pillar['name']})…"
    )
    set_dry_run(True)
    try:
        await weekly_grid_post(bot, d=test_date)
        await message.answer("✅ Готово (в Instagram не публиковалось).")
    finally:
        set_dry_run(False)

@test_router.message(Command("testreel"))
async def cmd_test_reel(message: Message, bot: Bot) -> None:
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    from shared.video_utils import ffmpeg_available

    if not ffmpeg_available():
        await message.answer(
            "⚠️ ffmpeg недоступен — Reel собрать нельзя (нужен ffmpeg в образе)."
        )
        return
    await message.answer("🧪 Собираю Reel (видео уйдёт только в Telegram)…")
    set_dry_run(True)
    try:
        await reel_post(bot)
        await message.answer("✅ Готово (в Instagram не публиковалось).")
    finally:
        set_dry_run(False)

async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call
    await _shared_roll_call("content_bot", payload)

async def main() -> None:
    if not settings.content_bot_token:
        logger.error("FATAL: CONTENT_BOT_TOKEN is missing!")
        import sys
        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.content_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.task_ui import task_ui_router

    dp.include_router(task_ui_router)
    dp.include_router(test_router)
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        ai_fallback,
        wake_words=["отдел контент", "контент", "content", "посты", "сторис"],
    )
    dp.include_router(group_router)

    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8089)

    from shared.bot_bus import start_listener as bus_listen
    
    register_content_tasks(scheduler, bot)

    asyncio.create_task(
        bus_listen(
            "content_bot",
            {
                "publish_story": bus_publish_story,
                "publish_post": bus_publish_story,
                "generate_meme": bus_generate_meme,
                "get_status": bus_get_status,
                "get_last_post": bus_get_last_post,
                "sync_publication_metrics": bus_sync_publication_metrics,
                "product_description": bus_product_description,
                BotBusActions.DRAFT_MAGAZINE: _draft_magazine,
            },
        )
    )

    await scheduler.start()
    asyncio.create_task(start_heartbeat("content_bot"))

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
