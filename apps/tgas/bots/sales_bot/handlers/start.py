"""Sales Bot — /start, /help, язык, контакты, навигация."""

import logging
from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.config import settings
from shared.database import get_session_ctx
from shared.utils import simulate_typing, get_greeting, format_price
from bots.sales_bot.keyboards.inline import main_menu_kb, language_kb

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
async def cmd_start(message: Message, state: FSMContext) -> None:
    await state.clear()
    await simulate_typing(message, delay=1.0)

    # Save customer to DB
    async with get_session_ctx() as session:
        row = await session.execute(
            text("SELECT id, language FROM customers WHERE telegram_id = :tid"),
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
    await message.answer(text_msg, reply_markup=main_menu_kb(lang))


@router.message(Command("help"))
async def cmd_help(message: Message, state: FSMContext) -> None:
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
    await message.answer(help_text, reply_markup=main_menu_kb(lang))


@router.message(Command("contacts"))
async def cmd_contacts(message: Message, state: FSMContext) -> None:
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
    await message.answer(contacts, reply_markup=main_menu_kb(lang))


@router.callback_query(F.data == "menu:contacts")
async def on_contacts(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await cb.message.edit_text(
        f"📞 Телефон: {settings.company_phone}\n📍 Самарканд\n🌐 microgreenuzbekistan.com",
        reply_markup=main_menu_kb(lang),
    )
    await cb.answer()


@router.callback_query(F.data == "menu:language")
async def on_language(cb: CallbackQuery) -> None:
    await cb.message.edit_text(
        "🌐 Выберите язык / Tilni tanlang:", reply_markup=language_kb()
    )
    await cb.answer()


@router.callback_query(F.data.startswith("lang:"))
async def on_lang_set(cb: CallbackQuery, state: FSMContext) -> None:
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
    await cb.message.edit_text(msg, reply_markup=main_menu_kb(lang))
    await cb.answer()


@router.callback_query(F.data == "nav:main_menu")
async def on_main_menu(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.set_state(None)
    greeting = get_greeting(lang)
    name = cb.from_user.first_name or "друг"
    text_msg = f"{greeting}, {name}! 👋" if lang == "ru" else f"{greeting}, {name}! 👋"
    await cb.message.edit_text(text_msg, reply_markup=main_menu_kb(lang))
    await cb.answer()
