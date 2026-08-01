"""
Shared — обработка ROLL_CALL события.

Единый обработчик для всех ботов. Раньше был скопирован в 7 файлов.
"""

import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings

logger = logging.getLogger(__name__)

BOT_DISPLAY_NAMES = {
    "sales_bot": "Отдел Продаж (Sales)",
    "marketing_bot": "Отдел Маркетинга",
    "support_bot": "Отдел Поддержки",
    "hr_bot": "Отдел HR",
    "finance_bot": "Отдел Финансов",
    "analytics_bot": "Отдел Аналитики",
    "content_bot": "Отдел Контента",
    "qa_bot": "Отдел QA (Качество)",
    "rnd_bot": "Отдел R&D (Исследования)",
    "devops_bot": "Отдел DevOps (IT)",
    "franchise_bot": "Отдел Франшизы",
    "stepan_bot": "Степан (PM / Руководитель)",
}


async def handle_roll_call(bot_name: str, payload: dict) -> None:
    """Ответить на перекличку — единый обработчик для всех ботов."""
    chat_id = payload.get("data", {}).get("chat_id")
    if not chat_id:
        return

    token = (
        getattr(settings, f"{bot_name}_token", None)
        or settings.stepan_bot_token
        or settings.sales_bot_token
    )
    if not token:
        logger.error("ROLL_CALL: токен для %s и фоллбэк не найдены", bot_name)
        return

    display_name = BOT_DISPLAY_NAMES.get(bot_name, bot_name)
    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        await bot.send_message(chat_id, f"🟢 {display_name} на связи!")
    except Exception as e:
        logger.error("ROLL_CALL %s: ошибка отправки: %s", bot_name, e)
    finally:
        await bot.session.close()
