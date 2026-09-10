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
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    CallbackQuery,
    Message,
)

from shared.admin_links import tab_button
from shared.approvals import is_owner
from shared.field_track import (
    shift_change,
    shift_state,
    who_is_in_field,
    make_ping,
    my_day,
    plan_accept,
    route_accept,
    send_pings,
    send_visit_photo,
    stay_finish,
    stay_start,
    whoami,
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


async def mark_arrival(message: Message, user_id: int) -> Optional[str]:
    """Отметить приезд на точку. Возвращает причину отказа или `None`.

    Вынесено из обработчика кнопки, потому что то же самое делает кнопка
    ПОСТОЯННОЙ клавиатуры — а она присылает обычный текст, не нажатие.
    Две копии одной работы разошлись бы на первой правке.
    """
    result = await stay_start(user_id)
    if not result.get("ok"):
        # Причину показываем дословно: «не вижу, где вы» — это руководство
        # к действию, а не сбой.
        reason = str(result.get("error") or "Не получилось")
        await message.answer(f"⚠️ {reason}")
        return reason

    who = result.get("customer") or "точка"
    await message.answer(
        f"📍 Отмечено: <b>{who}</b>.\n\n"
        "Пришлите фото — оно уйдёт в отчёт по этой точке. "
        "Уезжаете — нажмите «Уехал».",
        reply_markup=_stay_keyboard(arrived=True),
    )
    return None


@router.callback_query(F.data == "stay:in")
async def stay_in(cb: CallbackQuery) -> None:
    if cb.from_user is None or cb.message is None:
        await cb.answer()
        return

    # Причину `mark_arrival` уже написал сообщением — всплывающее окно с
    # тем же текстом было бы вторым уведомлением об одном событии.
    await mark_arrival(cb.message, cb.from_user.id)
    await cb.answer()


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


# ═══════════════════════════════════════════════════════════════════════
# «Мой день» — постоянная дверь к работе
#
# ЧЕГО НЕ БЫЛО. Меню бота продаж покупательское: каталог, B2B, «мои
# заказы». У полевого сотрудника меню не было вовсе — все его кнопки жили
# на разовых сообщениях: пропустил уведомление, и работа снова невидима.
# При этом продавец пользуется ТОЛЬКО Telegram, админку не открывает.
#
# СПИСОК СОБИРАЕТ ВИТРИНА. Тот же текст печатает уведомление о назначении;
# собери его бот вторыми руками — порядок точек разъехался бы через месяц.
# ═══════════════════════════════════════════════════════════════════════


def _day_keyboard(
    nav_url: str | None, accepted: bool, shift_open: bool | None = None
) -> InlineKeyboardMarkup:
    """Кнопки под днём: смена, маршрут и отметка на точке.

    `shift_open` — `None` означает «витрина не ответила». Тогда кнопки
    смены НЕТ ВОВСЕ: показать «начал» человеку, у которого смена уже
    идёт, значит завести путаницу там, где её не было.
    """
    rows: list[list[InlineKeyboardButton]] = []

    # СМЕНА ПЕРВОЙ КНОПКОЙ: с неё начинается день, и она же включает
    # запись маршрута. Отдельной кнопки «записывать» больше нет — человек
    # мог открыть смену и забыть её нажать, и тогда день считался
    # отработанным, а маршрута не было.
    if shift_open is True:
        rows.append(
            [InlineKeyboardButton(text="🏁 Закончил смену", callback_data="shift:close")]
        )
    elif shift_open is False:
        rows.append(
            [InlineKeyboardButton(text="▶️ Начал смену", callback_data="shift:open")]
        )

    if nav_url:
        rows.append([InlineKeyboardButton(text="🧭 Вести", url=nav_url)])
    if not accepted:
        # `today` вместо номера: у кнопки в «Моём дне» плана под рукой нет,
        # и витрина найдёт сегодняшний сама. Ноль читался бы как номер.
        rows.append(
            [InlineKeyboardButton(text="✅ Приступить", callback_data="plan:accept:today")]
        )
    rows.append([InlineKeyboardButton(text="📍 Я на точке", callback_data="stay:in")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def show_day_for(message: Message, user_id: int) -> None:
    """Показать день человеку `user_id` в чате `message`.

    Отправитель передаётся отдельно намеренно: у сообщения, под которым
    нажали кнопку, `from_user` — это БОТ, а день нужен нажавшему.
    Подменять поле в модели aiogram нельзя: это чужая структура, и правка
    её полей ломается на первом же обновлении библиотеки.
    """
    who = await whoami(user_id)
    if not who.get("staff"):
        # Не сотрудник — это обычный посетитель бота. Молчим и отдаём
        # сообщение дальше: у покупателя своё меню, и подменять его
        # служебным ответом нельзя.
        raise SkipHandler

    day = await my_day(user_id)
    if day.get("error"):
        await message.answer(f"⚠️ Не смог показать день: {day['error']}")
        return

    # Смена спрашивается ВСЕГДА, даже когда объезда нет: работать можно и
    # без назначенного маршрута, и отметить рабочий день человек должен
    # уметь в любом случае.
    state = await shift_state(user_id)
    shift_open = None if state is None else bool(state.get("open"))

    text = str(day.get("text") or "На сегодня объезд не назначен.")
    if shift_open is True:
        text += "\n\n🟢 Смена идёт."
    elif shift_open is False:
        text += "\n\n⚪ Смена не начата."

    await message.answer(
        text,
        reply_markup=_day_keyboard(
            day.get("navUrl") if day.get("has") else None,
            bool(day.get("accepted")),
            shift_open,
        ),
    )


@router.message(Command("day"))
async def day_command(message: Message) -> None:
    """`/day` — что у меня сегодня."""
    if message.from_user is None:
        return
    await show_day_for(message, message.from_user.id)


@router.callback_query(F.data == "field:day")
async def day_button(cb: CallbackQuery) -> None:
    await cb.answer()
    if cb.message is not None and cb.from_user is not None:
        await show_day_for(cb.message, cb.from_user.id)


@router.callback_query(F.data.startswith("route:accept:"))
async def route_accept_pressed(cb: CallbackQuery) -> None:
    """«Приступить» под рейсом доставки.

    Тот же рубеж, что у объезда: жмёт сотрудник, а не владелец, и кто он —
    решает витрина по `telegramId`. Она же проверяет, что рейс его: кнопку
    можно переслать.
    """
    if cb.from_user is None:
        await cb.answer()
        return

    raw = (cb.data or "").split(":")[-1]
    route_id = raw if raw and raw != "today" else None

    result = await route_accept(cb.from_user.id, route_id)
    if not result.get("ok"):
        await cb.answer(str(result.get("error") or "Не получилось"), show_alert=True)
        return

    if result.get("already"):
        await cb.answer("Уже подтверждено")
        return

    stops = int(result.get("stops") or 0)
    await cb.answer("Принято")
    if cb.message is not None:
        await cb.message.answer(f"🚚 Рейс принят. Адресов: {stops}.")


# ═══════════════════════════════════════════════════════════════════════
# Смена: «начал» и «закончил».
#
# ОДНА КНОПКА ЗАПУСКАЕТ ВСЁ. Смена включает запись маршрута на витрине —
# отдельного «записывать день» больше нет. Раньше человек мог открыть
# смену и забыть включить трек: день считался отработанным, а маршрута не
# было.
#
# ТРАНСЛЯЦИЮ ВСЁ РАВНО НАПОМИНАЕМ. Браузер и Telegram включают геопозицию
# по-разному, и притворяться, что это одна кнопка, нельзя: нажатие здесь
# открывает смену, но точки шлёт трансляция, которую включает сам человек.
# ═══════════════════════════════════════════════════════════════════════


@router.callback_query(F.data.in_({"shift:open", "shift:close"}))
async def shift_button(callback: CallbackQuery) -> None:
    """Открыть или закрыть смену нажатием в боте."""
    user_id = callback.from_user.id if callback.from_user else 0
    who = await whoami(user_id)
    if not who.get("staff"):
        # Проверяем сотрудника, а НЕ владельца: смену открывает тот, кто
        # работает. Все прочие обработчики офиса гонят не-владельца, и
        # скопировать их сюда значило бы запереть человека от его смены.
        await callback.answer("Кнопка не для вас", show_alert=True)
        return

    action = "open" if callback.data == "shift:open" else "close"
    result = await shift_change(user_id, action)
    if result is None:
        await callback.answer("Не получилось — попробуйте ещё раз", show_alert=True)
        return

    # Клавиатуру под полем ввода обновляем ТУТ ЖЕ. Она показывает
    # противоположное действие («идёт» → «закончил»), и если оставить её
    # прежней, человек увидит две кнопки о разном состоянии одной смены.
    from bots.sales_bot.handlers.shift_menu import LIVE_HINT, shift_keyboard

    if action == "open":
        await callback.answer("Смена открыта")
        if callback.message:
            await callback.message.answer(
                f"▶️ <b>Смена открыта.</b>\n\n{LIVE_HINT}",
                reply_markup=shift_keyboard(True),
            )
        return

    await callback.answer("Смена закрыта")
    if callback.message:
        await callback.message.answer(
            "🏁 <b>Смена закрыта.</b>\n\nЗапись маршрута остановлена.",
            reply_markup=shift_keyboard(False),
        )


# ═══════════════════════════════════════════════════════════════════════
# «Где сотрудники» — маршрут владельцу, не выходя из Telegram.
#
# ЧЕГО НЕ БЫЛО. Маршрут человека можно было посмотреть только в админке:
# открыть браузер, вспомнить пароль, найти вкладку, выбрать сотрудника и
# дату. Владелец при этом весь день в Telegram.
#
# ПОЧЕМУ КНОПКА, А НЕ КАРТИНКА. Нарисовать карту в сообщении нельзя —
# нужен отдельный отрисовщик и неподвижный кадр. Кнопка открывает НАСТОЯЩУЮ
# карту прямо внутри Telegram (Mini App), с треком, заездами и зумом. Это
# и короче в работе, и полезнее в руках.
#
# ЧИСЛА БЕРЁМ ИЗ ЖИВОГО СЛОЯ КАРТЫ, а не считаем заново: два места,
# отвечающие на один вопрос, разойдутся на первой же правке.
# ═══════════════════════════════════════════════════════════════════════


def _field_line(person: dict, silent_after_min: int) -> str:
    """Одна строка сводки: кто, сколько прошёл, сколько заездов, на связи ли.

    Порог молчания приходит из витрины (`silentAfterMin`), а не вписан
    здесь числом: по нему же гаснет точка на карте, и два числа означали бы
    человека, который на карте ещё «сейчас», а в сводке уже «молчит».
    """
    name = str(person.get("name") or "—")
    meters = int(person.get("meters") or 0)
    stops = int(person.get("stops") or 0)
    silent = person.get("silentMin")

    # «Точек нет» и «молчит десять минут» — разные вещи. Первое означает,
    # что человек не включил запись вовсе; второе — что связь моргнула.
    if silent is None:
        state = "запись не включена"
    elif int(silent) >= silent_after_min:
        state = f"молчит {int(silent)} мин"
    else:
        state = "на связи"

    km = f"{meters / 1000:.1f} км" if meters >= 100 else "меньше 100 м"
    return f"• <b>{name}</b> — {km}, заездов {stops}, {state}"


@router.message(Command("field"))
async def where_is_everyone(message: Message) -> None:
    """Сводка по всем, кто сегодня в поле, плюс кнопка на карту."""
    user_id = message.from_user.id if message.from_user else 0
    if not is_owner(user_id):
        # Это вопрос владельца. Продавцу чужой трек знать незачем — тот же
        # рубеж, что и у отчёта дня на витрине.
        raise SkipHandler

    people, silent_after_min = await who_is_in_field()
    if not people:
        await message.answer(
            "🗺 <b>Сегодня в поле никого.</b>\n\n"
            "Смену никто не открывал, либо записи ещё нет."
        )
        return

    lines = [_field_line(p, silent_after_min) for p in people]
    rows = []
    for person in people[:8]:
        # Кнопка на КАЖДОГО: одна общая привела бы на экран, где владельцу
        # снова выбирать человека руками — то есть кнопка не работала бы.
        employee_id = str(person.get("id") or "")
        if not employee_id:
            continue
        rows.append(
            [
                tab_button(
                    f"🗺 {person.get('name') or 'На карте'}",
                    "field_day",
                    user_id,
                    focus=employee_id,
                )
            ]
        )

    await message.answer(
        "🗺 <b>Сейчас в поле</b>\n\n" + "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows) if rows else None,
    )
