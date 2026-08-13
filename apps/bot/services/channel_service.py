"""
Telegram Channel & Group Automation Service
Auto-posts content to channel and manages group moderation.
"""

import logging
import os
from aiogram import Bot
from aiogram.enums import ParseMode
from dotenv import load_dotenv

from services.config_service import fetch_site_config
from services.ecosystem_bridge import bridge

load_dotenv()

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL_ID = os.getenv("CHANNEL_ID", "@MicrogreenUzbekistan")  # Official channel
GROUP_ID = os.getenv("GROUP_ID")  # e.g., "-1001234567890"

# Lazy-init singleton Bot to avoid creating a new session per call
_bot_instance = None

def _get_bot() -> Bot:
    global _bot_instance
    if _bot_instance is None and BOT_TOKEN:
        _bot_instance = Bot(token=BOT_TOKEN)
    return _bot_instance

# Ежедневные посты в канал — уходят по расписанию, без человека.
#
# Цены здесь НЕ пишутся. Раньше в теле поста стояло «Лоток брокколи —
# 15 000 сум», и после любой правки прайса канал ещё месяцами обещал старую
# цифру: никто не помнит, что цену надо менять в двух местах.
#
# `match` — подстрока названия товара. Перед публикацией она ищется в живом
# каталоге, `{product}` и `{price}` подставляются оттуда. Товара нет в
# каталоге — пост пропускается, а не выходит с устаревшей ценой.
#
# `{payment}` подставляется из настроек витрины (`payment.methods`).
DAILY_CONTENT = [
    {
        "title": "🥗 Рецепт дня",
        "match": "подсолнеч",
        "body": "Салат с микрозеленью подсолнечника, авокадо и лимонной заправкой — за 10 минут!\n\n"
                "Подсолнечник — ореховый, сочный вкус. Идеален для салатов и боулов.\n\n"
                "💰 {product} — {price} сум",
    },
    {
        "title": "🌿 Знаете ли вы?",
        "match": "брокколи",
        # Было «в 40 раз больше сульфорафана» — чужая цифра про другое растение,
        # заявленная как характеристика нашего товара. Говорим о составе и вкусе.
        "body": "Микрозелень брокколи — источник глюкозинолатов, 2,6 г клетчатки на 100 г.\n\n"
                "Добавляйте в смузи, салаты и сэндвичи — вкус мягкий, нежный. Не нагревайте.\n\n"
                "💰 {product} — {price} сум",
    },
    {
        "title": "🍽️ Шеф рекомендует",
        "match": "руккол",
        "body": "Руккола микро — пикантный, горчичный вкус. Идеальна для:\n"
                "• Пиццы и пасты\n"
                "• Стейков и бургеров\n"
                "• Песто и заправок\n\n"
                "💰 {product} — {price} сум",
    },
    {
        # Скидки «3 лотка за 40 500 вместо 45 000» в системе нет: ни промокода,
        # ни правила на количество. Пост зовёт в каталог, а не обещает её.
        "title": "🎁 Набор «Знакомство»",
        "body": "Не знаете, с чего начать? Возьмите три вкуса сразу:\n\n"
                "🌻 Подсолнечник — ореховый\n"
                "🟢 Горох — сладкий, хрустящий\n"
                "🥦 Брокколи — мягкий, полезный\n\n"
                "Наборы и цены — в каталоге.",
    },
    {
        "title": "🥬 Бейби-лист",
        "match": "бейби",
        "body": "Нежные молодые листья — крупнее микрозелени, нежнее салата.\n\n"
                "Идеально для салатов, гарниров и смузи-боулов.\n\n"
                "💰 {product} — {price} сум",
    },
    {
        "title": "💪 ЗОЖ-совет",
        "match": "горох",
        "body": "Добавьте микрозелень в утренний смузи — заряд витаминов на весь день!\n\n"
                "Рецепт: банан + шпинат + микрозелень гороха + мёд + вода.\n"
                "Готово за 3 минуты!\n\n"
                "💰 {product} — {price} сум",
    },
    {
        "title": "🚚 Доставка по Самарканду",
        "body": "Заказали утром — получите в тот же день!\n\n"
                "📍 Самарканд — в день заказа\n"
                "📍 Ташкент — на следующий день\n"
                "💳 Оплата: {payment}\n\n"
                "Закажите прямо сейчас!",
    },
]

async def post_to_channel(text: str, photo_url: str = None) -> dict:
    """
    Posts content to the Telegram channel.
    
    Args:
        text: Post text (HTML formatting supported)
        photo_url: Optional photo URL
    
    Returns:
        Response dict with message_id
    """
    bot = _get_bot()
    if not bot:
        return {"error": "BOT_TOKEN not configured"}
    
    try:
        if photo_url:
            msg = await bot.send_photo(
                chat_id=CHANNEL_ID,
                photo=photo_url,
                caption=text,
                parse_mode=ParseMode.HTML
            )
        else:
            msg = await bot.send_message(
                chat_id=CHANNEL_ID,
                text=text,
                parse_mode=ParseMode.HTML
            )
        
        return {"success": True, "message_id": msg.message_id}
    except Exception as e:
        return {"error": str(e)}

async def post_new_product(product: dict) -> dict:
    """Posts a new product announcement to the channel."""
    price = f"{int(product['price']):,}".replace(",", " ")
    
    text = f"""🆕 <b>Новинка в каталоге!</b>

🌱 <b>{product['title']}</b>

{product.get('description', 'Свежая микрозелень премиум качества.')}

💰 <b>{price} сум</b>

🛒 Заказать: @Microgreenuzbekistan_bot
🌐 Сайт: microgreenuzbekistan.com/catalog"""
    
    return await post_to_channel(text, product.get('image'))

async def _find_product(match: str) -> dict | None:
    """Найти товар в живом каталоге по подстроке названия.

    Берём самый дешёвый из подходящих: пост зовёт попробовать, и называть
    цену топовой позиции, когда рядом лежит доступная, — обман ожидания.
    """
    try:
        products = await bridge.get_products(limit=100)
    except Exception as e:
        logger.error("Не удалось загрузить каталог для поста: %s", e)
        return None

    needle = match.lower()
    found = [
        p for p in products
        if needle in str(p.get("title", "")).lower() and p.get("inStock", True)
    ]
    if not found:
        return None
    return min(found, key=lambda p: int(p.get("price", 0) or 0))


async def post_daily_tip(day_of_week: int) -> dict:
    """Posts daily content based on day of week (0=Monday).

    Цена подставляется из каталога. Товара нет — пост не выходит: устаревшая
    цена в канале дороже пропущенного дня.
    """
    content = DAILY_CONTENT[day_of_week % len(DAILY_CONTENT)]
    body = content["body"]

    if "{product}" in body or "{price}" in body:
        product = await _find_product(content["match"])
        if not product:
            logger.warning(
                "Пост «%s» пропущен: в каталоге нет товара по «%s»",
                content["title"], content["match"],
            )
            return {"skipped": "product_not_in_catalog", "title": content["title"]}
        price = f"{int(product['price']):,}".replace(",", " ")
        body = body.replace("{product}", str(product["title"])).replace("{price}", price)

    if "{payment}" in body:
        config = await fetch_site_config()
        body = body.replace("{payment}", config.payment_text)

    text = f"""🌱 <b>Microgreen Uzbekistan</b>

<b>{content['title']}</b>

{body}

🛒 Заказать: @Microgreenuzbekistan_bot
🌐 microgreenuzbekistan.com"""

    return await post_to_channel(text)

async def send_group_welcome(user_name: str, group_id: str = None) -> dict:
    """Sends welcome message to new group member."""
    bot = _get_bot()
    if not bot:
        return {"error": "BOT_TOKEN not configured"}
    
    target_group = group_id or GROUP_ID
    if not target_group:
        return {"error": "GROUP_ID not configured"}
    
    text = f"""👋 Добро пожаловать, <b>{user_name}</b>!

🌱 Это сообщество любителей свежей зелени <b>Microgreen Uzbekistan</b>

📌 <b>Что здесь можно:</b>
• Задавать вопросы о продукции
• Делиться рецептами и фото
• Узнавать о новинках и акциях

🤖 AI-помощник: @Microgreenuzbekistan_bot
🛒 Каталог: microgreenuzbekistan.com/catalog"""
    
    try:
        msg = await bot.send_message(
            chat_id=target_group,
            text=text,
            parse_mode=ParseMode.HTML
        )
        return {"success": True, "message_id": msg.message_id}
    except Exception as e:
        return {"error": str(e)}

# FAQ_RESPONSES удалён: его никто не читал, а он дословно повторял
# FAQ_PATTERNS из handlers/group.py — вторая копия тех же ответов, которая
# при первой же правке разошлась бы с живой.
