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
import time
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


async def whoami(telegram_id: int) -> Dict[str, Any]:
    """Сотрудник ли это и что у него на сегодня.

    Связка Telegram ↔ сотрудник живёт в витрине (`Employee.telegramId`), и
    держать её копию в офисе значило бы завести второй список штата,
    который разойдётся с первым.

    Не сотрудник — `{"staff": False}`, и это ОТВЕТ, а не ошибка:
    покупателей у бота на порядок больше.
    """
    return await _get(f"/admin/staff/me?telegramId={telegram_id}")


async def my_day(telegram_id: int) -> Dict[str, Any]:
    """Готовый текст «Мой день» и ссылка навигации.

    ТЕКСТ СОБИРАЕТ ВИТРИНА. Тот же список печатает уведомление о
    назначении; собери его бот вторыми руками — через месяц человек видел
    бы в сообщении один порядок точек, а в «Моём дне» другой.
    """
    return await _get(f"/admin/staff/day?telegramId={telegram_id}")


async def _get(path: str) -> Dict[str, Any]:
    """GET к витрине. Отказ — словарь с `error`, а не исключение."""
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.get(_url(path)) as resp:
                body = await resp.json(content_type=None)
                if resp.status == 200 and isinstance(body, dict):
                    return body
                message = str(body.get("error") or "") if isinstance(body, dict) else ""
                return {"error": message or f"HTTP {resp.status}"}
    except Exception as exc:
        logger.warning("FIELD_TRACK: запрос %s не прошёл (%s)", path, exc)
        return {"error": "связь с сервером потерялась"}


async def plan_accept(telegram_id: int, plan_id: Optional[int] = None) -> Dict[str, Any]:
    """Подтвердить «Приступить» по назначенному объезду.

    Номер плана берём из кнопки, если он есть; без него витрина найдёт
    сегодняшний объезд этого человека сама. Принадлежность плана она
    проверяет в любом случае: кнопку можно переслать, и без проверки чужой
    объезд подтвердил бы кто угодно из штата.

    Возвращает `{"ok": True, "already": bool, "stops": int}` либо
    `{"ok": False, "error": "..."}`.
    """
    payload: Dict[str, Any] = {"telegramId": str(telegram_id)}
    if plan_id is not None:
        payload["planId"] = plan_id

    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.post(_url("/admin/visit-plans/accept"), json=payload) as resp:
                body = await resp.json(content_type=None)
                if resp.status == 200:
                    return {"ok": True, **(body if isinstance(body, dict) else {})}
                message = str(body.get("error") or "") if isinstance(body, dict) else ""
                return {"ok": False, "error": message or f"HTTP {resp.status}"}
    except Exception as exc:
        logger.warning("FIELD_TRACK: подтверждение объезда не прошло (%s)", exc)
        return {"ok": False, "error": "связь с сервером потерялась"}


async def stay_start(telegram_id: int) -> Dict[str, Any]:
    """Отметить «я на точке». Клиента выбирает витрина по треку.

    Возвращает `{"ok": True, "customer": "Плов Центр"}` либо
    `{"ok": False, "error": "..."}`. Ошибку показываем дословно: «не вижу,
    где вы» — это не сбой, а руководство к действию, и подменять его общим
    «не получилось» значит оставить человека в поле гадать.
    """
    return await _stay_call("POST", telegram_id)


async def stay_finish(telegram_id: int) -> Dict[str, Any]:
    """Отметить «уехал». Закрывается единственная открытая стоянка."""
    return await _stay_call("PATCH", telegram_id)


async def _stay_call(method: str, telegram_id: int) -> Dict[str, Any]:
    payload = {"telegramId": str(telegram_id)}
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.request(
                method, _url("/admin/tracking/stay"), json=payload
            ) as resp:
                body = await resp.json(content_type=None)
                if resp.status == 200:
                    return {"ok": True, **(body if isinstance(body, dict) else {})}
                message = str(body.get("error") or "") if isinstance(body, dict) else ""
                return {"ok": False, "error": message or f"HTTP {resp.status}"}
    except Exception as exc:
        logger.warning("FIELD_TRACK: отметка стоянки не прошла (%s)", exc)
        return {"ok": False, "error": "связь с сервером потерялась"}


async def send_visit_photo(telegram_id: int, image: bytes, filename: str = "visit.jpg") -> str:
    """Отправить кадр как фотоотчёт с текущей стоянки.

    Возвращает:
      "ok"      — принят и привязан к стоянке;
      "no_stay" — человек сейчас не на точке (стоянка не открыта);
      "error"   — витрина недоступна или отказала.

    РАЗЛИЧАТЬ ПЕРВОЕ И ВТОРОЕ ОБЯЗАТЕЛЬНО. «Не на точке» — это не сбой: это
    обычное фото в переписке, и его должен разобрать следующий обработчик.
    Съесть его молча значило бы поломать то, что работало раньше.
    """
    form = aiohttp.FormData()
    form.add_field("file", image, filename=filename, content_type="image/jpeg")
    form.add_field("telegramId", str(telegram_id))
    form.add_field("takenAt", str(int(time.time() * 1000)))

    headers = {k: v for k, v in _headers().items() if k != "Content-Type"}
    try:
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
            async with session.post(_url("/admin/tracking/photo"), data=form) as resp:
                if resp.status == 200:
                    return "ok"
                if resp.status == 404:
                    return "no_stay"
                body = await resp.text()
                logger.warning(
                    "FIELD_TRACK: фото отклонено (%s): %s", resp.status, body[:200]
                )
                return "error"
    except Exception as exc:
        logger.warning("FIELD_TRACK: фото не отправлено (%s)", exc)
        return "error"


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
