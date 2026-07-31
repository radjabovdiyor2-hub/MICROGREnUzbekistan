"""
🔧 РЕЕСТР ИНСТРУМЕНТОВ СТЁПАНА — клиент витрины.
=================================================

Единый каталог инструментов живёт в apps/web (tools.ts). Telegram-бот
получает его по HTTP, фильтрует по рантайму 'tg' и отдаёт модели.
Инструменты, реализованные на стороне витрины (Prisma-запросы), исполняются
удалённо через POST /api/admin/stepan/tools/execute.

Паттерн связи: тот же, что в assistant_memory.py и owner_alerts.py —
STOREFRONT_API_URL + x-bot-secret.

Кеширование: определения обновляются раз в 10 минут. При недоступности
витрины бот работает с закешированной версией. Если кеша нет (первый старт,
витрина лежит) — возвращает пустой список и пишет предупреждение в лог.
"""

import logging
import os
import time
from typing import Any, Optional

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api").rstrip("/")
TOOLS_PATH = "/admin/stepan/tools"
EXECUTE_PATH = "/admin/stepan/tools/execute"
TIMEOUT_SECONDS = 10
CACHE_TTL_SECONDS = 600  # 10 минут

# Кеш определений: обновляется при успешном запросе.
_cache: list[dict[str, Any]] = []
_cache_ts: float = 0.0


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "x-bot-secret": os.getenv("BOT_SECRET", ""),
    }


async def load_registry(runtime: str = "tg") -> list[dict[str, Any]]:
    """Получить определения инструментов, доступных в указанном рантайме.

    Возвращает список в формате OpenAI function-calling:
    [{"type": "function", "function": {"name", "description", "parameters"}}, ...]

    При ошибке: закешированная версия или пустой список.
    """
    global _cache, _cache_ts

    # Если кеш свежий — отдаём без запроса.
    if _cache and (time.monotonic() - _cache_ts) < CACHE_TTL_SECONDS:
        return _filter_for_runtime(_cache, runtime)

    url = f"{STOREFRONT_URL}{TOOLS_PATH}"
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=_headers()) as resp:
                if resp.status != 200:
                    logger.error("Реестр инструментов недоступен: витрина ответила %s", resp.status)
                    return _filter_for_runtime(_cache, runtime)
                data = await resp.json()
    except Exception as exc:
        logger.error("Реестр инструментов недоступен: %s", exc)
        return _filter_for_runtime(_cache, runtime)

    tools = data.get("tools") or []
    if tools:
        _cache = tools
        _cache_ts = time.monotonic()
        logger.info("Реестр инструментов обновлён: %d определений", len(tools))
    else:
        logger.warning("Витрина вернула пустой реестр инструментов")

    return _filter_for_runtime(_cache, runtime)


def _filter_for_runtime(tools: list[dict[str, Any]], runtime: str) -> list[dict[str, Any]]:
    """Отфильтровать инструменты по рантайму и вернуть в формате OpenAI.

    Изменяющие инструменты (kind == "write") в Telegram НЕ отдаются модели.
    Причина не в осторожности, а в главном правиле системы: действие,
    меняющее данные, никогда не выполняется само. В админке это обеспечено
    подписанными предложениями — карточка «было → стало» и кнопка
    «Выполнить». В Telegram такого пути пока нет, поэтому витрина отвечает
    на них 403, и предлагать их модели значит обещать невыполнимое:
    владелец услышал бы «сейчас подниму цену», а в базе ничего бы не
    изменилось.

    Когда в Telegram появится подтверждение (подписанный токен предложения
    + inline-кнопки aiogram), фильтр снимается здесь и в
    apps/web/src/app/api/admin/stepan/tools/execute/route.ts — в двух
    местах сразу, не по отдельности.
    """
    result = []
    for t in tools:
        runtimes = t.get("runtimes") or []
        if runtime not in runtimes:
            continue
        if runtime == "tg" and (t.get("kind") == "write" or t.get("risky")):
            continue
        result.append({
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("parameters", {"type": "object", "properties": {}}),
            },
        })
    return result


async def execute_remote(tool_name: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Исполнить инструмент удалённо через витрину.

    Для инструментов, реализованных на стороне витрины (Prisma-запросы).
    Инструменты с нативной реализацией в Python (create_task, roll_call и др.)
    исполняются локально — их сюда отправлять не нужно.

    Возвращает: {"status": "ok", "result": ...} или {"status": "error", "error": "..."}
    """
    url = f"{STOREFRONT_URL}{EXECUTE_PATH}"
    payload = {"tool": tool_name, "params": params or {}}

    try:
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=_headers(), json=payload) as resp:
                data = await resp.json()
                if resp.status != 200:
                    error = data.get("error", f"витрина ответила {resp.status}")
                    logger.error("Инструмент %s не исполнен удалённо: %s", tool_name, error)
                    return {"status": "error", "error": error}
                return data
    except Exception as exc:
        logger.error("Удалённый вызов %s не удался: %s", tool_name, exc)
        return {"status": "error", "error": str(exc)}


def is_native(tool_name: str) -> bool:
    """Инструмент имеет нативную реализацию в Python (не нужен удалённый вызов).

    Эти инструменты обрабатываются в assistant.py напрямую через
    _handle_task, _register_sale, _show_publications и т.д.
    """
    return tool_name in _NATIVE_TOOLS


# Инструменты с нативной реализацией на Python-стороне.
# Остальные исполняются удалённо через execute_remote().
_NATIVE_TOOLS = frozenset({
    "create_task",
    "roll_call",
    "get_report",
    "query_db",
    "show_published_post",
    "get_content_status",
    "register_sale",
    "add_product",
})
