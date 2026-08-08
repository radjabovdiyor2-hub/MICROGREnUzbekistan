"""
🤖 AI AGRONOMIST — Полная интеграция с API

AI-помощник для Telegram бота.
Использует единый API /api/ai/chat для ответов и создания заказов.
"""

import os
import httpx
from aiogram import Router, F
from aiogram.types import Message
from aiogram.filters import Command
import logging
import json
import re

from services.ecosystem_bridge import bridge
from shared.constants import CATEGORY_LABELS, format_price

router = Router()
logger = logging.getLogger(__name__)

# API URL
WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")


# ==================== AI CHAT INTEGRATION ====================

async def ask_ai(message: str, user_id: int, history: list = None) -> dict:
    """Отправить сообщение в AI API"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{WEB_API_URL}/ai/chat",
                json={
                    "message": message,
                    "history": history or [],
                    "source": "bot",
                    "userId": str(user_id),
                }
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"AI API error: {response.status_code}")
                return {"response": "Извините, AI временно недоступен.", "error": True}
    except Exception as e:
        logger.error(f"AI request failed: {e}")
        return {"response": "Ошибка соединения с AI.", "error": True}


# Храним историю разговоров (в памяти, для production используйте Redis)
conversation_history: dict[int, list] = {}


def get_history(user_id: int) -> list:
    """Получить историю разговора пользователя"""
    return conversation_history.get(user_id, [])[-10:]  # Последние 10 сообщений


def add_to_history(user_id: int, role: str, content: str):
    """Добавить сообщение в историю"""
    if user_id not in conversation_history:
        conversation_history[user_id] = []
    conversation_history[user_id].append({"role": role, "content": content})
    # Ограничиваем историю
    if len(conversation_history[user_id]) > 20:
        conversation_history[user_id] = conversation_history[user_id][-20:]


# ==================== HANDLERS ====================

@router.message(Command("ai"))
async def cmd_ai(message: Message):
    """Команда /ai — начать разговор с AI"""
    await message.answer(
        "🤖 <b>Слушаю вас!</b>\n\n"
        "Пишите мне всё, что угодно. Я могу:\n"
        "• 🥗 Подобрать микрозелень по вкусу и блюду\n"
        "• 🛒 Оформить заказ прямо здесь\n"
        "• 🍽️ Подсказать рецепт с микрозеленью\n"
        "• 📸 Проанализировать фото вашего блюда\n\n"
        "<i>Чем могу помочь сегодня?</i>"
    )


@router.message(Command("clear"))
async def cmd_clear(message: Message):
    """Очистить историю разговора"""
    user_id = message.from_user.id
    if user_id in conversation_history:
        conversation_history[user_id] = []
    await message.answer("🧹 История разговора очищена!")


from aiogram.types import ContentType
from services.ai_service import get_ai_response, analyze_image, transcribe_audio

@router.message(F.chat.type == "private", F.photo)
async def handle_photo(message: Message):
    """Diagnose plant or analyze image"""
    
    # 1. Download photo
    photo = message.photo[-1] # Highest resolution
    file_id = photo.file_id
    
    status_msg = await message.answer("⏳ <i>Нейросеть изучает ваше фото... Это займет пару секунд</i> ✨")
    await message.bot.send_chat_action(message.chat.id, "upload_photo")
    
    try:
        # Download file to memory
        file_info = await message.bot.get_file(file_id)
        file_path = file_info.file_path
        
        # Download bytes
        image_io = await message.bot.download_file(file_path)
        image_bytes = image_io.read()
        
        # 2. Analyze
        user_text = message.caption or ""
        response = await analyze_image(image_bytes, user_text)
        
        await status_msg.delete()
        
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
        import re
        buttons = []
        matches = re.findall(r'\[BUTTON:(.*?)\|(.*?)\]', response)
        clean_response = re.sub(r'\[BUTTON:.*?\|.*?\]', '', response).strip()
        
        for name, url in matches:
            if "microgreenuzbekistan.com" in url:
                buttons.append([InlineKeyboardButton(text=name.strip(), web_app=WebAppInfo(url=url.strip()))])
            else:
                buttons.append([InlineKeyboardButton(text=name.strip(), url=url.strip())])
                
        markup = InlineKeyboardMarkup(inline_keyboard=buttons) if buttons else None
        
        await message.answer(clean_response, parse_mode="HTML", reply_markup=markup)
        
    except Exception as e:
        logger.error(f"Photo analysis failed: {e}")
        await status_msg.edit_text("❌ Ошибка при анализе фото. Попробуйте позже.")


@router.message(F.chat.type == "private", F.voice | F.audio)
async def handle_voice(message: Message):
    """Transcribe and answer voice message, then reply with Voice (TTS)"""
    from aiogram.types import BufferedInputFile
    from services.tts_service import generate_speech
    
    status_msg = await message.answer("🎧 <i>Слушаю и перевожу в текст...</i> ⏳")
    await message.bot.send_chat_action(message.chat.id, "record_voice")
    
    try:
        # 1. Download voice
        voice = message.voice or message.audio
        file_id = voice.file_id
        
        file_info = await message.bot.get_file(file_id)
        file_path = file_info.file_path
        
        voice_io = await message.bot.download_file(file_path)
        voice_bytes = voice_io.read()
        
        # 2. Transcribe & Answer via AI
        response_text = await transcribe_audio(voice_bytes)
        
        # 3. Text to Speech
        await status_msg.edit_text("🗣 <i>Записываю голосовой ответ...</i> 🎙")
        await message.bot.send_chat_action(message.chat.id, "record_voice")
        
        audio_bytes = await generate_speech(response_text)
        
        await status_msg.delete()
        
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
        import re
        buttons = []
        matches = re.findall(r'\[BUTTON:(.*?)\|(.*?)\]', response_text)
        clean_response = re.sub(r'\[BUTTON:.*?\|.*?\]', '', response_text).strip()
        
        for name, url in matches:
            if "microgreenuzbekistan.com" in url:
                buttons.append([InlineKeyboardButton(text=name.strip(), web_app=WebAppInfo(url=url.strip()))])
            else:
                buttons.append([InlineKeyboardButton(text=name.strip(), url=url.strip())])
                
        markup = InlineKeyboardMarkup(inline_keyboard=buttons) if buttons else None
        
        # Send text
        await message.answer(clean_response, parse_mode="HTML", reply_markup=markup)
        
        # Send voice if generated successfully
        if audio_bytes:
            voice_file = BufferedInputFile(audio_bytes, filename="answer.mp3")
            await message.answer_voice(voice_file)
            
    except Exception as e:
        logger.error(f"Voice analysis failed: {e}")
        await status_msg.edit_text("❌ Ошибка обработки голосового. Попробуйте позже.")




@router.message(F.chat.type == "private", F.text & ~F.text.startswith("/"))
async def handle_ai_message(message: Message):
    """Обработка всех текстовых сообщений через AI"""
    user_id = message.from_user.id
    user_text = message.text.strip()
    
    if not user_text:
        return
    
    status_msg = await message.answer("🧠 <i>Думаю над ответом...</i> ✨")
    await message.bot.send_chat_action(message.chat.id, "typing")
    
    # 1. Get AI Response via Web API (includes weather, currency, order context)
    history = conversation_history.get(user_id, [])[-10:]  # Last 10 messages
    ai_result = await ask_ai(user_text, user_id, history)
    ai_response = ai_result.get("response", "Ошибка AI")
    
    # Save to conversation history
    if user_id not in conversation_history:
        conversation_history[user_id] = []
    conversation_history[user_id].append({"role": "user", "content": user_text})
    conversation_history[user_id].append({"role": "assistant", "content": ai_response})
    # Keep last 20 entries max
    if len(conversation_history[user_id]) > 20:
        conversation_history[user_id] = conversation_history[user_id][-20:]
    
    # 2. Check if order was created by the API
    order_created = ai_result.get("orderCreated", False)
    order_id = ai_result.get("orderId")
    
    if not order_created and not ai_result.get("error"):
        # Only try to parse if AI response explicitly contains order action
        # AND the API didn't already create the order
        try:
            if '"action": "create_order"' in ai_response or '"action":"create_order"' in ai_response:
                match = re.search(r'\{[\s\S]*"action":\s*"create_order"[\s\S]*\}', ai_response)
                if match:
                    order_data = json.loads(match.group(0))
                    if "order" in order_data:
                        order_info = order_data["order"]
                        
                        result = await bridge.create_order(
                            customer_name=order_info.get("name", "") or message.from_user.full_name,
                            customer_phone=order_info.get("phone", ""),
                            customer_address=order_info.get("address", "") or "Уточнить по телефону",
                            items=order_info.get("items", []),
                            telegram_id=user_id
                        )
                        
                        if "id" in result:
                            order_id = result["id"]
                            order_created = True
                            ai_response = ai_response.replace(match.group(0), "").strip()
                            if not ai_response:
                                ai_response = f"✅ Заказ #{order_id[-6:]} успешно создан!"
        except Exception as e:
            logger.error(f"Order creation from AI response failed: {e}")

    # 3. Reply
    try:
        await status_msg.delete()
    except:
        pass
        
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
    buttons = []
    matches = re.findall(r'\[BUTTON:(.*?)\|(.*?)\]', ai_response)
    clean_response = re.sub(r'\[BUTTON:.*?\|.*?\]', '', ai_response).strip()
    
    for name, url in matches:
        if "microgreenuzbekistan.com" in url:
            buttons.append([InlineKeyboardButton(text=name.strip(), web_app=WebAppInfo(url=url.strip()))])
        else:
            buttons.append([InlineKeyboardButton(text=name.strip(), url=url.strip())])
            
    markup = InlineKeyboardMarkup(inline_keyboard=buttons) if buttons else None
    
    await message.answer(clean_response, parse_mode="HTML", reply_markup=markup)
    
    if order_created:
        phone_info = ""
        try:
            # Extract phone from order data for admin notification
            json_match = re.search(r'"phone"\s*:\s*"([^"]+)"', ai_response)
            if json_match:
                phone_info = f"\n📱 {json_match.group(1)}"
        except Exception:
            pass
        await bridge.notify_admins(
            f"🛒 <b>Новый заказ (AI Bot)</b>\n"
            f"👤 {message.from_user.full_name}{phone_info}\n"
            f"🆔 #{order_id[-6:]}"
        )



# ==================== QUICK COMMANDS ====================

@router.message(Command("price", "prices", "цены"))
async def cmd_prices(message: Message):
    """Цены из каталога — динамический fetch"""
    try:
        products = await bridge.get_products(limit=50)
        
        # Group by category
        categories = {}
        for p in products:
            cat = p.get("category", "OTHER")
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(p)
        
        text = "💰 <b>Наши цены:</b>\n\n"
        for cat_key in ["MICROGREENS", "SEEDS", "KITS"]:
            items = categories.get(cat_key, [])
            if items:
                text += f"<b>{CATEGORY_LABELS.get(cat_key, cat_key)}:</b>\n"
                for item in items[:5]:
                    price = int(item.get("price", 0))
                    text += f"• {item['title']} — {format_price(price)} сум\n"
                text += "\n"
        
        text += "🚚 Доставка: Самарканд — в день заказа, Ташкент — на следующий день"
        await message.answer(text, parse_mode="HTML")
        
    except Exception as e:
        logger.error(f"Price fetch failed: {e}")
        await message.answer(
            "💰 Актуальные цены на сайте:\n"
            "🌐 microgreenuzbekistan.com/shop"
        )


@router.message(Command("order", "заказать"))
async def cmd_order(message: Message):
    """Начать оформление заказа"""
    await message.answer(
        "🛒 <b>Оформление заказа</b>\n\n"
        "Просто напишите мне, что хотите заказать, и номер телефона. Например:\n\n"
        "<i>«Хочу 2 лотка подсолнечника и 1 горох. "
        "Телефон: +998901234567»</i>\n\n"
        "Дальше я сделаю всё сам! Адрес и детали мы уточним по телефону 📞\n\n"
        "👨‍🌾 Жду список ваших пожеланий!"
    )


@router.message(Command("delivery", "доставка"))
async def cmd_delivery(message: Message):
    """Информация о доставке"""
    await message.answer(
        "🚚 <b>Доставка</b>\n\n"
        "📍 Самарканд — <b>в день заказа</b>\n"
        "📍 Ташкент — <b>на следующий день</b>\n"
        "⏰ Минимальный заказ: нет\n\n"
        "💳 <b>Оплата:</b>\n"
        "• Наличные при получении\n"
        "• Click\n"
        "• Payme\n"
        "• Перевод / договор (юр. лица)"
    )
