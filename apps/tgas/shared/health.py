"""shared/health.py — Heartbeat система для мониторинга ботов.

Каждый бот вызывает heartbeat() каждые 30 секунд.
Степан проверяет все heartbeats и алертит если бот не отвечает > 5 минут.
"""
import asyncio
import logging
import time
from typing import Optional
from shared.config import settings

logger = logging.getLogger(__name__)

HEARTBEAT_KEY_PREFIX = "bot:heartbeat:"
HEARTBEAT_INTERVAL = 30       # секунд между пульсами
HEARTBEAT_TTL = 300            # 5 минут — если нет обновления, бот считается мёртвым

ALL_BOTS = [
    "stepan_bot", "sales_bot", "hr_bot", "finance_bot",
    "marketing_bot", "pm_bot", "support_bot", "analytics_bot", "content_bot",
]


async def _get_redis():
    """Получить подключение к Redis."""
    import redis.asyncio as aioredis
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def start_heartbeat(bot_name: str):
    """Запустить фоновый heartbeat для бота. Вызывать как asyncio.create_task."""
    try:
        r = await _get_redis()
        key = f"{HEARTBEAT_KEY_PREFIX}{bot_name}"
        logger.info("[%s] 💓 Heartbeat запущен", bot_name)
        while True:
            try:
                await r.set(key, str(int(time.time())), ex=HEARTBEAT_TTL)
            except Exception as e:
                logger.warning("[%s] Heartbeat ошибка: %s", bot_name, e)
            await asyncio.sleep(HEARTBEAT_INTERVAL)
    except Exception as e:
        logger.error("[%s] Heartbeat не запустился: %s", bot_name, e)


async def check_all_bots() -> dict[str, dict]:
    """Проверить статус всех ботов. Возвращает {bot_name: {alive, last_seen_ago}}."""
    result = {}
    try:
        r = await _get_redis()
        now = int(time.time())
        for bot in ALL_BOTS:
            key = f"{HEARTBEAT_KEY_PREFIX}{bot}"
            val = await r.get(key)
            if val:
                ago = now - int(val)
                result[bot] = {"alive": ago < HEARTBEAT_TTL, "last_seen_ago": ago}
            else:
                result[bot] = {"alive": False, "last_seen_ago": -1}
        await r.aclose()
    except Exception as e:
        logger.error("Health check ошибка: %s", e)
    return result


def format_health_report(statuses: dict[str, dict]) -> str:
    """Форматировать отчёт о здоровье ботов."""
    lines = ["🏥 <b>Статус ботов:</b>\n"]
    alive_count = 0
    for bot, info in statuses.items():
        name = bot.replace("_bot", "").replace("_", " ").title()
        if info["alive"]:
            alive_count += 1
            ago = info["last_seen_ago"]
            lines.append(f"  🟢 {name} — онлайн ({ago}с назад)")
        else:
            if info["last_seen_ago"] < 0:
                lines.append(f"  🔴 {name} — НЕ ЗАПУЩЕН")
            else:
                mins = info["last_seen_ago"] // 60
                lines.append(f"  🔴 {name} — ОФФЛАЙН ({mins} мин)")
    
    lines.append(f"\n{'✅' if alive_count == len(statuses) else '⚠️'} "
                 f"{alive_count}/{len(statuses)} ботов онлайн")
    return "\n".join(lines)
