"""shared/settings_store.py — Чтение настроек, заданных владельцем в админке.

Настройки лежат в тех же таблицах, что заполняет веб-админка
(`app_settings`, `bot_jobs`, `bot_prompts`) — база одна на витрину и на ботов,
поэтому ходим в неё напрямую, без HTTP.

Три правила, ради которых модуль вообще существует:

1. **Никогда не падаем.** Значение из БД — это уточнение, а не обязательное
   условие работы. Нет связи, нет таблицы (свежий деплой до `prisma db push`),
   кривой JSON — возвращаем переданный дефолт. Бот, который не смог прочитать
   настройку, обязан продолжить работать по-старому.
2. **Дефолт живёт в коде.** Здесь нет своих значений по умолчанию: их даёт
   вызывающий, обычно из `shared/config.py` (то есть из .env). Так поведение
   без единой строки в `app_settings` в точности совпадает с прежним.
3. **Кэш с TTL.** Расписания и промпты читаются в горячих циклах; ходить в
   Postgres на каждый чих незачем. TTL 60 секунд — правка в админке доезжает
   до ботов за минуту без перезапуска контейнеров.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from sqlalchemy import text

from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

CACHE_TTL = 60  # секунд

_settings_cache: dict[str, Any] = {}
_settings_at: float = 0.0

_prompt_cache: dict[tuple[str, str], str] = {}
_prompt_at: float = 0.0


def invalidate() -> None:
    """Сбросить кэш — вызывается по событию CONFIG_UPDATED из админки."""
    global _settings_at, _prompt_at
    _settings_at = 0.0
    _prompt_at = 0.0


async def _load_settings() -> dict[str, Any]:
    """Прочитать app_settings целиком. При любой ошибке — пустой словарь."""
    global _settings_cache, _settings_at

    now = time.monotonic()
    if _settings_cache and now - _settings_at < CACHE_TTL:
        return _settings_cache

    data: dict[str, Any] = {}
    try:
        async with get_session_ctx() as session:
            res = await session.execute(text("SELECT key, value FROM app_settings"))
            for key, value in res.fetchall():
                # Prisma пишет колонку как jsonb: драйвер обычно уже отдаёт
                # разобранный объект, но на строку тоже закладываемся.
                if isinstance(value, str):
                    try:
                        value = json.loads(value)
                    except json.JSONDecodeError:
                        pass
                data[key] = value
        _settings_cache = data
        _settings_at = now
    except Exception as exc:
        # Таблицы может не быть — это нормально до первого prisma db push.
        logger.debug(
            "settings_store: настройки не прочитаны (%s), работаем на дефолтах", exc
        )
        _settings_at = now  # не долбим базу в цикле
        _settings_cache = data
    return data


async def get(key: str, default: Any = None) -> Any:
    """Значение настройки или дефолт вызывающего."""
    data = await _load_settings()
    value = data.get(key)
    return default if value is None else value


async def get_float(key: str, default: float) -> float:
    """Число с гарантией типа — для порогов и бенчмарков."""
    value = await get(key, None)
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        logger.warning(
            "settings_store: %s=%r не число, беру дефолт %s", key, value, default
        )
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


async def get_prompt(bot: str, key: str, default: str) -> str:
    """Текст промпта из bot_prompts или дефолт из кода."""
    global _prompt_cache, _prompt_at

    now = time.monotonic()
    if not _prompt_cache or now - _prompt_at >= CACHE_TTL:
        cache: dict[tuple[str, str], str] = {}
        try:
            async with get_session_ctx() as session:
                res = await session.execute(
                    text("SELECT bot, key, text FROM bot_prompts")
                )
                for row_bot, row_key, row_text in res.fetchall():
                    cache[(row_bot, row_key)] = row_text
            _prompt_cache = cache
        except Exception as exc:
            logger.debug("settings_store: промпты не прочитаны (%s)", exc)
        _prompt_at = now

    return _prompt_cache.get((bot, key), default)


async def get_benchmarks(bot: str, metric: str, default: dict) -> dict:
    """Бенчмарки петли обучения.

    Хранятся в bot_prompts под ключом 'bench.<metric>' как JSON: отдельную
    таблицу заводить ради этого не стоило, а формат всё равно текстовый.
    Ключи, которых владелец не менял, берутся из дефолта — поэтому добавление
    нового бенчмарка в коде не требует правки записи в БД.
    """
    raw = await get_prompt(bot, f"bench.{metric}", "")
    if not raw:
        return default
    try:
        override = json.loads(raw)
        if not isinstance(override, dict):
            raise ValueError("ожидался объект")
        return {**default, **override}
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning(
            "settings_store: bench.%s у %s не разобран (%s)", metric, bot, exc
        )
        return default


async def get_job_overrides(bot: str) -> dict[str, dict]:
    """Расписания задач бота из bot_jobs: {name: {enabled, hour, minute, ...}}.

    Пустой словарь означает «правок нет» — планировщик оставит то, что
    прописано в коде.
    """
    overrides: dict[str, dict] = {}
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT name, kind, hour, minute, day_of_week, day_of_month, "
                    "seconds, enabled FROM bot_jobs WHERE bot = :bot"
                ),
                {"bot": bot},
            )
            for row in res.fetchall():
                overrides[row[0]] = {
                    "kind": row[1],
                    "hour": row[2],
                    "minute": row[3],
                    "day_of_week": row[4],
                    "day_of_month": row[5],
                    "seconds": row[6],
                    "enabled": row[7],
                }
    except Exception as exc:
        logger.debug("settings_store: расписания %s не прочитаны (%s)", bot, exc)
    return overrides


async def register_job(bot: str, name: str, kind: str, **fields: Any) -> None:
    """Показать задачу в админке.

    Планировщик вызывает это при старте для каждой задачи, чтобы владелец
    видел полный список — включая те, которые ещё ни разу не правил.
    ON CONFLICT DO NOTHING: существующую строку не трогаем, иначе перезапуск
    контейнера затирал бы настройки владельца дефолтами из кода.
    """
    try:
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO bot_jobs (id, bot, name, kind, hour, minute, "
                    "day_of_week, day_of_month, seconds, enabled, updated_at) "
                    "VALUES (gen_random_uuid()::text, :bot, :name, :kind, :hour, :minute, "
                    ":dow, :dom, :seconds, TRUE, NOW()) "
                    "ON CONFLICT (bot, name) DO NOTHING"
                ),
                {
                    "bot": bot,
                    "name": name,
                    "kind": kind,
                    "hour": fields.get("hour"),
                    "minute": fields.get("minute"),
                    "dow": fields.get("day_of_week"),
                    "dom": fields.get("day_of_month"),
                    "seconds": fields.get("seconds"),
                },
            )
    except Exception as exc:
        logger.debug(
            "settings_store: задача %s/%s не зарегистрирована (%s)", bot, name, exc
        )


async def record_job_run(
    bot: str, name: str, status: str, error: Optional[str] = None
) -> None:
    """Отметить факт выполнения задачи — админка показывает это владельцу."""
    try:
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "UPDATE bot_jobs SET last_run_at = NOW(), last_status = :status, "
                    "last_error = :error WHERE bot = :bot AND name = :name"
                ),
                {
                    "bot": bot,
                    "name": name,
                    "status": status,
                    "error": (error or "")[:1000] or None,
                },
            )
    except Exception as exc:
        logger.debug(
            "settings_store: факт запуска %s/%s не записан (%s)", bot, name, exc
        )
