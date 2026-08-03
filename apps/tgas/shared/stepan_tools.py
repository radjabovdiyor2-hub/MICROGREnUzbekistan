"""
🔧 НАБОР ИНСТРУМЕНТОВ СТЁПАНА — два владельца, ни одного пересечения.
======================================================================

У Стёпана инструменты из двух источников, и у каждого имени ровно один хозяин:

    Витрина (apps/web/src/lib/stepan/*.ts) — то, что меняет данные Prisma,
        принадлежащие вебу: цена товара, настройки, расписания ботов,
        обучение ИИ, остатки магазина. Исполняется удалённо через
        POST /api/admin/stepan/tools/execute, изменяющее — только после
        подтверждения подписанным токеном.

    Офис (apps/tgas/shared/tools/) — CRM и действия офиса: продажа, прайс,
        задачи, отчёты, финансы, склад, контент. Исполняется в процессе.

ПОЧЕМУ ЭТО ВАЖНО

Когда отделы получили собственный реестр, 12 из 24 имён оказались реализованы
дважды — и отвечали по-разному. Скажем, `get_content_status` в Python читал
таблицу публикаций, а на вебе шёл по шине в контент-бота: один и тот же вопрос
давал разные ответы в зависимости от того, кто спросил. Поэтому `load_registry`
склеивает оба источника с приоритетом офиса: если офис умеет — берём офис,
удалённая копия того же имени в набор не попадает.

Паттерн связи с витриной: тот же, что в assistant_memory.py и owner_alerts.py —
STOREFRONT_API_URL + x-bot-secret.

Кеширование: определения витрины обновляются раз в 10 минут. При её
недоступности бот работает с закешированной версией; офисные инструменты
доступны всегда, потому что живут в этом же процессе.
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
    """Полный набор инструментов Стёпана: офисные + удалённые с витрины.

    Возвращает список в формате OpenAI function-calling. Имя, которое умеет
    офис, берётся из офиса; удалённый двойник того же имени отбрасывается,
    иначе модель получила бы два разных описания одного инструмента.
    """
    from shared import tools as tool_registry
    from shared.tools.registry import CHIEF_DEPARTMENT

    office = tool_registry.schemas_for(CHIEF_DEPARTMENT)
    office_names = {schema["function"]["name"] for schema in office}
    remote = await _load_remote(runtime)
    return office + [
        r for r in remote if r["function"]["name"] not in office_names
    ]


async def _load_remote(runtime: str = "tg") -> list[dict[str, Any]]:
    """Определения инструментов витрины. При ошибке — кеш или пустой список."""
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
                    logger.error(
                        "Реестр инструментов недоступен: витрина ответила %s",
                        resp.status,
                    )
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


def _filter_for_runtime(
    tools: list[dict[str, Any]], runtime: str
) -> list[dict[str, Any]]:
    """Отфильтровать инструменты по рантайму и вернуть в формате OpenAI.

    Изменяющие инструменты модели отдаются, но сами по себе не выполняются:
    витрина возвращает на них status="confirm" с подписанным предложением,
    бот показывает карточку «было → стало» с кнопками, и только нажатие
    владельца отправляет токен на исполнение. Правило системы соблюдено —
    действие, меняющее данные, никогда не выполняется само.
    """
    result = []
    for t in tools:
        runtimes = t.get("runtimes") or []
        if runtime not in runtimes:
            continue
        result.append(
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t.get(
                        "parameters", {"type": "object", "properties": {}}
                    ),
                },
            }
        )
    return result


async def execute_remote(
    tool_name: str, params: Optional[dict[str, Any]] = None
) -> dict[str, Any]:
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
                    logger.error(
                        "Инструмент %s не исполнен удалённо: %s", tool_name, error
                    )
                    return {"status": "error", "error": error}
                return data
    except Exception as exc:
        logger.error("Удалённый вызов %s не удался: %s", tool_name, exc)
        return {"status": "error", "error": str(exc)}


def is_native(tool_name: str) -> bool:
    """Инструмент исполняется в процессе, а не удалённо на витрине.

    Раньше здесь лежал руками поддерживаемый frozenset из восьми имён, который
    должен был совпадать с цепочкой `elif` в assistant.py — и совпадал только
    до следующей правки. Теперь ответ даёт сам реестр офиса: инструмент
    нативный тогда и только тогда, когда офис его реализует.
    """
    from shared import tools as tool_registry

    return tool_registry.by_name(tool_name) is not None


async def confirm_remote(token: str) -> dict[str, Any]:
    """Подтвердить ранее предложенное действие.

    Отправляет подписанный токен в /admin/stepan/execute — тот же роут, что
    жмёт кнопка в веб-админке. Витрина проверит подпись и срок (15 минут) и
    выполнит ровно то, что было показано владельцу, а не то, что пришло в
    запросе: в этом и смысл подписи.
    """
    url = f"{STOREFRONT_URL}/admin/stepan/execute"
    try:
        timeout = aiohttp.ClientTimeout(total=120)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                url, headers=_headers(), json={"token": token}
            ) as resp:
                data = await resp.json()
                if resp.status != 200:
                    return {
                        "ok": False,
                        "error": data.get("error", f"витрина ответила {resp.status}"),
                    }
                return {"ok": True, "message": data.get("message") or "Выполнено"}
    except Exception as exc:
        logger.error("Подтверждение не удалось: %s", exc)
        return {"ok": False, "error": str(exc)}
