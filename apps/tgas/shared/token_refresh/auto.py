import logging
import os
from datetime import datetime, timezone
from shared.token_refresh.credentials import _save_to_env
from shared.token_refresh.debug import debug_token
from shared.token_refresh.exchange import full_token_exchange

logger = logging.getLogger(__name__)

async def auto_refresh_token() -> None:
    from shared.config import settings

    current_token = getattr(settings, "instagram_access_token", "")

    if not current_token:
        logger.warning("INSTAGRAM_ACCESS_TOKEN не установлен. Пропуск обновления.")
        return

    token_updated_at = os.environ.get("INSTAGRAM_TOKEN_UPDATED_AT", "")
    should_refresh = False

    if token_updated_at:
        try:
            updated_dt = datetime.fromisoformat(token_updated_at)
            now = datetime.now(timezone.utc)
            age_days = (now - updated_dt).days
            logger.info(f"📅 Возраст токена: {age_days} дней")

            if age_days >= 50:
                logger.info(f"Токен старше 50 дней ({age_days}д). Обновляем...")
                should_refresh = True
            else:
                logger.info(f"Токен ещё свежий ({age_days}д). Обновление не требуется.")
                return
        except (ValueError, TypeError) as e:
            logger.warning(f"Не удалось распарсить INSTAGRAM_TOKEN_UPDATED_AT: {e}")
            should_refresh = True
    else:
        logger.info("INSTAGRAM_TOKEN_UPDATED_AT не найден. Проверяем токен через API...")
        debug_info = await debug_token(current_token)
        days_left = debug_info.get("_days_left")
        if days_left is not None and days_left > 10:
            logger.info(
                f"Токен действителен ещё {days_left} дней. "
                f"Сохраняем дату и пропускаем обновление."
            )
            _save_to_env("INSTAGRAM_TOKEN_UPDATED_AT", datetime.now(timezone.utc).isoformat())
            return
        should_refresh = True

    if should_refresh:
        result = await full_token_exchange(current_token)
        if result["success"]:
            logger.info("✅ Токен Instagram успешно обновлён и сохранён в .env")
        else:
            logger.error("❌ Не удалось обновить токен Instagram.")
