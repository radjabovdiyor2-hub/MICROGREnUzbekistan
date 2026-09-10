"""Sales Bot — /start, /help, язык, контакты, навигация."""

import logging
from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.config import settings
from shared.database import get_session_ctx
from shared.utils import simulate_typing, get_greeting, format_price
from bots.sales_bot.keyboards.inline import main_menu, language_kb

router = Router()
logger = logging.getLogger(__name__)

WELCOME_RU = (
    "🌱 <b>Добро пожаловать в Microgreen Uzbekistan!</b>\n\n"
    "Свежая микрозелень, салаты и съедобные цветы.\n"
    "Доставка по Самарканду 🚚\n\n"
    "Выберите действие:"
)
WELCOME_UZ = (
    "🌱 <b>Microgreen Uzbekistan ga xush kelibsiz!</b>\n\n"
    "Yangi mikrogreens, salatlar va iste'mol gullar.\n"
    "Samarqand bo'ylab yetkazib berish 🚚\n\n"
    "Harakatni tanlang:"
)


@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    await simulate_typing(message, delay=1.0)

    # Save customer to DB
    async with get_session_ctx() as session:
        row = await session.execute(
            text(
                "SELECT id, language FROM customers "
                "WHERE deleted_at IS NULL AND telegram_id = :tid"
            ),
            {"tid": message.from_user.id},
        )
        customer = row.fetchone()

        if customer:
            lang = customer.language or "ru"
            name = message.from_user.first_name or "друг"
            greeting = get_greeting(lang)
            text_msg = (
                f"{greeting}, {name}! 👋\n\nРады видеть вас снова!"
                if lang == "ru"
                else f"{greeting}, {name}! 👋\n\nSizni yana ko'rganimizdan xursandmiz!"
            )
        else:
            lang = "ru"
            full_name = (
                " ".join(
                    filter(
                        None,
                        [message.from_user.first_name, message.from_user.last_name],
                    )
                )
                or "Friend"
            )
            await session.execute(
                text(
                    "INSERT INTO customers (name, telegram_id, telegram_username, status, language, created_at, updated_at) "
                    "VALUES (:name, :tid, :uname, 'lead', 'ru', NOW(), NOW()) ON CONFLICT (telegram_id) DO NOTHING"
                ),
                {
                    "name": full_name,
                    "tid": message.from_user.id,
                    "uname": message.from_user.username,
                },
            )
            text_msg = WELCOME_RU

    await state.update_data(lang=lang, cart={})
    await message.answer(text_msg, reply_markup=await main_menu(lang))

    # ── Полевому сотруднику — своя дверь ──────────────────────────────
    #
    # Бот один и тот же для покупателя и для продавца, а меню им нужно
    # разное. У покупателя оно есть — каталог, B2B, «мои заказы»; у
    # полевого сотрудника не было НИКАКОГО: все его кнопки жили на разовых
    # сообщениях, и пропущенное уведомление означало, что работа снова
    # невидима. При этом продавец пользуется ТОЛЬКО Telegram.
    #
    # Отдельным сообщением, а не подменой меню: он и покупателем бывает —
    # заказывает себе, смотрит каталог. Отобрать у него магазин ради
    # служебных кнопок было бы хуже, чем показать и то и другое.
    #
    # Кто сотрудник, решает витрина: связка Telegram ↔ сотрудник живёт в
    # `Employee.telegramId`, и копия этого списка в офисе разошлась бы с
    # оригиналом.
    try:
        from shared.field_track import whoami

        who = await whoami(message.from_user.id)
        if who.get("staff"):
            today = who.get("today") or {}
            stops = int(today.get("planStops") or 0)
            line = (
                f"На сегодня объезд: {stops} точек."
                if stops
                else "На сегодня объезд не назначен."
            )
            await message.answer(
                f"🧰 <b>Рабочее меню</b>\n\n{line}",
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[
                        [InlineKeyboardButton(text="🗺 Мой день", callback_data="field:day")],
                        [InlineKeyboardButton(text="📍 Я на точке", callback_data="stay:in")],
                    ]
                ),
            )
    except Exception as exc:
        # Витрина недоступна — покупательское меню уже показано, и ронять
        # приветствие из-за служебной надстройки нельзя.
        logger.warning("SALES_START: рабочее меню не показано (%s)", exc)


@router.message(Command("help"))
async def cmd_help(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    help_text = (
        (
            "📖 <b>Доступные команды:</b>\n\n"
            "/start — Главное меню\n"
            "/help — Помощь\n"
            "/contacts — Контакты\n"
            "/language — Сменить язык"
        )
        if lang == "ru"
        else (
            "📖 <b>Mavjud buyruqlar:</b>\n\n"
            "/start — Asosiy menyu\n"
            "/help — Yordam\n"
            "/contacts — Kontaktlar\n"
            "/language — Tilni o'zgartirish"
        )
    )
    await message.answer(help_text, reply_markup=await main_menu(lang))


@router.message(Command("contacts"))
async def cmd_contacts(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    contacts = (
        (
            f"📞 <b>Наши контакты:</b>\n\n"
            f"📱 Телефон: {settings.company_phone}\n"
            f"📍 Адрес: г. Самарканд\n"
            f"⏰ Работаем: Пн-Сб, 8:00-20:00\n"
            f"🚚 Бесплатная доставка от {format_price(settings.free_delivery_threshold)}\n"
            f"🌐 microgreenuzbekistan.com"
        )
        if lang == "ru"
        else (
            f"📞 <b>Bizning kontaktlar:</b>\n\n"
            f"📱 Telefon: {settings.company_phone}\n"
            f"📍 Manzil: Samarqand sh.\n"
            f"⏰ Ish vaqti: Du-Sha, 8:00-20:00\n"
            f"🚚 {format_price(settings.free_delivery_threshold)} dan bepul yetkazib berish\n"
            f"🌐 microgreenuzbekistan.com"
        )
    )
    await message.answer(contacts, reply_markup=await main_menu(lang))


@router.callback_query(F.data == "menu:contacts")
async def on_contacts(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await cb.message.edit_text(
        f"📞 Телефон: {settings.company_phone}\n📍 Самарканд\n🌐 microgreenuzbekistan.com",
        reply_markup=await main_menu(lang),
    )
    await cb.answer()


@router.callback_query(F.data == "menu:language")
async def on_language(cb: CallbackQuery):
    await cb.message.edit_text(
        "🌐 Выберите язык / Tilni tanlang:", reply_markup=language_kb()
    )
    await cb.answer()


@router.callback_query(F.data.startswith("lang:"))
async def on_lang_set(cb: CallbackQuery, state: FSMContext):
    lang = cb.data.split(":")[1]
    await state.update_data(lang=lang)
    async with get_session_ctx() as session:
        await session.execute(
            text("UPDATE customers SET language = :lang WHERE telegram_id = :tid"),
            {"lang": lang, "tid": cb.from_user.id},
        )
    msg = (
        "✅ Язык изменён на русский!"
        if lang == "ru"
        else "✅ Til o'zbekchaga o'zgartirildi!"
    )
    await cb.message.edit_text(msg, reply_markup=await main_menu(lang))
    await cb.answer()


@router.callback_query(F.data == "nav:main_menu")
async def on_main_menu(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.set_state(None)
    greeting = get_greeting(lang)
    name = cb.from_user.first_name or "друг"
    text_msg = f"{greeting}, {name}! 👋" if lang == "ru" else f"{greeting}, {name}! 👋"
    await cb.message.edit_text(text_msg, reply_markup=await main_menu(lang))
    await cb.answer()
