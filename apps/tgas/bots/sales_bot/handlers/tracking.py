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
from io import BytesIO
from typing import Optional

from aiogram import F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    CallbackQuery,
    Message,
)

from shared.field_track import (
    make_ping,
    plan_accept,
    send_pings,
    send_visit_photo,
    stay_finish,
    stay_start,
)

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
        "Приехали к клиенту — нажмите «Я на точке», и фото пойдут в отчёт "
        "по нему.\n"
        "Выключить трансляцию можно в любой момент — в том же сообщении "
        "с картой, кнопкой «Остановить».",
        reply_markup=_stay_keyboard(arrived=False),
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


@router.message(F.photo, F.chat.type == "private")
async def visit_photo(message: Message) -> None:
    """Фото с точки — в фотоотчёт владельцу.

    ЗАЧЕМ ЗДЕСЬ. Продавец шлёт боту трансляцию геопозиции — и туда же
    естественно шлёт кадр с точки. Раньше такое фото попадало в обработчик
    «рецепт из холодильника» и возвращалось рецептом, а владелец
    фотоотчёта не видел вовсе: снимать кадр надо было в админке, о чём
    никто не догадывался.

    ПРОВАЛИВАЕМСЯ ДАЛЬШЕ, ЕСЛИ ЧЕЛОВЕК НЕ НА ТОЧКЕ. `SkipHandler` отдаёт
    сообщение следующему обработчику — тому самому рецепту. Съесть чужое
    фото молча значило бы поломать то, что работало раньше: у бота продаж
    фото от клиента это законный сценарий.

    Стоянку выбирает СЕРВЕР по открытой отметке «я на точке». Поэтому
    порядок такой: сначала «я на точке» в админке, потом кадры сюда.
    """
    if message.photo is None or message.from_user is None:
        raise SkipHandler

    photo = message.photo[-1]
    try:
        file_info = await message.bot.get_file(photo.file_id)
        buffer = await message.bot.download_file(file_info.file_path, destination=BytesIO())
        image = buffer.read()
    except Exception as exc:
        logger.warning("VISIT_PHOTO: кадр не скачался (%s)", exc)
        raise SkipHandler

    outcome = await send_visit_photo(message.from_user.id, image)

    if outcome == "no_stay":
        raise SkipHandler

    if outcome == "ok":
        await message.answer(
            "📷 Фото добавлено в отчёт по точке.",
            reply_markup=_stay_keyboard(arrived=True),
        )
        return

    # Витрина недоступна. Молчать нельзя: человек снял кадр и ждёт, что он
    # дошёл, — а кадр не сохранился нигде.
    await message.answer(
        "⚠️ Фото не сохранилось — связь с сервером потерялась. Пришлите ещё раз."
    )


# ═══════════════════════════════════════════════════════════════════════
# Весь цикл точки — в одном чате
#
# ЗАЧЕМ. Отметка «я на точке» жила только в PWA админки, и цикл рвался
# посередине: продавец шлёт геопозицию в Telegram, шлёт туда же фото — а
# привязать кадр не к чему, потому что стоянку никто не открыл. Требовать
# ради одной кнопки открыть админку — значит требовать того, чего в поле
# не делают.
#
# КЛИЕНТА ВЫБИРАЕТ СЕРВЕР по последней крошке трека. В чате выбирать не из
# чего: списка заведений здесь нет, а присылать клиента телом запроса
# нельзя по той же причине, по какой расстояние до него считает сервер.
# Поэтому и ответ называет заведение — чтобы человек заметил, если сервер
# выбрал соседнее.
# ═══════════════════════════════════════════════════════════════════════

def _stay_keyboard(arrived: bool) -> InlineKeyboardMarkup:
    """Одна кнопка на состояние: приехал или уехал. Две сразу путают."""
    button = (
        InlineKeyboardButton(text="🚗 Уехал", callback_data="stay:out")
        if arrived
        else InlineKeyboardButton(text="📍 Я на точке", callback_data="stay:in")
    )
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


@router.callback_query(F.data == "stay:in")
async def stay_in(cb: CallbackQuery) -> None:
    if cb.from_user is None:
        await cb.answer()
        return

    result = await stay_start(cb.from_user.id)
    if not result.get("ok"):
        # Причину показываем дословно: «не вижу, где вы» — это руководство
        # к действию, а не сбой.
        await cb.answer(str(result.get("error") or "Не получилось"), show_alert=True)
        return

    who = result.get("customer") or "точка"
    await cb.answer()
    if cb.message is not None:
        await cb.message.answer(
            f"📍 Отмечено: <b>{who}</b>.\n\n"
            "Пришлите фото — оно уйдёт в отчёт по этой точке. "
            "Уезжаете — нажмите «Уехал».",
            reply_markup=_stay_keyboard(arrived=True),
        )


@router.callback_query(F.data == "stay:out")
async def stay_out(cb: CallbackQuery) -> None:
    if cb.from_user is None:
        await cb.answer()
        return

    result = await stay_finish(cb.from_user.id)
    if not result.get("ok"):
        await cb.answer(str(result.get("error") or "Не получилось"), show_alert=True)
        return

    minutes = int(result.get("dwellSec") or 0) // 60
    await cb.answer()
    if cb.message is not None:
        await cb.message.answer(
            f"🚗 Уехали. На точке — {minutes} мин.",
            reply_markup=_stay_keyboard(arrived=False),
        )


@router.callback_query(F.data.startswith("plan:accept:"))
async def plan_accept_pressed(cb: CallbackQuery) -> None:
    """«Приступить» под назначенным объездом.

    ПРОВЕРКА НЕ НА ВЛАДЕЛЬЦА. Все прочие callback-обработчики офиса
    (`approvals`, `task_ui`, диспетчер Стёпана) начинаются с `is_owner` и
    гонят остальных. Здесь так нельзя: жмёт как раз сотрудник. Кто он —
    решает витрина по `telegramId`, и она же проверяет, что объезд
    действительно его: кнопку можно переслать другому человеку.

    ЭТО ПОДТВЕРЖДЕНИЕ, А НЕ ШЛАГБАУМ. Не нажал — объезд всё равно его, и
    отметки визитов засчитываются. Связь в поле пропадает, а работа не ждёт.
    """
    if cb.from_user is None:
        await cb.answer()
        return

    raw = (cb.data or "").split(":")[-1]
    plan_id = int(raw) if raw.isdigit() else None

    result = await plan_accept(cb.from_user.id, plan_id)
    if not result.get("ok"):
        # Причину показываем дословно: «объезд не найден» и «связь
        # потерялась» лечатся по-разному, а общим «не получилось» человек
        # в поле распорядиться не может.
        await cb.answer(str(result.get("error") or "Не получилось"), show_alert=True)
        return

    stops = int(result.get("stops") or 0)
    if result.get("already"):
        await cb.answer("Уже подтверждено", show_alert=False)
        return

    await cb.answer("Принято")
    if cb.message is not None:
        await cb.message.answer(
            f"👍 Принято. Точек: {stops}.\n\n"
            "Приехали к первой — нажмите «Я на точке».",
            reply_markup=_stay_keyboard(arrived=False),
        )
