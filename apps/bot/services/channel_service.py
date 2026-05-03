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

# Daily tips for auto-posting
DAILY_TIPS = [
    "💡 Совет дня: Оптимальная температура для микрозелени — 18-24°C. Слишком жарко = вытягивание, слишком холодно = медленный рост.",
    "💡 Совет дня: Поливайте микрозелень утром, чтобы листья успели высохнуть до вечера и не гнили.",
    "💡 Совет дня: pH воды для руколы должен быть 5.5-6.5. Используйте pH-метр!",
    "💡 Совет дня: Не переливайте! Лучше недолить, чем перелить. Корни должны дышать.",
    "💡 Совет дня: LED-освещение 12-16 часов в день = идеальный урожай за 7-14 дней.",
    "💡 Совет дня: Редис — самая быстрая микрозелень (5-7 дней). Отлично подходит для новичков!",
    "💡 Совет дня: Замачивайте крупные семена (подсолнечник, горох) на 8-12 часов перед посевом.",
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

{product.get('description', 'Премиум качество для вашей фермы.')}

💰 <b>{price} UZS</b>

🛒 Заказать: @Microgreenuzbekistan_bot
🌐 Сайт: microgreenuzbekistan.com/shop"""
    
    return await post_to_channel(text, product.get('image'))

async def post_daily_tip(day_of_week: int) -> dict:
    """Posts the daily tip based on day of week (0=Monday)."""
    tip = DAILY_TIPS[day_of_week % len(DAILY_TIPS)]
    
    text = f"""🌱 <b>AgroTech Ecosystem</b>

{tip}

📚 Больше советов: @Microgreenuzbekistan_bot"""
    
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

Это сообщество городских фермеров AgroTech Ecosystem 🌱

📌 <b>Правила:</b>
• Будьте вежливы
• Делитесь опытом и фото
• Задавайте вопросы

🤖 AI-агроном: @Microgreenuzbekistan_bot
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
    "доставка": "🚚 Доставка по Ташкенту: бесплатно от 100,000 UZS\nПо Узбекистану: через Pony Express",
    "заказ": "🛒 Заказать можно:\n• Через бота: @Microgreenuzbekistan_bot\n• На сайте: microgreenuzbekistan.com/shop",
    "семена": "🌱 Семена для микрозелени в каталоге: microgreenuzbekistan.com/shop?category=seeds",
    "оборудование": "⚙️ LED-лампы, pH-метры, Tower Garden: microgreenuzbekistan.com/shop?category=equipment",
}
