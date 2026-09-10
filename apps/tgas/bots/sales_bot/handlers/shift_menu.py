"""
🕐 ПОСТОЯННАЯ КЛАВИАТУРА ПОЛЕВОГО СОТРУДНИКА

ЗАЧЕМ ОНА ПОЯВИЛАСЬ

Кнопка смены жила внутри «Моего дня», а рабочее меню было РАЗОВЫМ
сообщением: оно уходит вверх с перепиской, и через десяток сообщений
кнопок нет. Человек, который хотел открыть смену, должен был вспомнить
команду или прокрутить чат назад — то есть смену чаще не открывали вовсе.

Клавиатура под полем ввода не уезжает никуда. Она видна всегда, и открыть
смену — это одно нажатие в любой момент разговора.

ПОЧЕМУ ОСОЗНАННО, А НЕ АВТОМАТОМ. Владелец просил, чтобы сотрудник
НАЧИНАЛ смену сам. Автоматическое открытие по первой геопозиции выглядит
удобнее, но означает, что человек не решал начинать: он не знает, что его
пишут, и не может не начать. Кнопка — это согласие действием.

ЧЕГО БОТ НЕ МОЖЕТ И НЕ БУДЕТ ПРИТВОРЯТЬСЯ

Включить трансляцию геопозиции за человека НЕЛЬЗЯ: Telegram разрешает
запустить её только самому владельцу телефона, через скрепку. Бот может
попросить разовую точку кнопкой — но разовая точка это не маршрут, и
выдавать её за включённую запись значит обмануть и человека, и владельца.

Поэтому при открытии смены бот показывает ровно то, что нужно нажать, и
честно говорит: пока трансляция не включена, маршрута не будет.
"""

import logging
from typing import Optional

from aiogram import F, Router
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup

from shared.field_track import shift_change, shift_state, whoami

logger = logging.getLogger(__name__)

router = Router()

#: Подписи кнопок. Они же — то, что присылает Telegram при нажатии,
#: поэтому обработчики ниже сверяются с этими же строками.
BTN_OPEN = "▶️ Начал смену"
BTN_CLOSE = "🏁 Закончил смену"
BTN_DAY = "🗺 Мой день"
BTN_HERE = "📍 Я на точке"

#: Как включить трансляцию. Один текст на все места, где о ней говорим:
#: два разных описания одного действия расходятся на первой правке.
LIVE_HINT = (
    "Чтобы маршрут записывался, включите трансляцию геопозиции:\n"
    "скрепка → Геопозиция → «Транслировать» → 8 часов.\n\n"
    "Включить её за вас Telegram не разрешает никому, даже боту."
)


def shift_keyboard(shift_open: Optional[bool]) -> ReplyKeyboardMarkup:
    """Клавиатура под полем ввода.

    `shift_open` — `None` означает «витрина не ответила». Тогда кнопки
    смены НЕТ ВОВСЕ: предложить «начал» человеку, у которого смена уже
    идёт, значит завести путаницу там, где её не было.
    """
    rows: list[list[KeyboardButton]] = []
    if shift_open is True:
        rows.append([KeyboardButton(text=BTN_CLOSE)])
    elif shift_open is False:
        rows.append([KeyboardButton(text=BTN_OPEN)])
    rows.append([KeyboardButton(text=BTN_DAY), KeyboardButton(text=BTN_HERE)])

    return ReplyKeyboardMarkup(
        keyboard=rows,
        resize_keyboard=True,
        # `is_persistent` — клавиатура не прячется, когда человек начинает
        # печатать. Ради этого всё и делалось: она должна быть под рукой
        # в любой момент, а не появляться по команде.
        is_persistent=True,
        input_field_placeholder="Смена и объезд — кнопками ниже",
    )


async def send_shift_keyboard(message: Message, user_id: int, text: str) -> None:
    """Показать клавиатуру с текущим состоянием смены."""
    state = await shift_state(user_id)
    shift_open = None if state is None else bool(state.get("open"))
    await message.answer(text, reply_markup=shift_keyboard(shift_open))


@router.message(F.text == BTN_OPEN)
async def open_shift(message: Message) -> None:
    """«Начал смену» с постоянной клавиатуры."""
    user_id = message.from_user.id if message.from_user else 0
    who = await whoami(user_id)
    if not who.get("staff"):
        # Не сотрудник — у него своё, покупательское меню. Молчим.
        return

    result = await shift_change(user_id, "open")
    if result is None:
        await message.answer("Не получилось открыть смену — попробуйте ещё раз.")
        return

    await message.answer(
        f"▶️ <b>Смена открыта.</b>\n\n{LIVE_HINT}",
        reply_markup=shift_keyboard(True),
    )


@router.message(F.text == BTN_CLOSE)
async def close_shift(message: Message) -> None:
    """«Закончил смену» с постоянной клавиатуры."""
    user_id = message.from_user.id if message.from_user else 0
    who = await whoami(user_id)
    if not who.get("staff"):
        return

    result = await shift_change(user_id, "close")
    if result is None:
        await message.answer("Не получилось закрыть смену — попробуйте ещё раз.")
        return

    await message.answer(
        "🏁 <b>Смена закрыта.</b>\n\nЗапись маршрута остановлена. "
        "Трансляцию геопозиции можно выключить там же, где включали.",
        reply_markup=shift_keyboard(False),
    )


# ═══════════════════════════════════════════════════════════════════════
# Остальные кнопки клавиатуры.
#
# ОНИ ОБЯЗАТЕЛЬНЫ, А НЕ ДОПОЛНЕНИЕ. Кнопка постоянной клавиатуры присылает
# ОБЫЧНЫЙ ТЕКСТ. Без своего обработчика «Мой день» провалился бы в
# `ai_chat`, который ловит свободный текст, — и человек получил бы на
# нажатие рабочей кнопки ответ ИИ-продавца.
#
# Работу делают те же функции, что и кнопки под сообщениями: два места,
# отвечающие на одно нажатие, разошлись бы на первой правке.
# ═══════════════════════════════════════════════════════════════════════


@router.message(F.text == BTN_DAY)
async def show_day(message: Message) -> None:
    """«Мой день» с постоянной клавиатуры."""
    from bots.sales_bot.handlers.tracking import show_day_for

    user_id = message.from_user.id if message.from_user else 0
    await show_day_for(message, user_id)


@router.message(F.text == BTN_HERE)
async def mark_here(message: Message) -> None:
    """«Я на точке» с постоянной клавиатуры.

    Клиента выбирает СЕРВЕР по последней крошке трека — как и у кнопки под
    сообщением. Отсюда же видно, зачем нужна трансляция: без неё сервер не
    знает, где человек стоит, и честно об этом говорит.
    """
    from bots.sales_bot.handlers.tracking import mark_arrival

    user_id = message.from_user.id if message.from_user else 0
    await mark_arrival(message, user_id)
