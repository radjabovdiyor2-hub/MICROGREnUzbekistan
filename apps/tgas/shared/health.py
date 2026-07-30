"""shared/health.py — Heartbeat + мониторинг ботов.

Каждый бот раз в 30с обновляет свой ключ-хэш в Redis (bot:heartbeat:<name>):
поле `ts` — метка живости; `errors`/`last_error` — счётчик и текст последней ошибки.
Стёпан раз в 15 минут вызывает check_all_bots() и алертит, если бот молчит > 5 минут.
Ошибки бота пишутся через record_bot_error и видны в отчёте и на /health (web_office).
"""
import asyncio
import logging
import time
from shared.config import settings

logger = logging.getLogger(__name__)

HEARTBEAT_KEY_PREFIX = "bot:heartbeat:"
HEARTBEAT_INTERVAL = 30       # секунд между пульсами
HEARTBEAT_TTL = 300            # 5 минут — если нет обновления, бот считается мёртвым

# Полный список сервисов (совпадает с docker-compose). Стёпан = PM, отдельного pm нет.
ALL_BOTS = [
    "stepan_bot", "sales_bot", "hr_bot", "finance_bot",
    "marketing_bot", "support_bot", "analytics_bot", "content_bot",
    "qa_bot", "rnd_bot", "devops_bot", "franchise_bot", "n8n_bridge",
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
                await r.hset(key, "ts", str(int(time.time())))
                await r.expire(key, HEARTBEAT_TTL)
            except Exception as e:
                # Ключ старого формата (раньше пульс писался строкой через SET)
                # ломает hset навсегда: WRONGTYPE, бот молча остаётся «НЕ ЗАПУЩЕН»
                # до ручной чистки Redis. Такой ключ сносим и пишем заново.
                if "WRONGTYPE" in str(e).upper():
                    logger.warning("[%s] Ключ пульса устаревшего типа — пересоздаю", bot_name)
                    try:
                        await r.delete(key)
                        await r.hset(key, "ts", str(int(time.time())))
                        await r.expire(key, HEARTBEAT_TTL)
                    except Exception as e2:
                        logger.warning("[%s] Heartbeat ошибка после пересоздания: %s", bot_name, e2)
                else:
                    logger.warning("[%s] Heartbeat ошибка: %s", bot_name, e)
            await asyncio.sleep(HEARTBEAT_INTERVAL)
    except Exception as e:
        logger.error("[%s] Heartbeat не запустился: %s", bot_name, e)


async def record_bot_error(bot_name: str, error: str) -> None:
    """Записать последнюю ошибку бота + увеличить счётчик (для мониторинга). Best-effort."""
    try:
        r = await _get_redis()
        key = f"{HEARTBEAT_KEY_PREFIX}{bot_name}"
        await r.hset(key, mapping={
            "last_error": str(error)[:300],
            "last_error_ts": str(int(time.time())),
        })
        await r.hincrby(key, "errors", 1)
        await r.expire(key, HEARTBEAT_TTL)
        await r.aclose()
    except Exception as e:
        logger.debug("record_bot_error skip: %s", e)


async def check_all_bots() -> dict[str, dict]:
    """Статус всех ботов: {bot: {alive, last_seen_ago, errors, last_error}}."""
    result = {}
    try:
        r = await _get_redis()
        now = int(time.time())
        for bot in ALL_BOTS:
            key = f"{HEARTBEAT_KEY_PREFIX}{bot}"
            # Каждый бот в своём try: один битый ключ не должен прятать остальных.
            # Раньше весь обход шёл в одном блоке, и ключ старого формата (строка
            # вместо хеша) ронял hgetall на WRONGTYPE — цикл обрывался, и все боты
            # ПОСЛЕ проблемного молча исчезали из отчёта. Проверено на живом Redis:
            # одна строка вместо хеша давала 6 ботов из 13, семь пропадали без следа.
            try:
                data = await r.hgetall(key)
            except Exception as e:
                logger.warning("Пульс %s не прочитан (%s) — считаю недоступным", bot, e)
                result[bot] = {"alive": False, "last_seen_ago": -1, "errors": 0,
                               "last_error": f"ключ пульса нечитаем: {e}"}
                continue

            if data and data.get("ts"):
                ago = now - int(data["ts"])
                result[bot] = {
                    "alive": ago < HEARTBEAT_TTL,
                    "last_seen_ago": ago,
                    "errors": int(data.get("errors", 0) or 0),
                    "last_error": data.get("last_error", ""),
                }
            else:
                result[bot] = {"alive": False, "last_seen_ago": -1, "errors": 0, "last_error": ""}
        await r.aclose()
    except Exception as e:
        logger.error("Health check ошибка: %s", e)
    return result


def format_health_report(statuses: dict[str, dict]) -> str:
    """Форматировать отчёт о здоровье ботов (+ счётчик ошибок и последняя ошибка)."""
    lines = ["🏥 <b>Статус ботов:</b>\n"]
    alive_count = 0
    for bot, info in statuses.items():
        name = bot.replace("_bot", "").replace("_", " ").title()
        if info["alive"]:
            alive_count += 1
            extra = f" · ⚠️{info['errors']} ошиб." if info.get("errors") else ""
            lines.append(f"  🟢 {name} — онлайн ({info['last_seen_ago']}с назад){extra}")
        else:
            if info["last_seen_ago"] < 0:
                lines.append(f"  🔴 {name} — НЕ ЗАПУЩЕН")
            else:
                mins = info["last_seen_ago"] // 60
                lines.append(f"  🔴 {name} — ОФФЛАЙН ({mins} мин)")

    lines.append(f"\n{'✅' if alive_count == len(statuses) else '⚠️'} "
                 f"{alive_count}/{len(statuses)} ботов онлайн")

    errored = [(b, i) for b, i in statuses.items() if i.get("last_error")]
    if errored:
        b, i = errored[0]
        lines.append(f"\n🧯 Последняя ошибка ({b.replace('_bot', '')}): "
                     f"<code>{i['last_error'][:120]}</code>")
    return "\n".join(lines)
