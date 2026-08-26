"""
🛒 AI-ПРОДАВЕЦ витрины — полная интеграция с API

AI-помощник клиента в Telegram: подбирает микрозелень по блюду и вкусу,
советует рецепты, разбирает фото еды и оформляет заказ. Отвечает через единый
API `/api/ai/chat`.

⚠️ ЭТО НЕ АГРОНОМ. Файл назывался `agronomist.py`, и это было не описание, а
приглашение к ошибке: клиенты микрозелень покупают, а не выращивают, и советы
про замачивание семян и грунт им не нужны. Системный промпт продавца прямо
запрещает такие ответы («Ты НЕ агроном» — services/ai_service.py), то есть имя
файла спорило с содержимым.

Прежние `callback_data` («agronomist», «agronomist:photo_hint»…) намеренно
оставлены рабочими в handlers/unified.py: они уже разосланы клиентам кнопками,
и переименование сделало бы старые кнопки молчащими.
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
from services.ai_service import analyze_image, transcribe_audio
from services.config_service import fetch_site_config
from shared.constants import CATEGORY_LABELS, format_price
from shared.i18n import t
from services.lang_storage import lang_of


router = Router()
logger = logging.getLogger(__name__)

# API URL
WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")


# ==================== AI CHAT INTEGRATION ====================

async def ask_ai(message: str, user_id: int, history: list = None) -> dict:
    """Отправить сообщение в AI API.

    Ответ витрины — `{reply, source, timestamp}`. Ключ ответа тут ровно один и
    называется `reply`: раньше обработчик читал `response`, которого витрина
    никогда не отдавала, и каждое сообщение в личку получало «Ошибка AI».
    Контракт закреплён тестом `tests/test_api_contract.py`.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{WEB_API_URL}/ai/chat",
                json={
                    "message": message,
                    "history": history or [],
                    "source": "bot",
                    # Именно telegramId: раньше сюда клался Telegram ID под
                    # именем `userId`, а витрина ищет по cuid — персонализация
                    # не срабатывала ни разу.
                    "telegramId": str(user_id),
                }
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("reply"):
                    return data
                # Витрина ответила 200 без текста — для клиента это тот же отказ.
                logger.error("AI API returned 200 without 'reply': %s", sorted(data))
                return {"reply": "Извините, AI временно недоступен.", "error": True}
            else:
                logger.error(f"AI API error: {response.status_code}")
                return {"reply": "Извините, AI временно недоступен.", "error": True}
    except Exception as e:
        logger.error(f"AI request failed: {e}")
        return {"reply": "Ошибка соединения с AI.", "error": True}


# История разговора живёт в Redis (services/chat_history.py), а не в словаре
# процесса: словарь обнулялся каждым деплоем, и клиент, уже описавший своё
# блюдо, после рестарта разговаривал с собеседником, впервые о нём слышащим.
from services.chat_history import add_to_history, clear_history, get_history  # noqa: E402


# ==================== HANDLERS ====================

@router.message(Command("ai"))
async def cmd_ai(message: Message):
    """Команда /ai — начать разговор с AI"""
    lang = lang_of(message)
    await message.answer(
        t("ai.listening", lang)
    )


@router.message(Command("clear"))
async def cmd_clear(message: Message):
    """Очистить историю разговора"""
    lang = lang_of(message)
    clear_history(message.from_user.id)
    await message.answer(t("ai.history_cleared", lang))


@router.message(F.chat.type == "private", F.photo)
async def handle_photo(message: Message):
    """Diagnose plant or analyze image"""
    lang = lang_of(message)
    
    # 1. Download photo
    photo = message.photo[-1] # Highest resolution
    file_id = photo.file_id
    
    status_msg = await message.answer(t("ai.photo_analyzing", lang))
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
                
        # Кнопка «Главное меню» — на КАЖДОМ ответе.
        #
        # ИИ перехватывает любой текст в личке, и выйти из разговора можно
        # было только командой /start, про которую он сам никогда не
        # говорит. Человек писал «меню», «назад», «стоп» — и получал
        # очередной ответ ИИ.
        buttons.append([
            InlineKeyboardButton(text=t("btn.home", lang), callback_data="menu:main")
        ])
        markup = InlineKeyboardMarkup(inline_keyboard=buttons)
        
        # Пустой ответ бывает: модель вернула только теги кнопок, и после
        # их вырезания не осталось ничего. `answer("")` — это
        # TelegramBadRequest, а заглушку «Думаю…» к этому моменту уже
        # удалили: клиент получал полную тишину.
        await message.answer(
            clean_response or t("ai.empty", lang),
            parse_mode="HTML",
            reply_markup=markup,
        )
        
    except Exception as e:
        logger.error(f"Photo analysis failed: {e}")
        await status_msg.edit_text(t("ai.photo_error", lang))


@router.message(F.chat.type == "private", F.voice | F.audio)
async def handle_voice(message: Message):
    """Transcribe and answer voice message, then reply with Voice (TTS)"""
    lang = lang_of(message)
    from aiogram.types import BufferedInputFile
    from services.tts_service import generate_speech
    
    status_msg = await message.answer(t("ai.voice_listening", lang))
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
        await status_msg.edit_text(t("ai.voice_recording", lang))
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
                
        # Кнопка «Главное меню» — на КАЖДОМ ответе.
        #
        # ИИ перехватывает любой текст в личке, и выйти из разговора можно
        # было только командой /start, про которую он сам никогда не
        # говорит. Человек писал «меню», «назад», «стоп» — и получал
        # очередной ответ ИИ.
        buttons.append([
            InlineKeyboardButton(text=t("btn.home", lang), callback_data="menu:main")
        ])
        markup = InlineKeyboardMarkup(inline_keyboard=buttons)
        
        # Send text
        # Пустой ответ бывает: модель вернула только теги кнопок, и после
        # их вырезания не осталось ничего. `answer("")` — это
        # TelegramBadRequest, а заглушку «Думаю…» к этому моменту уже
        # удалили: клиент получал полную тишину.
        await message.answer(
            clean_response or t("ai.empty", lang),
            parse_mode="HTML",
            reply_markup=markup,
        )
        
        # Send voice if generated successfully
        if audio_bytes:
            voice_file = BufferedInputFile(audio_bytes, filename="answer.mp3")
            await message.answer_voice(voice_file)
            
    except Exception as e:
        logger.error(f"Voice analysis failed: {e}")
        await status_msg.edit_text(t("ai.voice_error", lang))


@router.message(F.chat.type == "private", F.text & ~F.text.startswith("/"))
async def handle_ai_message(message: Message):
    """Обработка всех текстовых сообщений через AI"""
    lang = lang_of(message)
    user_id = message.from_user.id
    user_text = message.text.strip()
    
    if not user_text:
        return
    
    status_msg = await message.answer(t("ai.thinking", lang))
    await message.bot.send_chat_action(message.chat.id, "typing")
    
    # 1. Get AI Response via Web API (includes weather, currency, order context)
    history = get_history(user_id)
    ai_result = await ask_ai(user_text, user_id, history)
    ai_response = ai_result["reply"]

    # Обе реплики — вопрос и ответ. Половина обмена в истории хуже целого
    # отсутствия: модель видит вопрос без ответа и отвечает на него второй раз.
    add_to_history(user_id, "user", user_text)
    add_to_history(user_id, "assistant", ai_response)
    
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
                        
                        # Ответ витрины — `{success, order: {id, orderNumber, …}}`.
                        # Проверялось `"id" in result`, то есть ключ верхнего
                        # уровня, которого там нет: условие не выполнялось
                        # никогда. Из-за этого JSON-блок НЕ вырезался из
                        # ответа, и клиент получал в чат сырой
                        # `{"action": "create_order", …}` со своим телефоном и
                        # адресом — а заказ при этом был создан.
                        created = (result or {}).get("order") or {}
                        if created.get("orderNumber"):
                            order_id = created["orderNumber"]
                            order_created = True
                            ai_response = ai_response.replace(match.group(0), "").strip()
                            if not ai_response:
                                ai_response = f"✅ Заказ #{order_id} успешно создан!"
                        else:
                            # Заказ не создан — но JSON клиенту показывать всё
                            # равно нельзя.
                            ai_response = ai_response.replace(match.group(0), "").strip()
                            logger.error("Витрина не приняла заказ из чата: %s", result)
        except Exception as e:
            logger.error(f"Order creation from AI response failed: {e}")

    # 3. Reply
    try:
        await status_msg.delete()
    except Exception as e:
        # Сообщение «Думаю…» могли удалить руками — на ответ это не влияет.
        logger.debug("Не удалось убрать статусное сообщение: %s", e)


    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
    buttons = []
    matches = re.findall(r'\[BUTTON:(.*?)\|(.*?)\]', ai_response)
    clean_response = re.sub(r'\[BUTTON:.*?\|.*?\]', '', ai_response).strip()
    
    for name, url in matches:
        if "microgreenuzbekistan.com" in url:
            buttons.append([InlineKeyboardButton(text=name.strip(), web_app=WebAppInfo(url=url.strip()))])
        else:
            buttons.append([InlineKeyboardButton(text=name.strip(), url=url.strip())])
            
    # Кнопка «Главное меню» — на КАЖДОМ ответе.
    #
    # ИИ перехватывает любой текст в личке, и выйти из разговора можно
    # было только командой /start, про которую он сам никогда не
    # говорит. Человек писал «меню», «назад», «стоп» — и получал
    # очередной ответ ИИ.
    buttons.append([
        InlineKeyboardButton(text=t("btn.home", lang), callback_data="menu:main")
    ])
    markup = InlineKeyboardMarkup(inline_keyboard=buttons)
    
    # Пустой ответ бывает: модель вернула только теги кнопок, и после
    # их вырезания не осталось ничего. `answer("")` — это
    # TelegramBadRequest, а заглушку «Думаю…» к этому моменту уже
    # удалили: клиент получал полную тишину.
    await message.answer(
        clean_response or t("ai.empty", lang),
        parse_mode="HTML",
        reply_markup=markup,
    )
    
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
    lang = lang_of(message)
    try:
        products = await bridge.get_products(limit=50)
        
        # Group by category
        categories = {}
        for p in products:
            cat = p.get("category") or "other"
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(p)

        # Перечисляем ВСЕ категории каталога по слагам. Здесь был жёсткий
        # список `["MICROGREENS", "SEEDS", "KITS"]`: таких слагов не существует
        # (реальные — `microgreens`, `seeds`, `sets`), поэтому цены не
        # показывались ни разу, а «KITS» не был категорией никогда.
        text = "💰 <b>Наши цены:</b>\n\n"
        for cat_key in CATEGORY_LABELS:
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
            t("ai.prices", lang)
        )


@router.message(Command("order", "заказать"))
async def cmd_order(message: Message):
    """Начать оформление заказа"""
    lang = lang_of(message)
    await message.answer(
        # prompt-ok: образец формата телефона для клиента, а не контакт компании
        t("ai.order_help", lang)
    )


@router.message(Command("delivery", "доставка"))
async def cmd_delivery(message: Message):
    """Информация о доставке"""
    lang = lang_of(message)
    # Способы оплаты — из настроек витрины: перечислять их литералами значило
    # обещать то, что владелец мог отключить в админке час назад.
    config = await fetch_site_config()
    await message.answer(
        t("ai.delivery", lang, payment=config.payment_text)
    )
