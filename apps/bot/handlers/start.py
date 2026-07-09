from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
import os
import time
import logging
import httpx

from services.config_service import fetch_site_config

router = Router()

WEB_APP_URL = os.getenv("WEB_APP_URL", "https://microgreenuzbekistan.com")
WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
ADMIN_IDS = [int(x.strip()) for x in os.getenv("ADMIN_CHAT_ID", "847872669").split(",") if x.strip()]
_start_time = time.time()


@router.message(Command("start"))
async def cmd_start(message: Message):
    # Handle referral deep links: /start ref_12345
    args = message.text.split(maxsplit=1)
    if len(args) > 1 and args[1].startswith("ref_"):
        try:
            referrer_id = int(args[1].replace("ref_", ""))
            if referrer_id != message.from_user.id:
                # Credit bonuses via API
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.post(f"{WEB_API_URL}/users/referral", json={
                        "referrerId": referrer_id,
                        "newUserId": message.from_user.id,
                        "newUserName": message.from_user.full_name,
                    })
                    logging.info(f"Referral: {message.from_user.id} from {referrer_id}")
        except Exception as e:
            logging.debug(f"Referral processing failed: {e}")
    
    # Fetch dynamic config from API
    config = await fetch_site_config()
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="⚡ Do'konni ochish / Открыть магазин", web_app=WebAppInfo(url=WEB_APP_URL)),
        ],
        [
            InlineKeyboardButton(text="🎮 O'ynash va chegirma olish / Играть", url=f"https://t.me/{config.social.telegram_bot.rstrip('/').split('/')[-1]}/game"),
        ],
        [
            InlineKeyboardButton(text="🤖 AI-Agronom so'rash / Спросить AI", callback_data="agronomist"),
        ],
        [
            InlineKeyboardButton(text="📋 Buyurtmalar / Заказы", callback_data="menu:orders"),
            InlineKeyboardButton(text="🎁 Bonuslar / Бонусы", callback_data="menu:bonuses"),
        ],
        [
            InlineKeyboardButton(text="📢 Kanal / Канал", url=config.social.telegram_channel),
            InlineKeyboardButton(text="💬 Chat / Чат", url=config.social.telegram_group),
        ]
    ])
    
    await message.answer(
        f"👨‍🌾 <b>Salom! Men sening shaxsiy AI-Agronomingman {config.hero_title} dan!</b>\n"
        f"🇷🇺 <b>Привет! Я твой личный AI-Агроном из {config.hero_title}!</b>\n\n"
        f"Men sizga ajoyib hosil olishda yordam beraman. (Я здесь, чтобы помочь тебе собирать идеальные урожаи)\n\n"
        f"<b>Bizda nima bor (Что у нас есть):</b>\n"
        "• 🌿 <b>Do'kon / Магазин</b> (320+ mahsulotlar / товаров)\n"
        "• 🎮 <b>Farm Simulator</b> — o'ynang va haqiqiy chegirmalar oling! / играй и получай реальные скидки!\n"
        "• 📸 <b>Rasm orqali tahlil / Диагностика по фото</b>\n\n"
        f"🎁 <i>Bepul yetkazib berish / Бесплатная доставка от {config.free_delivery_threshold:,} so'm!</i>\n\n"
        "👇 <b>Nimadan boshlaymiz? / С чего начнем сегодня?</b>",
        reply_markup=keyboard
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    config = await fetch_site_config()
    
    await message.answer(
        "📖 <b>Команды бота:</b>\n\n"
        "/start — Главное меню\n"
        "/catalog — Каталог товаров\n"
        "/orders — Мои заказы\n"
        "/game — Farm Simulator\n"
        "/help — Помощь\n\n"
        f"📞 Телефон: {config.contact_phone}\n"
        f"📧 Email: {config.contact_email}\n\n"
        f"📢 Канал: {config.social.telegram_channel}\n"
        f"👥 Группа: {config.social.telegram_group}"
    )


@router.message(Command("contacts"))
async def cmd_contacts(message: Message):
    config = await fetch_site_config()
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📢 Канал", url=config.social.telegram_channel),
            InlineKeyboardButton(text="👥 Группа", url=config.social.telegram_group),
        ],
        [
            InlineKeyboardButton(text="📸 Instagram", url=config.social.instagram),
        ],
        [
            InlineKeyboardButton(text="📞 Позвонить", url=f"tel:{config.contact_phone.replace(' ', '')}"),
        ],
    ])
    
    await message.answer(
        f"📞 <b>Контакты {config.hero_title}</b>\n\n"
        f"📱 Телефон: {config.contact_phone}\n"
        f"📧 Email: {config.contact_email}\n\n"
        f"🚚 Доставка: {config.delivery_fee:,} сум\n"
        f"🎁 Бесплатно от: {config.free_delivery_threshold:,} сум",
        reply_markup=keyboard
    )


@router.message(Command("game"))
async def cmd_game(message: Message):
    """Open Farm Simulator — listed in BotFather commands"""
    config = await fetch_site_config()
    bot_username = config.social.telegram_bot.rstrip('/').split('/')[-1]
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🎮 Играть сейчас", url=f"https://t.me/{bot_username}/game"),
        ],
        [
            InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main"),
        ],
    ])
    
    await message.answer(
        "🎮 <b>Farm Simulator</b>\n\n"
        "Выращивай виртуальные растения, зарабатывай GreenCoins\n"
        "и обменивай их на <b>реальные скидки</b>!\n\n"
        "💎 1000 GreenCoins = 10 000 сум скидки\n"
        "🔥 Заходи каждый день для бонуса streak!\n\n"
        "👇 Нажми чтобы играть:",
        reply_markup=keyboard
    )


@router.message(Command("health"))
async def cmd_health(message: Message):
    """Quick health check — reports bot uptime, API status, menu button URL."""
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("⛔ Только для администраторов.")
        return

    uptime_sec = int(time.time() - _start_time)
    hours, remainder = divmod(uptime_sec, 3600)
    minutes, seconds = divmod(remainder, 60)
    uptime_str = f"{hours}ч {minutes}м {seconds}с"

    # Check API
    api_status = "❌ Недоступен"
    product_count = 0
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{WEB_API_URL}/products")
            if resp.status_code == 200:
                products = resp.json()
                product_count = len(products)
                api_status = f"✅ OK ({product_count} товаров)"
    except Exception as e:
        api_status = f"❌ {e}"

    # Check site
    site_status = "❌ Недоступен"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("https://microgreenuzbekistan.com", follow_redirects=True)
            site_status = f"✅ OK ({resp.status_code})"
    except Exception as e:
        site_status = f"❌ {e}"

    await message.answer(
        "🏥 <b>Health Check</b>\n\n"
        f"⏱ Аптайм: <code>{uptime_str}</code>\n"
        f"🌐 Сайт: {site_status}\n"
        f"🔗 API: {api_status}\n"
        f"📱 WebApp: <code>{WEB_APP_URL}</code>\n"
        f"🔑 API URL: <code>{WEB_API_URL}</code>\n\n"
        f"📊 Товаров в БД: {product_count}"
    )
