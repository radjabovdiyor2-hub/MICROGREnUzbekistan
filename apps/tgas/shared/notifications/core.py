import logging
from typing import Optional
from aiogram import Bot
from shared.config import settings

logger = logging.getLogger(__name__)

def _admin_chat_id() -> Optional[int]:
    return settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None

async def notify_admin(bot: Bot, admin_ids: list, text_msg: str) -> None:
    for admin_id in admin_ids:
        try:
            await bot.send_message(admin_id, text_msg)
        except Exception as e:
            logger.error(f"Не удалось отправить уведомление админу {admin_id}: {e}")

async def alert_admins(bot: Bot, text_msg: str, parse_mode: Optional[str] = "HTML") -> int:
    admin_ids = settings.admin_telegram_ids or []
    if not admin_ids:
        logger.error("ALERT не доставлен: ADMIN_TELEGRAM_IDS пуст. Текст: %s", text_msg[:200])
        return 0

    delivered = 0
    for admin_id in admin_ids:
        try:
            await bot.send_message(admin_id, text_msg, parse_mode=parse_mode)
            delivered += 1
        except Exception as e:
            logger.error("Не удалось доставить алерт админу %s: %s", admin_id, e)

    if delivered == 0:
        logger.error(
            "ALERT не дошёл ни до кого из %d админов: %s",
            len(admin_ids),
            text_msg[:200],
        )

    return delivered
