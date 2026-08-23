from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
import os
import time
import logging
import httpx

from services.config_service import fetch_site_config
from shared.i18n import t
from services.lang_storage import lang_of


router = Router()

WEB_APP_URL = os.getenv("WEB_APP_URL", "https://microgreenuzbekistan.com")
WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
ADMIN_IDS = [int(x.strip()) for x in os.getenv("ADMIN_CHAT_ID", "847872669").split(",") if x.strip()]
BOT_SECRET = os.getenv("BOT_SECRET", "")
_start_time = time.time()


def _api_headers() -> dict:
    """Заголовки для вызовов сайта: общий секрет бот→сайт."""
    headers = {"Content-Type": "application/json"}
    if BOT_SECRET:
        headers["Authorization"] = f"Bearer {BOT_SECRET}"
    return headers


@router.message(Command("start"))
async def cmd_start(message: Message):
    # Handle referral deep links: /start ref_12345
    args = message.text.split(maxsplit=1)
    if len(args) > 1 and args[1].startswith("ref_"):
        try:
            referrer_id = int(args[1].replace("ref_", ""))
            if referrer_id != message.from_user.id:
                # Credit bonuses via API.
                # Заголовок обязателен: маршрут начисляет бонусы (это деньги)
                # и теперь закрыт общим секретом — без него сайт ответит 401.
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.post(f"{WEB_API_URL}/users/referral", json={
                        "referrerId": referrer_id,
                        "newUserId": message.from_user.id,
                        "newUserName": message.from_user.full_name,
                    }, headers=_api_headers())
                    logging.info(f"Referral: {message.from_user.id} from {referrer_id}")
        except Exception as e:
            logging.debug(f"Referral processing failed: {e}")
    
    # Fetch dynamic config from API
    lang = lang_of(message)
    config = await fetch_site_config()
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=t("btn.open_shop", lang), web_app=WebAppInfo(url=WEB_APP_URL)),
        ],
        [
            # Каталог ВНУТРИ бота.
            #
            # Из `/start` в него было не попасть: единственной дверью в
            # покупку стояла кнопка WebApp, то есть мини-приложение сайта.
            # Весь магазин на кнопках — сетка, карточки, корзина — открывался
            # только если знать команду `/shop`, о которой нигде не сказано.
            # Клиент без желания открывать веб-вью просто не находил, где
            # купить.
            InlineKeyboardButton(text=t("btn.catalog", lang), callback_data="shop:categories"),
            InlineKeyboardButton(text=t("btn.cart", lang), callback_data="cart:view"),
        ],
        [
            InlineKeyboardButton(text=t("btn.ai", lang), callback_data="agronomist"),
            InlineKeyboardButton(text=t("btn.recipes", lang), callback_data="menu:recipes"),
        ],
        [
            InlineKeyboardButton(text=t("btn.orders", lang), callback_data="menu:orders"),
            InlineKeyboardButton(text=t("btn.favorites", lang), callback_data="menu:favorites"),
        ],
        [
            InlineKeyboardButton(text=t("btn.bonuses", lang), callback_data="menu:bonuses"),
            InlineKeyboardButton(text=t("btn.game", lang), url=f"https://t.me/{config.social.telegram_bot.rstrip('/').split('/')[-1]}/game"),
        ],
        [
            InlineKeyboardButton(text=t("btn.channel", lang), url=config.social.telegram_channel),
            InlineKeyboardButton(text=t("btn.chat", lang), url=config.social.telegram_group),
        ]
    ])
    
    await message.answer(
        t(
            "start.greeting",
            lang,
            title=config.hero_title,
            threshold=f"{config.free_delivery_threshold:,}",
        ),
        reply_markup=keyboard
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    lang = lang_of(message)
    config = await fetch_site_config()
    
    await message.answer(
        t(
            "help.body",
            lang,
            phone=config.contact_phone,
            email=config.contact_email,
            channel=config.social.telegram_channel,
            group=config.social.telegram_group,
        )
    )


@router.message(Command("contacts"))
async def cmd_contacts(message: Message):
    lang = lang_of(message)
    config = await fetch_site_config()
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=t("btn.channel", lang), url=config.social.telegram_channel),
            InlineKeyboardButton(text=t("btn.group", lang), url=config.social.telegram_group),
        ],
        [
            InlineKeyboardButton(text="📸 Instagram", url=config.social.instagram),
        ],
        [
            InlineKeyboardButton(text=t("btn.call", lang), url=f"tel:{config.contact_phone.replace(' ', '')}"),
        ],
    ])
    
    await message.answer(
        t(
            "contacts.body",
            lang,
            title=config.hero_title,
            phone=config.contact_phone,
            email=config.contact_email,
            fee=f"{config.delivery_fee:,}",
            threshold=f"{config.free_delivery_threshold:,}",
        ),
        reply_markup=keyboard
    )


@router.message(Command("game"))
async def cmd_game(message: Message):
    """Open Farm Simulator — listed in BotFather commands"""
    lang = lang_of(message)
    config = await fetch_site_config()
    bot_username = config.social.telegram_bot.rstrip('/').split('/')[-1]
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=t("btn.play_now", lang), url=f"https://t.me/{bot_username}/game"),
        ],
        [
            InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main"),
        ],
    ])
    
    await message.answer(
        # Курса GreenCoins к скидке нет ни в одном роуте: обмена монет на
        # баллы в коде не существует. Обещание «1000 = 10 000 сум» держалось
        # только на этой строке, поэтому цифры убраны.
        t("game.intro", lang),
        reply_markup=keyboard
    )


@router.message(Command("health"))
async def cmd_health(message: Message):
    """Quick health check — reports bot uptime, API status, menu button URL."""
    lang = lang_of(message)
    if message.from_user.id not in ADMIN_IDS:
        await message.answer(t("admin.only", lang))
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
