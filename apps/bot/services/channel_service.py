"""
Telegram Channel & Group Automation Service
Auto-posts content to channel and manages group moderation.
"""

import os
from aiogram import Bot
from aiogram.enums import ParseMode
from dotenv import load_dotenv

load_dotenv()

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

# Daily content for auto-posting — продающие посты для покупателей
DAILY_CONTENT = [
    {
        "title": "🥗 Рецепт дня",
        "body": "Салат с микрозеленью подсолнечника, авокадо и лимонной заправкой — за 10 минут!\n\n"
                "Подсолнечник — ореховый, сочный вкус. Идеален для салатов и боулов.\n\n"
                "💰 Лоток микрозелени подсолнечника — 15 000 сум",
    },
    {
        "title": "🌿 Знаете ли вы?",
        "body": "Микрозелень брокколи содержит в 40 раз больше сульфорафана, чем взрослый брокколи!\n\n"
                "Добавляйте в смузи, салаты и сэндвичи — вкус мягкий, нежный.\n\n"
                "💰 Лоток брокколи — 15 000 сум",
    },
    {
        "title": "🍽️ Шеф рекомендует",
        "body": "Руккола микро — пикантный, горчичный вкус. Идеальна для:\n"
                "• Пиццы и пасты\n"
                "• Стейков и бургеров\n"
                "• Песто и заправок\n\n"
                "💰 Лоток рукколы — 15 000 сум",
    },
    {
        "title": "🎁 Акция недели",
        "body": "Закажите 3 лотка — получите скидку 10%!\n\n"
                "Попробуйте набор «Знакомство»:\n"
                "🌻 Подсолнечник + 🟢 Горох + 🥦 Брокколи\n\n"
                "💰 3 лотка за 40 500 сум (вместо 45 000)",
    },
    {
        "title": "🥬 Новинка: Бейби-лист",
        "body": "Нежные молодые листья — крупнее микрозелени, нежнее салата.\n\n"
                "В наличии: шпинат, кейл, мангольд, руккола.\n"
                "Идеально для салатов, гарниров и смузи-боулов.\n\n"
                "💰 Упаковка 100г — от 25 000 сум",
    },
    {
        "title": "💪 ЗОЖ-совет",
        "body": "Добавьте микрозелень в утренний смузи — заряд витаминов на весь день!\n\n"
                "Рецепт: банан + шпинат + микрозелень гороха + мёд + вода.\n"
                "Готово за 3 минуты!\n\n"
                "💰 Микрозелень гороха — 15 000 сум/лоток",
    },
    {
        "title": "🚚 Доставка по Самарканду",
        "body": "Заказали утром — получите в тот же день!\n\n"
                "📍 Самарканд — в день заказа\n"
                "📍 Ташкент — на следующий день\n"
                "💳 Оплата: наличные, Click, Payme\n\n"
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
🌐 Сайт: microgreenuzbekistan.com/shop"""
    
    return await post_to_channel(text, product.get('image'))

async def post_daily_tip(day_of_week: int) -> dict:
    """Posts daily content based on day of week (0=Monday)."""
    content = DAILY_CONTENT[day_of_week % len(DAILY_CONTENT)]
    
    text = f"""🌱 <b>Microgreen Uzbekistan</b>

<b>{content['title']}</b>

{content['body']}

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
🛒 Каталог: microgreenuzbekistan.com/shop"""
    
    try:
        msg = await bot.send_message(
            chat_id=target_group,
            text=text,
            parse_mode=ParseMode.HTML
        )
        return {"success": True, "message_id": msg.message_id}
    except Exception as e:
        return {"error": str(e)}

# FAQ auto-responder keywords
FAQ_RESPONSES = {
    "цена": "💰 Актуальные цены на сайте: microgreenuzbekistan.com/shop\nИли напишите боту: @Microgreenuzbekistan_bot",
    "доставка": "🚚 Доставка: Самарканд — в день заказа, Ташкент — на следующий день\nОплата: наличные, Click, Payme",
    "заказ": "🛒 Заказать можно:\n• Через бота: @Microgreenuzbekistan_bot\n• На сайте: microgreenuzbekistan.com/shop",
    "семена": "🌱 Семена для микрозелени в каталоге: microgreenuzbekistan.com/shop?category=seeds",
    "оборудование": "⚙️ LED-лампы, pH-метры, стеллажи: microgreenuzbekistan.com/shop?category=equipment",
}
