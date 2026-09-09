"""Трансляция геопозиции полевого сотрудника.

ЗАЧЕМ. Отметка визита подтверждала ОДИН момент — тот, когда нажали кнопку.
На вопросы «где был весь день», «сколько простоял» и «сколько ехал между
точками» ответить было нечем: между отметками день оставался пустым.

ПОЧЕМУ TELEGRAM, А НЕ БРАУЗЕР. Трансляция геопозиции работает в фоне и при
заблокированном экране, одинаково на iOS и Android, и ничего не требует
устанавливать. Браузерная геолокация во вкладке в фоне глохнет — на iOS
почти сразу, — и обещать по ней целый день нельзя.

СОГЛАСИЕ — ДЕЙСТВИЕМ. Трансляцию включает сам сотрудник, из своего
телефона, и Telegram всё время показывает ему, что она идёт. Молчаливого
сбора здесь нет и быть не может: это личные данные, и включённой по
умолчанию слежки мы не делаем.
"""

import logging
from typing import Optional

from aiogram import F, Router
from aiogram.types import Message

from shared.field_track import make_ping, send_pings

logger = logging.getLogger(__name__)

router = Router()


def _accuracy(location) -> Optional[float]:  # type: ignore[no-untyped-def]
    """Точность в метрах, если Telegram её сообщил.

    Отсутствие точности — это «неизвестно», а не «идеально»: подставлять
    сюда ноль значит выдать грубый замер за точный ровно там, где по нему
    судят о человеке.
    """
    value = getattr(location, "horizontal_accuracy", None)
    return float(value) if isinstance(value, (int, float)) else None


def _heading(location) -> Optional[int]:  # type: ignore[no-untyped-def]
    value = getattr(location, "heading", None)
    return int(value) if isinstance(value, (int, float)) else None


async def _forward(message: Message) -> None:
    """Переслать одну точку в витрину.

    По одной, а не пачкой: Telegram сам присылает обновление раз в минуту и
    сам копит их, пока телефон офлайн, — накапливать второй раз на нашей
    стороне значит держать очередь, которая переживёт перезапуск бота хуже,
    чем очередь Telegram.
    """
    location = message.location
    if location is None or message.from_user is None:
        return

    ping = make_ping(
        at_ms=int(message.date.timestamp() * 1000),
        latitude=location.latitude,
        longitude=location.longitude,
        accuracy_m=_accuracy(location),
        heading_deg=_heading(location),
    )
    await send_pings(message.from_user.id, [ping])


@router.message(F.location)
async def live_location_started(message: Message) -> None:
    """Первая точка трансляции — и одиночная булавка тоже.

    Одиночную булавку от трансляции отличает `live_period`. Записываем обе:
    сотрудник, приславший точку вручную, сообщает ровно то же самое — где
    он сейчас. Но подтверждаем ответом только трансляцию, потому что
    только она продолжится сама.
    """
    if message.location is None:
        return

    await _forward(message)

    live = getattr(message.location, "live_period", None)
    if not live:
        await message.answer(
            "📍 Точка записана.\n\n"
            "Чтобы день собрался целиком, включите <b>трансляцию</b> "
            "геопозиции: скрепка → Геопозиция → «Транслировать».",
        )
        return

    hours = max(1, int(live) // 3600)
    await message.answer(
        f"🛰 Трансляция включена на {hours} ч. Смена пишется.\n\n"
        "Выключить можно в любой момент — в том же сообщении с картой, "
        "кнопкой «Остановить».",
    )


@router.edited_message(F.location)
async def live_location_moved(message: Message) -> None:
    """Обновление трансляции.

    Telegram присылает их правкой ТОГО ЖЕ сообщения, а не новым, — поэтому
    без этого обработчика в базу попадала бы одна первая точка за смену, и
    выглядело бы это как «сотрудник весь день простоял у себя во дворе».
    Ничего не отвечаем: раз в минуту писать в чат — это спам.
    """
    await _forward(message)
