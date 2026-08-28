"""
💬 CHAT MEMORY — короткая память разговора для любого бота
==========================================================
Память была только у Стёпана, и то одна нить на владельца
(`shared/assistant_memory` — общая с веб-админкой). У остальных
одиннадцати ботов истории не было вовсе: каждое сообщение в группе
обрабатывалось как первое в жизни. «А почему?» после их же ответа
приходило к модели без того ответа — отвечать на это нечем, и получалось
то самое «бот не понимает, о чём речь».

Здесь память ровно та, которой не хватало: последние реплики ОДНОГО ЧАТА,
общие для всех ботов, в Redis. Не хранилище истины, а короткий контекст:
сутки жизни, десяток реплик, ключ на бота и чат.

ПОЧЕМУ REDIS, А НЕ СЛОВАРЬ В ПРОЦЕССЕ

Именно так это было сделано у витринного бота (`apps/bot/handlers/agronomist.py`:
`conversation_history: dict[int, list]`), и каждый деплой — то есть каждый push
в main — обнулял все диалоги. Redis в проекте уже есть и уже переживает
рестарты: в нём FSM-состояния aiogram и незакрытые заявки на продажу.

ЧЕГО ЗДЕСЬ НЕТ

Ни владельца, ни ключей, ни модели: это только хранилище. Кто и что кладёт
в контекст — решает бот.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Awaitable, Dict, List, Optional, Union, cast

import redis.asyncio as redis

from shared.config import settings

logger = logging.getLogger(__name__)

#: Сколько реплик держим. Десять — это пять обменов: достаточно, чтобы понять
#: «а почему?» и «сделай так же», и мало, чтобы не таскать в каждый запрос
#: полотно, которое стоит токенов.
MAX_TURNS = 10

#: Сутки. Разговор, к которому не возвращались день, продолжением не считается —
#: приклеенный к новому вопросу, он путает сильнее, чем помогает.
TTL_SECONDS = 86_400


def _key(bot_name: str, chat_id: Union[int, str]) -> str:
    """
    Ключ разговора. Идентификатор чата — не только телеграмный.

    Раньше здесь стояло `int(chat_id)`: Telegram даёт число, и приведение
    выглядело безобидным. Instagram даёт IGSID строкой, и на нём это
    падало бы — поэтому берём строковую форму.

    Приводить числовые строки обратно к `int` НЕ нужно, и это проверено:
    `str(123)` и `str(int("123"))` дают одно и то же. Лишнее приведение
    только меняло бы ключ у идентификатора с ведущим нулём.
    """
    return f"chat:hist:{bot_name}:{str(chat_id).strip()}"


def _client() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


async def load(bot_name: str, chat_id: Union[int, str], limit: int = MAX_TURNS) -> List[Dict[str, str]]:
    """Последние реплики чата в виде [{role, content}, ...].

    Пустой список и при пустой истории, и при недоступном Redis: короткий
    контекст — украшение ответа, а не его условие, и падать из-за него нельзя.
    Недоступность видна в логе.
    """
    client = _client()
    try:
        # `cast` вместо подавления: у redis-py один класс на синхронный и
        # асинхронный клиент, поэтому в типах `lrange` объявлен как
        # «список ИЛИ ожидаемое». Клиент здесь асинхронный — `redis.asyncio`
        # в импортах, — и вторая половина союза недостижима.
        raw = await cast(Awaitable[List[Any]], client.lrange(_key(bot_name, chat_id), -limit, -1))
    except Exception as exc:
        logger.warning("CHAT_MEMORY: история недоступна (%s)", exc)
        return []
    finally:
        await client.aclose()

    out: List[Dict[str, str]] = []
    for item in raw:
        try:
            entry = json.loads(item)
        except (json.JSONDecodeError, TypeError):
            continue
        if entry.get("content"):
            out.append(
                {
                    "role": "assistant" if entry.get("role") == "assistant" else "user",
                    "content": str(entry["content"]),
                }
            )
    return out


async def remember(
    bot_name: str,
    chat_id: Union[int, str],
    user_text: str,
    assistant_text: str,
    limit: int = MAX_TURNS,
) -> None:
    """Дописать обмен «вопрос → ответ» и обрезать хвост.

    Обе реплики пишутся одной транзакцией: половина обмена в истории хуже
    целого отсутствия — модель видит вопрос без ответа и отвечает второй раз.
    """
    entries = [
        json.dumps({"role": "user", "content": str(user_text or "")[:4000]}, ensure_ascii=False),
        json.dumps(
            {"role": "assistant", "content": str(assistant_text or "")[:4000]},
            ensure_ascii=False,
        ),
    ]
    key = _key(bot_name, chat_id)
    client = _client()
    try:
        pipe = client.pipeline()
        pipe.rpush(key, *entries)
        pipe.ltrim(key, -limit, -1)
        pipe.expire(key, TTL_SECONDS)
        await pipe.execute()
    except Exception as exc:
        logger.warning("CHAT_MEMORY: не смог записать историю (%s)", exc)
    finally:
        await client.aclose()


async def forget(bot_name: str, chat_id: Union[int, str]) -> None:
    """Забыть разговор — «начнём заново» должно что-то менять."""
    client = _client()
    try:
        await client.delete(_key(bot_name, chat_id))
    except Exception as exc:
        logger.warning("CHAT_MEMORY: не смог очистить историю (%s)", exc)
    finally:
        await client.aclose()


def quoted_reply(message: Any) -> Optional[str]:
    """Текст сообщения, на которое ответили свайпом вправо. None — не реплай.

    Живёт здесь, а не в обработчике каждого бота: реплай — это адрес реплики,
    и понимать его должны все одинаково.
    """
    quoted = getattr(message, "reply_to_message", None)
    if quoted is None:
        return None
    body = (getattr(quoted, "text", None) or getattr(quoted, "caption", None) or "").strip()
    return body[:600] or None
