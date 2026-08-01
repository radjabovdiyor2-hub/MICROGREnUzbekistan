"""
🧠 ОБЩАЯ ПАМЯТЬ АССИСТЕНТА — клиент витрины из ИИ-офиса.
========================================================

Разговор владельца со Стёпаном хранится один на все каналы. Раньше история
жила отдельно в каждом: в админке — в состоянии React-компонента, здесь —
в FSM-состоянии aiogram. Начатый голосом разговор не был виден в вебе, и
наоборот.

Хранилище объявлено в schema.prisma и принадлежит витрине: конституция
называет Prisma единственным владельцем DDL. Прямой SQL отсюда запрещён —
связь между модулями только по HTTP, поэтому ходим в admin-роут витрины
и авторизуемся тем же BOT_SECRET, которым Стёпан уже вызывает журнальные
кроны.

ВАЖНО про адрес: берём его из настройки, а не из '127.0.0.1'. Внутри
контейнера бота витрины по локальному адресу нет — она отдельный сервис в
сети mg_net. Журнальные кроны Стёпана как раз повторяют эту ошибку и в
проде молча отказывают.
"""

import logging
import os
from typing import Any, Optional

import aiohttp

logger = logging.getLogger(__name__)

#: Адрес витрины внутри docker-сети. Тот же образец, что в sales_bot.
STOREFRONT_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api").rstrip("/")

MEMORY_PATH = "/admin/stepan/memory"
TIMEOUT_SECONDS = 8


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "x-bot-secret": os.getenv("BOT_SECRET", ""),
    }


async def load_context(limit: int = 20) -> list[dict[str, str]]:
    """Хвост общей истории в виде [{role, content}, ...].

    При недоступности хранилища возвращает пустой список — вызывающий
    обязан предупредить владельца, что отвечает без памяти, а не делать
    вид, что контекста и не было.
    """
    url = f"{STOREFRONT_URL}{MEMORY_PATH}"
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=_headers()) as resp:
                if resp.status != 200:
                    logger.error("Память недоступна: витрина ответила %s", resp.status)
                    return []
                data = await resp.json()
    except Exception as exc:
        logger.error("Память недоступна: %s", exc)
        return []

    messages = data.get("messages") or []
    return [
        {"role": m.get("role", "user"), "content": m.get("content", "")}
        for m in messages[-limit:]
        if m.get("content")
    ]


async def append(role: str, content: str, tool_calls: Optional[Any] = None) -> bool:
    """Дописать реплику в общую нить. Возвращает True, если записалось."""
    if not content:
        return False

    url = f"{STOREFRONT_URL}{MEMORY_PATH}"
    payload: dict[str, Any] = {
        "role": role,
        "content": content[:8000],
        "channel": "telegram",
    }
    if tool_calls:
        payload["toolCalls"] = tool_calls

    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=_headers(), json=payload) as resp:
                if resp.status != 200:
                    logger.error(
                        "Реплика не сохранена: витрина ответила %s", resp.status
                    )
                    return False
                return True
    except Exception as exc:
        logger.error("Реплика не сохранена: %s", exc)
        return False
