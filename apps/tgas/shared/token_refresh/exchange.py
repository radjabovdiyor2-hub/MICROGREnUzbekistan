import logging
import os
import aiohttp
from datetime import datetime, timezone
from shared.token_refresh.core import GRAPH_BASE_URL, ENV_PATH
from shared.token_refresh.credentials import _get_app_credentials, _save_to_env

logger = logging.getLogger(__name__)

async def exchange_for_long_lived_token(short_token: str) -> str:
    app_id, app_secret = _get_app_credentials()
    if not app_id:
        return ""

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/oauth/access_token"
            params = {
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "fb_exchange_token": short_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()

                if "access_token" in data:
                    new_token = data["access_token"]
                    expires_in = data.get("expires_in", 5184000)
                    logger.info(
                        f"✅ Получен долгосрочный USER-токен. "
                        f"Срок действия: {expires_in // 86400} дней."
                    )
                    return new_token
                else:
                    error = data.get("error", {})
                    logger.error(f"Ошибка обмена токена: {error.get('message', data)}")
                    return ""
    except Exception as e:
        logger.error(f"Ошибка при обмене токена: {e}", exc_info=True)
        return ""

async def get_page_token(long_lived_user_token: str, page_id: str) -> str:
    if not page_id:
        logger.error("FACEBOOK_PAGE_ID не указан.")
        return ""

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{page_id}"
            params = {
                "fields": "access_token,name",
                "access_token": long_lived_user_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()

                if "access_token" in data:
                    page_token = data["access_token"]
                    page_name = data.get("name", "Unknown")
                    logger.info(f"✅ Получен Page-токен для «{page_name}» (ID: {page_id})")
                    return page_token
                else:
                    error = data.get("error", {})
                    logger.error(f"Ошибка получения Page-токена: {error.get('message', data)}")
                    return ""
    except Exception as e:
        logger.error(f"Ошибка при получении Page-токена: {e}", exc_info=True)
        return ""

async def full_token_exchange(current_token: str = None) -> dict:
    from shared.config import settings

    result = {"user_token": "", "page_token": "", "success": False}

    if not current_token:
        current_token = getattr(settings, "instagram_access_token", "")
    if not current_token:
        logger.error("INSTAGRAM_ACCESS_TOKEN не установлен.")
        return result

    page_id = getattr(settings, "facebook_page_id", "")

    logger.info("🔄 Шаг 1: Обмен на долгосрочный user-токен...")
    long_user_token = await exchange_for_long_lived_token(current_token)
    if not long_user_token:
        logger.error("❌ Не удалось получить долгосрочный user-токен.")
        return result
    result["user_token"] = long_user_token

    if page_id:
        logger.info("🔄 Шаг 2: Получение Page-токена...")
        page_token = await get_page_token(long_user_token, page_id)
        if page_token:
            result["page_token"] = page_token
        else:
            logger.warning("⚠️ Не удалось получить Page-токен. Будет использован user-токен.")
    else:
        logger.warning("⚠️ FACEBOOK_PAGE_ID не указан, пропуск получения Page-токена.")

    final_token = result["page_token"] or long_user_token

    now_iso = datetime.now(timezone.utc).isoformat()

    saved_token = _save_to_env("INSTAGRAM_ACCESS_TOKEN", final_token)
    saved_date = _save_to_env("INSTAGRAM_TOKEN_UPDATED_AT", now_iso)

    if saved_token and saved_date:
        os.environ["INSTAGRAM_ACCESS_TOKEN"] = final_token
        os.environ["INSTAGRAM_TOKEN_UPDATED_AT"] = now_iso

        logger.info(f"✅ Полный цикл обмена завершён. Токен сохранён в .env ({ENV_PATH})")
        result["success"] = True
    else:
        logger.error("❌ Не удалось сохранить токен в .env.")

    return result
