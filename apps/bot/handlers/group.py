"""
🌱 AGROTECH ECOSYSTEM — GROUP HANDLER

Handles Telegram Group events:
- New member welcome
- FAQ auto-responder  
- Basic moderation
- AI question routing
"""

from aiogram import Router, F
from aiogram.types import Message, ChatMemberUpdated
from aiogram.filters import ChatMemberUpdatedFilter, IS_MEMBER, IS_NOT_MEMBER
import re

from services.crosspost_service import welcome_to_group
from services.ai_service import get_ai_response
import logging

router = Router()
logger = logging.getLogger(__name__)


# Command to get chat ID - works in groups
@router.message(F.text == "/chatid")
async def cmd_chatid(message: Message):
    """Return chat ID for any chat"""
    await message.answer(
        f"📍 <b>Chat Info</b>\n\n"
        f"Chat ID: <code>{message.chat.id}</code>\n"
        f"Chat Type: {message.chat.type}\n"
        f"Title: {message.chat.title or 'N/A'}",
        parse_mode="HTML"
    )
    logger.debug(f"CHATID COMMAND: {message.chat.id}")


# NOTE: Group message logging is now merged into handle_group_message below
# to avoid shadowing FAQ and AI handlers.


# FAQ patterns and responses
FAQ_PATTERNS = {
    r"(цен|стои|почём|сколько)": {
        "answer": "💰 Актуальные цены на сайте: microgreenuzbekistan.com/shop\nИли напишите боту: @Microgreenuzbekistan_bot",
        "keywords": ["цена", "стоимость", "почём", "сколько"]
    },
    r"(доставк|привез|курьер)": {
        "answer": "🚚 Доставка по Ташкенту: <b>бесплатно от 100,000 UZS</b>\nПо Узбекистану: через Pony Express",
        "keywords": ["доставка", "привезти", "курьер"]
    },
    r"(заказ|купить|оформ)": {
        "answer": "🛒 Заказать можно:\n• Через бота: @Microgreenuzbekistan_bot\n• На сайте: microgreenuzbekistan.com/shop\n• В Mini App: t.me/Microgreenuzbekistan_bot/game",
        "keywords": ["заказ", "купить", "оформить"]
    },
    r"(семен|посев|сажать)": {
        "answer": "🌱 Семена для микрозелени в каталоге:\nmicrogreenuzbekistan.com/shop?category=seeds\n\nТоп-5: редис, подсолнечник, горох, руккола, брокколи",
        "keywords": ["семена", "посев", "сажать"]
    },
    r"(оборудован|лампа|стеллаж|гидропон)": {
        "answer": "⚙️ LED-лампы, pH-метры, Tower Garden:\nmicrogreenuzbekistan.com/shop?category=equipment\n\nBOGO-акция на LED панели!",
        "keywords": ["оборудование", "лампа", "стеллаж", "гидропоника"]
    },
    r"(игр|farmsim|бонус|очки)": {
        "answer": "🎮 <b>Farm Simulator</b> — играйте и получайте бонусы!\n\nОткрыть: t.me/Microgreenuzbekistan_bot/game\n\n💎 1000 EcoPoints = 10,000 UZS скидка!",
        "keywords": ["игра", "farmsim", "бонусы", "очки"]
    },
}


@router.chat_member(ChatMemberUpdatedFilter(IS_NOT_MEMBER >> IS_MEMBER))
async def on_new_member(event: ChatMemberUpdated):
    """Welcome new members to the group"""
    user = event.new_chat_member.user
    
    if user.is_bot:
        return  # Skip bots
    
    user_name = user.full_name or user.username or "друг"
    await welcome_to_group(user_name, str(event.chat.id))


@router.message(F.chat.type.in_({"group", "supergroup"}))
async def handle_group_message(message: Message):
    """Handle messages in group - FAQ and AI routing"""
    # Log group message for debugging
    logger.info(f"📢 GROUP: chat_id={message.chat.id}, title='{message.chat.title}', from={message.from_user.id}")
    
    if not message.text:
        return
    
    text_lower = message.text.lower()
    
    # Check FAQ patterns
    for pattern, faq in FAQ_PATTERNS.items():
        if re.search(pattern, text_lower):
            # Reply with FAQ answer
            await message.reply(faq["answer"])
            return
    
    # Check if message mentions AI/bot directly
    ai_triggers = ["@microgreenuzbekistan_bot", "бот", "ai", "ии", "помоги", "подскажи", "вопрос"]
    
    if any(trigger in text_lower for trigger in ai_triggers):
        # Route to AI
        try:
            # Get AI response (async)
            response = await get_ai_response(
                message.text,
                system_context="Ты AI-агроном AgroTech Ecosystem. "
                              "Отвечай кратко и по делу на русском. "
                              "Если вопрос про заказ — направляй на @Microgreenuzbekistan_bot"
            )
            
            if response:
                await message.reply(
                    f"🤖 <b>AI-Агроном:</b>\n\n{response}\n\n"
                    f"💬 Больше вопросов? @Microgreenuzbekistan_bot"
                )
        except Exception as e:
            # Fallback if AI fails
            await message.reply(
                "🤖 AI-агроном временно недоступен.\n"
                "Напишите напрямую боту: @Microgreenuzbekistan_bot"
            )


@router.message(F.chat.type.in_({"group", "supergroup"}), F.photo)
async def handle_group_photo(message: Message):
    """Encourage plant photo diagnosis"""
    
    # Check if photo has plant-related caption
    caption = (message.caption or "").lower()
    plant_words = ["растен", "микрозелен", "лист", "рассад", "болезн", "желт", "пятн"]
    
    if any(word in caption for word in plant_words):
        await message.reply(
            "📸 Хотите диагностику растения?\n\n"
            "Отправьте это фото боту @Microgreenuzbekistan_bot\n"
            "AI-Агроном проанализирует и даст рекомендации! 🌱"
        )
