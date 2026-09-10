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


async def summarize_day() -> int:
    """Попросить витрину подвести итоги дня и положить сигналы владельцу.

    Возвращает, сколько сигналов записано. Проход защищён от повтора на
    стороне витрины: сигнал пишется раз на пару «день + человек».
    """
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.post(_url("/admin/visit-plans/summarize"), json={}) as resp:
                if resp.status != 200:
                    logger.warning("FIELD_TRACK: итоги дня не подведены (%s)", resp.status)
                    return 0
                body = await resp.json(content_type=None)
                return int(body.get("written") or 0) if isinstance(body, dict) else 0
    except Exception as exc:
        logger.warning("FIELD_TRACK: итоги дня не подведены (%s)", exc)
        return 0


async def route_accept(telegram_id: int, route_id: Optional[str] = None) -> Dict[str, Any]:
    """Подтвердить «Приступить» по рейсу доставки.

    Устроено как подтверждение объезда: номер из кнопки, если он есть, иначе
    витрина найдёт сегодняшний рейс сама — и в обоих случаях проверит, что
    рейс действительно этого водителя.
    """
    payload: Dict[str, Any] = {"telegramId": str(telegram_id)}
    if route_id:
        payload["routeId"] = route_id

    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.post(_url("/admin/deliveries/accept"), json=payload) as resp:
                body = await resp.json(content_type=None)
                if resp.status == 200:
                    return {"ok": True, **(body if isinstance(body, dict) else {})}
                message = str(body.get("error") or "") if isinstance(body, dict) else ""
                return {"ok": False, "error": message or f"HTTP {resp.status}"}
    except Exception as exc:
        logger.warning("FIELD_TRACK: подтверждение рейса не прошло (%s)", exc)
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


async def pull_farm_frame() -> str:
    """Попросить витрину снять кадр с камеры теплицы через облако EZVIZ.

    Возвращает состояние словом: "ok" — кадр снят и лежит, "skipped" —
    интеграция не настроена, "failed" — не сняли (чаще всего камера
    выключена).

    ЗАЧЕМ ЭТО ЗДЕСЬ. У витрины нет своего планировщика, а у ботов он есть
    и уже ходит в те же двери за сводками. Заводить ради снимка второй
    механизм расписаний незачем.

    ТРЕВОГИ ЗДЕСЬ НЕТ НАМЕРЕННО. Камера, выключенная на ночь, — обычное
    дело, а не поломка: блок на сайте просто гаснет до утра. Сигнал
    владельцу на каждый такой случай превратился бы в шум, который
    перестают читать вместе с настоящими.
    """
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.post(_url("/farm/pull"), json={}) as resp:
                if resp.status != 200:
                    logger.warning("FARM: кадр не снят (%s)", resp.status)
                    return "failed"
                body = await resp.json(content_type=None)
                if not isinstance(body, dict):
                    return "failed"
                state = str(body.get("status") or "failed")
                if state == "failed":
                    logger.info("FARM: кадр не снят — %s", body.get("reason") or "без причины")
                return state
    except Exception as exc:
        logger.warning("FARM: кадр не снят (%s)", exc)
        return "failed"


async def shift_state(telegram_id: int) -> Optional[Dict[str, Any]]:
    """Открыта ли смена у этого человека.

    `None` — витрина не ответила. НЕ «закрыта»: подменять неизвестность
    отрицанием значит показать человеку кнопку «начал», когда смена уже
    идёт, и завести путаницу там, где её не было.
    """
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.get(
                _url("/shift"), params={"telegramId": str(telegram_id)}
            ) as resp:
                if resp.status != 200:
                    logger.warning("SHIFT: состояние не получено (%s)", resp.status)
                    return None
                body = await resp.json(content_type=None)
                return body if isinstance(body, dict) else None
    except Exception as exc:
        logger.warning("SHIFT: состояние не получено (%s)", exc)
        return None


async def shift_change(telegram_id: int, action: str) -> Optional[Dict[str, Any]]:
    """Открыть или закрыть смену. `action` — "open" или "close".

    `via="bot"` уходит на витрину намеренно: смену открывают из трёх мест,
    и когда две из них поспорят о времени, разбирать будет нечем.
    """
    payload = {"action": action, "via": "bot", "telegramId": str(telegram_id)}
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.post(_url("/shift"), json=payload) as resp:
                if resp.status != 200:
                    logger.warning("SHIFT: %s не выполнено (%s)", action, resp.status)
                    return None
                body = await resp.json(content_type=None)
                return body if isinstance(body, dict) else None
    except Exception as exc:
        logger.warning("SHIFT: %s не выполнено (%s)", action, exc)
        return None


async def close_forgotten_shifts() -> int:
    """Закрыть смены, которые человек забыл закрыть.

    Возвращает, сколько смен закрыто. Витрина ставит конец по последней
    точке трека и помечает такое закрытие как автоматическое: время,
    поставленное автоматом, — повод спросить, а не установленный факт.

    Повтор безопасен: закрытая смена под условие уже не подходит.
    """
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.post(_url("/admin/shifts/close-forgotten"), json={}) as resp:
                if resp.status != 200:
                    logger.warning("SHIFT: забытые смены не закрыты (%s)", resp.status)
                    return 0
                body = await resp.json(content_type=None)
                return int(body.get("closed") or 0) if isinstance(body, dict) else 0
    except Exception as exc:
        logger.warning("SHIFT: забытые смены не закрыты (%s)", exc)
        return 0


#: Порог молчания на случай, если витрина его не назвала.
#:
#: Своего числа у офиса быть не должно: с какой минуты человек «молчит»,
#: решает витрина и говорит это полем `silentAfterMin` — тем же числом
#: гаснет точка на карте. Эта константа работает ровно в одном случае:
#: витрина старее ответа с полем. Разъехаться с ней она не успеет, потому
#: что живёт одним прогоном.
SILENT_MIN_FALLBACK = 15


async def who_is_in_field() -> tuple[List[Dict[str, Any]], int]:
    """Кто сейчас в поле и с какой минуты считать человека замолчавшим.

    Тот же живой слой, что рисует карту у владельца. Берём его, а не
    считаем заново: два места, отвечающие на один вопрос, разойдутся на
    первой же правке — и владелец увидит на карте одно, а в боте другое.
    По той же причине отсюда возвращается и ПОРОГ: он приходит вместе с
    людьми, а не хранится второй копией в боте.

    Пустой список при любой ошибке.
    """
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.get(_url("/admin/tracking/live")) as resp:
                if resp.status != 200:
                    logger.warning("FIELD_TRACK: живой слой недоступен (%s)", resp.status)
                    return [], SILENT_MIN_FALLBACK
                body = await resp.json(content_type=None)
                if not isinstance(body, dict):
                    return [], SILENT_MIN_FALLBACK
                people = [p for p in (body.get("people") or []) if isinstance(p, dict)]
                threshold = body.get("silentAfterMin")
                if not isinstance(threshold, int) or threshold <= 0:
                    threshold = SILENT_MIN_FALLBACK
                return people, threshold
    except Exception as exc:
        logger.warning("FIELD_TRACK: живой слой не получен (%s)", exc)
        return [], SILENT_MIN_FALLBACK
