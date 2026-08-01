import logging
from typing import Tuple, Optional
from shared.token_refresh.core import ENV_PATH

logger = logging.getLogger(__name__)

def _get_app_credentials() -> Tuple[Optional[str], Optional[str]]:
    try:
        from shared.config import settings

        app_id = getattr(settings, "facebook_app_id", "") or ""
        app_secret = getattr(settings, "facebook_app_secret", "") or ""
        if not app_id or not app_secret:
            logger.error(
                "❌ FACEBOOK_APP_ID или FACEBOOK_APP_SECRET не настроены в .env. "
                "Запустите: python setup_fb_credentials.py"
            )
            return None, None
        return app_id, app_secret
    except Exception as e:
        logger.error(f"Ошибка загрузки настроек: {e}")
        return None, None

def _save_to_env(key: str, value: str) -> bool:
    try:
        from dotenv import set_key

        set_key(ENV_PATH, key, value)
        logger.info(f"✅ .env обновлён: {key} = {value[:25]}...")
        return True
    except ImportError:
        logger.error("python-dotenv не установлен. Установите: pip install python-dotenv")
        return False
    except Exception as e:
        logger.error(f"Ошибка записи в .env ({key}): {e}", exc_info=True)
        return False
