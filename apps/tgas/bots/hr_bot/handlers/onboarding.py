import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
import asyncio
from shared.config import settings

logger = logging.getLogger(__name__)

async def handle_employee_created(payload: dict) -> None:
    """Онбординг нового сотрудника при добавлении в систему (по EMPLOYEE_CREATED)."""
    data = payload.get("data", {})
    employee_id = data.get("id")
    telegram_id = data.get("telegram_id")
    name = data.get("name", "Коллега")

    if not telegram_id:
        return

    bot = Bot(
        token=settings.hr_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    
    try:
        logger.info(f"HR BOT: Start onboarding for {name} ({telegram_id})")
        
        # День 1: Приветствие и правила
        await bot.send_message(
            telegram_id,
            f"👋 <b>Привет, {name}! Добро пожаловать в команду Microgreen Uzbekistan!</b>\n\n"
            f"Я твой виртуальный HR-помощник. Здесь ты можешь:\n"
            f"- Отмечать приход и уход командами /checkin и /checkout\n"
            f"- Смотреть свой статус командой /status\n"
            f"- Просить отпуск или больничный через меню\n\n"
            f"Главное правило: всегда отмечай смены, чтобы мы могли корректно рассчитывать твою зарплату и бонусы!"
        )

        await asyncio.sleep(5)
        
        # Инструкции
        await bot.send_message(
            telegram_id,
            f"📚 <b>Полезная информация:</b>\n\n"
            f"• Мы используем современное оборудование, всегда следи за чистотой на рабочем месте.\n"
            f"• График работы обсуждается с руководителем.\n"
            f"• Если есть вопросы к руководителю, можешь писать напрямую в рабочие чаты.\n\n"
            f"Удачной работы!"
        )
    except Exception as e:
        logger.error(f"Onboarding error for {telegram_id}: {e}", exc_info=True)
    finally:
        await bot.session.close()
