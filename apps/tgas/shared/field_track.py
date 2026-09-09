"""Мост в витрину: крошки трека полевого сотрудника.

ПОЧЕМУ ЧЕРЕЗ HTTP, А НЕ СЫРЫМ SQL. Трек живёт рядом с картой клиентов,
отметками визитов и стоянками — а это витрина: `apps/web` владеет и схемой,
и экраном, на котором день собирается воедино. Офис пишет сюда так же, как
пишет заказы, — одной дверью через API. Второй двери нет намеренно: она
разъехалась бы с первой ровно там, где считаются метры.

Устроено как `storefront_orders.py` и по тем же причинам: тот же общий
секрет, те же два заголовка (витрина принимает оба), тот же базовый URL.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_API_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")

# Сколько ждём витрину. Трек — не срочный груз: не дошло сейчас, дойдёт
# со следующей пачкой, а висеть в обработчике Telegram нельзя.
TIMEOUT_SEC = 10


def _headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if BOT_SECRET:
        headers["x-bot-secret"] = BOT_SECRET
        headers["Authorization"] = f"Bearer {BOT_SECRET}"
    return headers


def _url(path: str) -> str:
    return f"{STOREFRONT_API_URL.rstrip('/')}{path}"


def make_ping(
    *,
    at_ms: int,
    latitude: float,
    longitude: float,
    accuracy_m: Optional[float] = None,
    heading_deg: Optional[int] = None,
) -> Dict[str, Any]:
    """Одна крошка в том виде, в каком её ждёт витрина.

    Скорость Telegram не сообщает, и мы её НЕ ВЫЧИСЛЯЕМ: посчитанная по
    двум точкам, она врёт после каждой паузы трансляции — «ехал 200 км/ч»
    там, где телефон просто молчал десять минут.
    """
    return {
        "at": at_ms,
        "latitude": latitude,
        "longitude": longitude,
        "accuracyM": accuracy_m,
        "headingDeg": heading_deg,
        "source": "telegram_live",
    }


async def who_is_silent() -> List[Dict[str, Any]]:
    """Кто сегодня не на связи — по данным витрины.

    Витрина отвечает фактом: когда была последняя крошка. Решение —
    писать человеку или нет — принимает бот: у него расписание и рабочие
    часы, а у роута их нет и быть не должно.

    Пустой список при любой ошибке: сторож, который падает, хуже
    сторожа, который промолчал один раз.
    """
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.get(_url("/admin/tracking/silent")) as resp:
                if resp.status != 200:
                    logger.warning("FIELD_TRACK: сводка молчания недоступна (%s)", resp.status)
                    return []
                body = await resp.json()
                people = body.get("people") or []
                return [p for p in people if isinstance(p, dict)]
    except Exception as exc:
        logger.warning("FIELD_TRACK: сводка молчания не получена (%s)", exc)
        return []


async def send_pings(telegram_id: int, pings: List[Dict[str, Any]]) -> bool:
    """Отправить пачку крошек. True — витрина приняла.

    Ошибку НЕ поднимаем: обработчик Telegram не должен падать из-за того,
    что витрина перезапускается. Не дошло — вернём False, и вызывающий сам
    решит, копить дальше или молчать.
    """
    if not pings:
        return True

    payload = {"telegramId": str(telegram_id), "pings": pings}
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.post(_url("/admin/tracking/ping"), json=payload) as resp:
                if resp.status == 200:
                    return True
                body = await resp.text()
                # 403 — сотрудника нет или он уволен. Это не сбой связи, и
                # повторять пачку бессмысленно: пишем громко, чтобы было
                # видно, что человек шлёт трансляцию впустую.
                logger.warning(
                    "FIELD_TRACK: витрина отклонила пачку (%s): %s", resp.status, body[:200]
                )
                return False
    except Exception as exc:  # сеть, таймаут, витрина в перезапуске
        logger.warning("FIELD_TRACK: не отправлено (%s)", exc)
        return False
