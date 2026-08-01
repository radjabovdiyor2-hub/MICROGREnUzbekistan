import json
import logging
import time
import shared.settings_store.core as core
from sqlalchemy import text
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

async def get_prompt(bot: str, key: str, default: str) -> str:
    now = time.monotonic()
    if not core._prompt_cache or now - core._prompt_at >= core.CACHE_TTL:
        cache: dict[tuple[str, str], str] = {}
        try:
            async with get_session_ctx() as session:
                res = await session.execute(text("SELECT bot, key, text FROM bot_prompts"))
                for row_bot, row_key, row_text in res.fetchall():
                    cache[(row_bot, row_key)] = row_text
            core._prompt_cache = cache
        except Exception as exc:
            logger.debug("settings_store: промпты не прочитаны (%s)", exc)
        core._prompt_at = now

    return core._prompt_cache.get((bot, key), default)

async def get_benchmarks(bot: str, metric: str, default: dict) -> dict:
    raw = await get_prompt(bot, f"bench.{metric}", "")
    if not raw:
        return default
    try:
        override = json.loads(raw)
        if not isinstance(override, dict):
            raise ValueError("ожидался объект")
        return {**default, **override}
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("settings_store: bench.%s у %s не разобран (%s)", metric, bot, exc)
        return default
