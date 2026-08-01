import json
import logging
import time
import shared.settings_store.core as core
from sqlalchemy import text
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

async def _load_settings() -> dict:
    now = time.monotonic()
    if core._settings_cache and now - core._settings_at < core.CACHE_TTL:
        return core._settings_cache

    data: dict[str, object] = {}
    try:
        async with get_session_ctx() as session:
            res = await session.execute(text("SELECT key, value FROM app_settings"))
            for key, value in res.fetchall():
                if isinstance(value, str):
                    try:
                        value = json.loads(value)
                    except json.JSONDecodeError:
                        pass
                data[key] = value
        core._settings_cache = data
        core._settings_at = now
    except Exception as exc:
        logger.debug("settings_store: настройки не прочитаны (%s), работаем на дефолтах", exc)
        core._settings_at = now
        core._settings_cache = data
    return data

async def get(key: str, default: object = None) -> object:
    data = await _load_settings()
    value = data.get(key)
    return default if value is None else value

async def get_float(key: str, default: float) -> float:
    value = await get(key, None)
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        logger.warning("settings_store: %s=%r не число, беру дефолт %s", key, value, default)
        return default

async def get_int(key: str, default: int) -> int:
    return int(await get_float(key, float(default)))

async def get_bool(key: str, default: bool) -> bool:
    value = await get(key, None)
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")
