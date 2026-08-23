"""
🌱 MICROGREEN UZBEKISTAN — GROUP HANDLER

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
from services.config_service import fetch_site_config
from services.lang_storage import lang_of
from shared.i18n import t
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


# Photo handler MUST be registered before the catch-all text handler
# otherwise photos with captions get consumed by handle_group_message first.
@router.message(F.chat.type.in_({"group", "supergroup"}), F.photo)
async def handle_group_photo(message: Message):
    """Encourage plant photo diagnosis"""
    lang = lang_of(message)
    
    # Check if photo has plant-related caption
    caption = (message.caption or "").lower()
    plant_words = ["растен", "микрозелен", "лист", "рассад", "болезн", "желт", "пятн"]
    
    if any(word in caption for word in plant_words):
        await message.reply(
            t("group.photo_hint", lang)
        )


# FAQ patterns and responses.
#
# `{payment}` подставляется при ответе из настроек витрины: раньше здесь
# литералом стояло «наличные, Click, Payme», и отключить способ оплаты в
# админке было нельзя — бот продолжал его обещать.
FAQ_PATTERNS = {
    r"(цен|стои|почём|сколько)": {
        "answer": "💰 Актуальные цены на сайте: microgreenuzbekistan.com/catalog\nИли напишите боту: @Microgreenuzbekistan_bot",
        "keywords": ["цена", "стоимость", "почём", "сколько"]
    },
    r"(доставк|привез|курьер)": {
        "answer": "🚚 Доставка: <b>Самарканд — в день заказа, Ташкент — на следующий день</b>\nОплата: {payment}",
        "keywords": ["доставка", "привезти", "курьер"]
    },
    r"(заказ|купить|оформ)": {
        "answer": "🛒 Заказать можно:\n• Через бота: @Microgreenuzbekistan_bot\n• На сайте: microgreenuzbekistan.com/catalog\n• В Mini App: t.me/Microgreenuzbekistan_bot/game",
        "keywords": ["заказ", "купить", "оформить"]
    },
    r"(семен|посев|сажать)": {
        "answer": "🌱 Семена для микрозелени в каталоге:\nmicrogreenuzbekistan.com/catalog?category=seeds\n\nТоп-5: редис, подсолнечник, горох, руккола, брокколи",
        "keywords": ["семена", "посев", "сажать"]
    },
    # Акции здесь не называем: BOGO на LED-панели была вписана в текст
    # намертво и обещала скидку, которой нет ни в промокодах, ни в каталоге.
    r"(оборудован|лампа|стеллаж|гидропон)": {
        "answer": "⚙️ LED-лампы, pH-метры, Tower Garden:\nmicrogreenuzbekistan.com/catalog?category=equipment",
        "keywords": ["оборудование", "лампа", "стеллаж", "гидропоника"]
    },
    # Курса EcoPoints к скидке в коде нет — обмена монет на баллы не существует.
    r"(игр|farmsim|бонус|очки)": {
        "answer": "🎮 <b>Farm Simulator</b> — играйте и получайте бонусы!\n\nОткрыть: t.me/Microgreenuzbekistan_bot/game",
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


# Кэш username бота (чтобы не дёргать API на каждое сообщение)
_BOT_USERNAME = None


async def _is_addressed(message: Message) -> bool:
    """Бот отвечает в группе ТОЛЬКО когда к нему обратились явно:
    @упоминание или реплай на его сообщение. Иначе — молчит (не шумит в чужих
    диалогах и в служебных группах AI-офиса)."""
    global _BOT_USERNAME
    if _BOT_USERNAME is None:
        try:
            _BOT_USERNAME = (await message.bot.me()).username or ""
        except Exception:
            _BOT_USERNAME = ""
    text_lower = (message.text or "").lower()
    if _BOT_USERNAME and f"@{_BOT_USERNAME.lower()}" in text_lower:
        return True
    r = message.reply_to_message
    if r and r.from_user and message.bot.id and r.from_user.id == message.bot.id:
        return True
    return False


@router.message(F.chat.type.in_({"group", "supergroup"}))
async def handle_group_message(message: Message):
    """Handle messages in group - FAQ and AI routing (только по прямому обращению)."""
    lang = lang_of(message)
    # Log group message for debugging
    logger.info(f"📢 GROUP: chat_id={message.chat.id}, title='{message.chat.title}', from={message.from_user.id}")

    if not message.text:
        return

    text_lower = message.text.lower()

    if text_lower.startswith("степан"):
        return

    # Отвечаем ТОЛЬКО если обратились именно к этому боту (по адресу).
    if not await _is_addressed(message):
        return

    # Check FAQ patterns
    for pattern, faq in FAQ_PATTERNS.items():
        if re.search(pattern, text_lower):
            answer = faq["answer"]
            if "{payment}" in answer:
                config = await fetch_site_config()
                answer = answer.replace("{payment}", config.payment_text)
            await message.reply(answer)
            return

    # К боту обратились — маршрутизируем в AI.
    if True:
        # Route to AI
        try:
            # Get AI response (async)
            response = await get_ai_response(
                message.text,
                system_context="Ты AI-помощник Microgreen Uzbekistan. "
                              "Отвечай кратко и по делу на русском. "
                              "Если вопрос про заказ — направляй на @Microgreenuzbekistan_bot"
            )
            
            if response:
                await message.reply(
                    t("group.ai_reply", lang, answer=response)
                )
        except Exception as e:
            # Fallback if AI fails. Пользователю — честное «недоступен», но и
            # в лог обязательно: иначе отказ ИИ в группе не виден никому, а
            # клиент просто перестаёт получать ответы.
            logger.error("AI-помощник не ответил в группе: %s", e, exc_info=True)
            await message.reply(
                t("group.ai_unavailable", lang)
            )

