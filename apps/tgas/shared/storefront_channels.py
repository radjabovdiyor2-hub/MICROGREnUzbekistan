"""
🛒 КАНАЛЫ ПРОДАЖ — толчок синхронизации со стороны офиса
==========================================================
Витрина считает, что площадка должна показывать, и складывает разницу в
очередь (`channel_outbox`). Толкать очередь некому: планировщика на
витрине нет вовсе, он живёт здесь (`BotScheduler`) — ровно та же причина,
по которой отсюда разбирается очередь зеркала (`drain_office_queue`).

ПОЧЕМУ ЧАСТО

Между «лоток кончился» и снятием карточки на площадке стоит ровно один
интервал этого вызова. Для скоропорта это и есть цена ошибки: заказ на
товар, которого нет, отменяется, а отмена у маркетплейса стоит процентов
от суммы и рейтинга магазина.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_API_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
SYNC_PATH = "/channels/cron/sync"
TIMEOUT_SECONDS = 30


def _headers() -> Dict[str, str]:
    secret = os.getenv("BOT_SECRET", "")
    headers: Dict[str, str] = {}
    if secret:
        headers["x-bot-secret"] = secret
        headers["Authorization"] = f"Bearer {secret}"
    return headers


async def sync_channels() -> Dict[str, Any]:
    """Попросить витрину пересчитать остатки каналов и разобрать очередь.

    Код ответа проверяем отдельно от тела: при 401 (разошёлся BOT_SECRET)
    строка лога выглядела бы точно так же, как при успехе, — и площадка
    молча торговала бы вчерашними остатками.
    """
    url = f"{STOREFRONT_API_URL.rstrip('/')}{SYNC_PATH}"
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=_headers()) as resp:
                if resp.status != 200:
                    body = (await resp.text())[:200]
                    logger.warning(
                        "КАНАЛЫ: синхронизация не прошла — витрина ответила %s (%s)",
                        resp.status,
                        body,
                    )
                    return {"ok": False, "status": resp.status}
                data = await resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("КАНАЛЫ: витрина недоступна: %s", exc)
        return {"ok": False, "error": str(exc)}

    # Пишем в лог только когда что-то произошло: тихий прогон каждые пять
    # минут превратил бы журнал в шум, в котором не видно настоящего.
    if data.get("sent") or data.get("waitingForHuman"):
        logger.info(
            "КАНАЛЫ: отправлено %s, ждёт выгрузки руками %s, в очереди %s",
            data.get("sent"),
            data.get("waitingForHuman"),
            data.get("pending"),
        )
    return {"ok": True, **data}


def describe_stalled(stalled: List[Dict[str, Any]]) -> str:
    """Список застрявших каналов — текстом для владельца.

    Причину печатаем дословно, как её вернула витрина: «у канала не задан
    адрес приёма» и «площадка не отвечает» чинятся по-разному, и общее
    слово «ошибка» заставило бы владельца открывать экран, чтобы узнать
    то, что уже известно.
    """
    lines = []
    for item in stalled:
        reason = item.get("reason") or "причина не записана"
        lines.append(
            "• {channel}: {rows} позиций, стоит {hours} ч — {reason}".format(
                channel=item.get("channel", "?"),
                rows=item.get("rows", 0),
                hours=item.get("hours", 0),
                reason=reason,
            )
        )
    return "\n".join(lines)
