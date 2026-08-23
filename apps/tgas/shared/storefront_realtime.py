"""
📡 «ЭКРАН, ОБНОВИСЬ» — сигнал открытым вкладкам админки
========================================================
Шины в проекте две, и они не знали друг о друге. Витрина публикует
изменения в свою SSE-шину (`apps/web/src/lib/realtime/bus.ts`), офис — в
Redis/HTTP свою (`shared/event_bus`). Пересечения не было ни одного.

Из-за этого задача, заведённая в Telegram, не обновляла открытую вкладку
«Задачи отделам»: владелец смотрел на список, в котором её нет, и узнавал
о ней перезагрузкой страницы. А тема `'bots'` на витрине была объявлена и
не публиковалась НИКЕМ — экран «Здоровье ботов» опрашивал сервер раз в две
минуты, потому что сказать ему было некому.

Летит только ИМЯ ТЕМЫ, не данные: клиент сам перезапросит тот срез, на
который у него есть право. Тот же контракт, что и внутри витрины.

Best-effort по устройству: недоступная витрина не должна ронять работу
бота. Но в лог это попадает — молчащий экран иначе не с чем связать.
"""

from __future__ import annotations

import logging
import os
from typing import Iterable

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api").rstrip("/")
REALTIME_PATH = "/admin/realtime"
TIMEOUT_SECONDS = 4

#: Темы, которые понимает витрина (`Topic` в lib/realtime/bus.ts).
#: Список продублирован намеренно: импорта между приложениями нет, а
#: опечатка иначе всплыла бы молчащим экраном. Сверяет `check_tools.py`.
TOPICS = frozenset(
    {"products", "orders", "inventory", "customers", "tasks", "growing", "bots"}
)


async def notify(*topics: str) -> bool:
    """Сказать открытым экранам, что срез изменился.

    Возвращает True, если витрина приняла. Неизвестные темы отбрасываются
    здесь, а не отправляются: витрина ответит 400, и разбираться придётся
    по логам вместо явной ошибки на месте.
    """
    known = [t for t in topics if t in TOPICS]
    unknown = [t for t in topics if t not in TOPICS]
    if unknown:
        logger.warning("REALTIME: неизвестные темы %s — не отправляю", ", ".join(unknown))
    if not known:
        return False

    headers = {
        "Content-Type": "application/json",
        "x-bot-secret": os.getenv("BOT_SECRET", ""),
    }

    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{STOREFRONT_URL}{REALTIME_PATH}", headers=headers, json={"topics": known}
            ) as resp:
                if resp.status != 200:
                    logger.warning(
                        "REALTIME: витрина ответила %s на темы %s",
                        resp.status,
                        ", ".join(known),
                    )
                    return False
                return True
    except Exception as exc:
        logger.warning("REALTIME: не сказал витрине про %s: %s", ", ".join(known), exc)
        return False


def notify_later(*topics: str) -> None:
    """Сигнал в фоне — когда ждать ответа незачем.

    Отдельная функция, а не `asyncio.create_task` на месте вызова: задача,
    созданная и потерянная без ссылки, в Python может быть собрана сборщиком
    мусора до выполнения. Здесь ссылка держится до завершения.
    """
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # Синхронный контекст — сигнал не критичен, пропускаем.
        logger.debug("REALTIME: нет цикла событий, сигнал пропущен")
        return

    task = loop.create_task(notify(*topics))
    _PENDING.add(task)
    task.add_done_callback(_PENDING.discard)


#: Живые задачи фоновых сигналов. Без этого множества сборщик мусора может
#: убрать задачу до того, как она выполнится.
_PENDING: set = set()


def known_topics() -> Iterable[str]:
    """Для сверок: какие темы этот мост умеет отправлять."""
    return sorted(TOPICS)
