"""
Microgreen Uzbekistan — Instagram Token Refresh
================================================
Автоматическое обновление долгосрочных токенов Instagram Graph API.

Полный цикл:
1. Обмен краткосрочного user-токена на долгосрочный (60 дней)
2. Получение Page-токена из долгосрочного user-токена
3. Сохранение в .env через dotenv.set_key()
4. Периодическое обновление до истечения срока (auto_refresh_token)
"""

import logging
import os
import aiohttp
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

API_VERSION = "v18.0"
GRAPH_BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# Путь к .env — фиксированный, в корне проекта
ENV_PATH = str(Path(__file__).resolve().parent.parent / ".env")


def _get_app_credentials():
    """Возвращает (app_id, app_secret) из settings, или (None, None)."""
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
    """Сохраняет ключ=значение в .env через dotenv.set_key()."""
    try:
        from dotenv import set_key
        set_key(ENV_PATH, key, value)
        logger.info(f"✅ .env обновлён: {key} = {value[:25]}...")
        return True
    except ImportError:
        logger.error(
            "python-dotenv не установлен. Установите: pip install python-dotenv"
        )
        return False
    except Exception as e:
        logger.error(f"Ошибка записи в .env ({key}): {e}", exc_info=True)
        return False


async def debug_token(token: str) -> dict:
    """
    Получает отладочную информацию о токене через Graph API.
    Возвращает dict с полями: is_valid, expires_at, scopes, type и т.д.
    """
    app_id, app_secret = _get_app_credentials()
    if not app_id:
        return {}

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/debug_token"
            params = {
                "input_token": token,
                "access_token": f"{app_id}|{app_secret}",
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                debug_data = data.get("data", {})
                if debug_data:
                    expires_at = debug_data.get("expires_at", 0)
                    if expires_at:
                        exp_dt = datetime.fromtimestamp(expires_at, tz=timezone.utc)
                        days_left = (exp_dt - datetime.now(timezone.utc)).days
                        debug_data["_days_left"] = days_left
                        debug_data["_expires_readable"] = exp_dt.isoformat()
                    logger.info(
                        f"🔍 Token debug: valid={debug_data.get('is_valid')}, "
                        f"type={debug_data.get('type')}, "
                        f"expires={debug_data.get('_expires_readable', 'never')}, "
                        f"days_left={debug_data.get('_days_left', '∞')}"
                    )
                return debug_data
    except Exception as e:
        logger.error(f"Ошибка debug_token: {e}", exc_info=True)
        return {}


async def exchange_for_long_lived_token(short_token: str) -> str:
    """
    Шаг 1: Обменивает краткосрочный (или текущий) user-токен на долгосрочный.

    GET /oauth/access_token?
        grant_type=fb_exchange_token&
        client_id={app_id}&
        client_secret={app_secret}&
        fb_exchange_token={current_token}

    Returns:
        Долгосрочный user access_token или "" при ошибке.
    """
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
                    expires_in = data.get("expires_in", 5184000)  # ~60 дней
                    logger.info(
                        f"✅ Получен долгосрочный USER-токен. "
                        f"Срок действия: {expires_in // 86400} дней."
                    )
                    return new_token
                else:
                    error = data.get("error", {})
                    logger.error(
                        f"Ошибка обмена токена: "
                        f"{error.get('message', data)}"
                    )
                    return ""
    except Exception as e:
        logger.error(f"Ошибка при обмене токена: {e}", exc_info=True)
        return ""


async def get_page_token(long_lived_user_token: str, page_id: str) -> str:
    """
    Шаг 2: Получает долгосрочный Page-токен из долгосрочного user-токена.

    GET /{page_id}?fields=access_token&access_token={long_lived_user_token}

    Page-токен, полученный из долгосрочного user-токена, является
    «бессрочным» (never expires) — но рекомендуется обновлять периодически.

    Returns:
        Page access_token или "" при ошибке.
    """
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
                    logger.info(
                        f"✅ Получен Page-токен для «{page_name}» (ID: {page_id})"
                    )
                    return page_token
                else:
                    error = data.get("error", {})
                    logger.error(
                        f"Ошибка получения Page-токена: "
                        f"{error.get('message', data)}"
                    )
                    return ""
    except Exception as e:
        logger.error(f"Ошибка при получении Page-токена: {e}", exc_info=True)
        return ""


async def full_token_exchange(current_token: str = None) -> dict:
    """
    Полный цикл обмена токенов:
    1. Exchange short → long-lived user token
    2. Get page token from long-lived user token
    3. Save to .env

    Args:
        current_token: Текущий токен. Если None — берётся из settings.

    Returns:
        dict с ключами: user_token, page_token, success
    """
    from shared.config import settings

    result = {"user_token": "", "page_token": "", "success": False}

    if not current_token:
        current_token = getattr(settings, "instagram_access_token", "")
    if not current_token:
        logger.error("INSTAGRAM_ACCESS_TOKEN не установлен.")
        return result

    page_id = getattr(settings, "facebook_page_id", "")

    # Шаг 1: Обменять на долгосрочный user-токен
    logger.info("🔄 Шаг 1: Обмен на долгосрочный user-токен...")
    long_user_token = await exchange_for_long_lived_token(current_token)
    if not long_user_token:
        logger.error("❌ Не удалось получить долгосрочный user-токен.")
        return result
    result["user_token"] = long_user_token

    # Шаг 2: Получить page-токен
    if page_id:
        logger.info("🔄 Шаг 2: Получение Page-токена...")
        page_token = await get_page_token(long_user_token, page_id)
        if page_token:
            result["page_token"] = page_token
        else:
            logger.warning(
                "⚠️ Не удалось получить Page-токен. "
                "Будет использован user-токен."
            )
    else:
        logger.warning(
            "⚠️ FACEBOOK_PAGE_ID не указан, пропуск получения Page-токена."
        )

    # Шаг 3: Определить финальный токен (page-токен приоритетнее)
    final_token = result["page_token"] or long_user_token

    # Шаг 4: Сохранить в .env
    now_iso = datetime.now(timezone.utc).isoformat()

    saved_token = _save_to_env("INSTAGRAM_ACCESS_TOKEN", final_token)
    saved_date = _save_to_env("INSTAGRAM_TOKEN_UPDATED_AT", now_iso)

    if saved_token and saved_date:
        # Обновить переменные в текущем процессе
        os.environ["INSTAGRAM_ACCESS_TOKEN"] = final_token
        os.environ["INSTAGRAM_TOKEN_UPDATED_AT"] = now_iso

        logger.info(
            f"✅ Полный цикл обмена завершён. "
            f"Токен сохранён в .env ({ENV_PATH})"
        )
        result["success"] = True
    else:
        logger.error("❌ Не удалось сохранить токен в .env.")

    return result


async def auto_refresh_token():
    """
    Автоматически проверяет возраст токена и обновляет его при необходимости.

    Логика:
    1. Проверяет INSTAGRAM_TOKEN_UPDATED_AT в .env
    2. Если токену больше 50 дней — запускает полный обмен
    3. Если нет даты обновления — обновляет на всякий случай

    Рекомендуется запускать по cron/scheduler раз в неделю.
    """
    from shared.config import settings

    current_token = getattr(settings, "instagram_access_token", "")

    if not current_token:
        logger.warning("INSTAGRAM_ACCESS_TOKEN не установлен. Пропуск обновления.")
        return

    # Проверяем возраст токена
    token_updated_at = os.environ.get("INSTAGRAM_TOKEN_UPDATED_AT", "")
    should_refresh = False

    if token_updated_at:
        try:
            updated_dt = datetime.fromisoformat(token_updated_at)
            now = datetime.now(timezone.utc)
            age_days = (now - updated_dt).days
            logger.info(f"📅 Возраст токена: {age_days} дней")

            if age_days >= 50:
                logger.info(
                    f"Токен старше 50 дней ({age_days}д). Обновляем..."
                )
                should_refresh = True
            else:
                logger.info(
                    f"Токен ещё свежий ({age_days}д). Обновление не требуется."
                )
                return
        except (ValueError, TypeError) as e:
            logger.warning(
                f"Не удалось распарсить INSTAGRAM_TOKEN_UPDATED_AT: {e}"
            )
            should_refresh = True
    else:
        # Нет информации о дате — пробуем debug_token для проверки
        logger.info(
            "INSTAGRAM_TOKEN_UPDATED_AT не найден. Проверяем токен через API..."
        )
        debug_info = await debug_token(current_token)
        days_left = debug_info.get("_days_left")
        if days_left is not None and days_left > 10:
            logger.info(
                f"Токен действителен ещё {days_left} дней. "
                f"Сохраняем дату и пропускаем обновление."
            )
            _save_to_env(
                "INSTAGRAM_TOKEN_UPDATED_AT",
                datetime.now(timezone.utc).isoformat()
            )
            return
        should_refresh = True

    if should_refresh:
        result = await full_token_exchange(current_token)
        if result["success"]:
            logger.info("✅ Токен Instagram успешно обновлён и сохранён в .env")
        else:
            logger.error("❌ Не удалось обновить токен Instagram.")
