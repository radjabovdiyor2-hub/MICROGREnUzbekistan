import os
import base64
import time
import httpx
from dotenv import load_dotenv
from pathlib import Path

# Load env
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path, override=True)

import logging
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")

# ==================== PRODUCT CATALOG ====================

_catalog_cache = {"text": "", "timestamp": 0}
CATALOG_TTL = 300  # 5 minutes

from shared.constants import CATEGORY_LABELS as _BASE_LABELS

# Extend base labels with additional product categories (for AI catalog context)
CATEGORY_LABELS = {
    **_BASE_LABELS,
    "VEGETABLES": "🥕 Овощи",
    "FRUITS": "🍓 Фрукты",
    "HERBS": "🌿 Зелень",
    "MUSHROOMS": "🍄 Грибы",
    "SPROUTS": "🌾 Проростки",
    "BERRIES": "🫐 Ягоды",
}


async def _load_product_catalog() -> str:
    """Load products from API and format as catalog text"""
    now = time.time()
    if _catalog_cache["text"] and now - _catalog_cache["timestamp"] < CATALOG_TTL:
        return _catalog_cache["text"]
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{WEB_API_URL}/products")
            if resp.status_code != 200:
                return _catalog_cache.get("text", "")
            products = resp.json()
        
        if not isinstance(products, list) or not products:
            return ""
        
        # Group by category
        grouped = {}
        for p in products:
            cat = p.get("category", "OTHER")
            if cat not in grouped:
                grouped[cat] = []
            grouped[cat].append(p)
        
        catalog = f"\n══ КАТАЛОГ ({len(products)} товаров) ══\n"
        for cat, items in grouped.items():
            label = CATEGORY_LABELS.get(cat, cat)
            catalog += f"\n{label}:\n"
            for item in items:
                price = f"{item['price']:,.0f}".replace(",", " ")
                stock = "✅" if item.get("inStock") else "❌"
                desc = (item.get("description") or "")[:60]
                catalog += f"  • {item['title']} | {price} сум | {stock}"
                if desc:
                    catalog += f" — {desc}"
                catalog += "\n"
        
        catalog += "\n🚚 Доставка по Ташкенту — БЕСПЛАТНО\n"
        
        _catalog_cache["text"] = catalog
        _catalog_cache["timestamp"] = now
        logger.info(f"Catalog loaded: {len(products)} products")
        return catalog
    except Exception as e:
        logger.error(f"Catalog load error: {e}")
        return _catalog_cache.get("text", "")


# ==================== SYSTEM PROMPT ====================

SYSTEM_PROMPT_BASE = """Ты — премиальный AI-ассистент экосистемы AgroTech Ecosystem (Microgreen Uzbekistan).
Твоя роль: 
1. 🌿 Эксперт-агроном (микрозелень, гидропоника, аэропоника, вертикальные фермы, диагностика по фото).
2. 🤖 Универсальный помощник (поддерживаешь любые темы: погода, новости, философия, юмор).
3. 📦 Менеджер заказов (помогаешь выбрать и купить продукцию и оборудование).
4. 🛒 Продавец-консультант — знаешь ВСЕ товары. Предлагай подходящие товары с ценами!

ТВОЙ СТИЛЬ (ОБЯЗАТЕЛЬНО):
- 💰 ВАЖНО: Мы работаем ТОЛЬКО в Узбекских сумах (сум, UZS). НИКОГДА не используй рубли или другие валюты!
- 🎨 Красивое оформление: Используй жирный текст, списки, много подходящих эмодзи (🌿✨🍅🦠💧). Делай ответ структурированным, интересным и визуально приятным, как красивый пост в Telegram.
- 🤝 Дружелюбный, заботливый и вежливый тон.
- 🗣️ Язык: Русский (по умолчанию), но отвечай на языке собеседника (UZ/EN).
- Если вопрос по агротехнологиям -> включай режим эксперта (детально, компетентно, пошагово).
- Если клиент ищет товар -> СРАЗУ предлагай конкретные позиции из каталога ниже с ценами!

ПРАВИЛА РАБОТЫ С КАТАЛОГОМ:
- Предлагай КОНКРЕТНЫЕ товары с ценами из каталога ниже.
- Если товара нет в наличии — предложи аналог.
- Предлагай сопутствующие товары (удобрения к семенам, лампу к стеллажу).

ПРИ ДИАГНОСТИКЕ РАСТЕНИЙ ПО ФОТО:
- Проведи диагностику, определи вид, оцени состояние и дай рекомендации по спасению или уходу.
- В КОНЦЕ ответа ОБЯЗАТЕЛЬНО добавляй ровно этот текст:

💡 <i>Если хотите, могу предложить консультацию агронома, чтобы более точно определить проблему и подобрать лечение:</i>
*   👨‍🌾 **Консультация агронома (1 час)** | 150 000 сум | ✅ — 🛠️ Онлайн или офлайн. Подбор культур, систем, растворов.
📞 <b>Наши контакты:</b> @Microgreen_Uzbekistan

ПРИ АНАЛИЗЕ ЕДЫ ПО ФОТО (Nutritionist Vision):
- Если пользователь прислал фото своей еды (завтрак, обед, ужин):
- Проанализируй блюдо, похвали его.
- Укажи, каких витаминов или элементов в нем не хватает (например, клетчатки, витамина С, железа).
- Обязательно предложи добавить конкретную микрозелень из нашего каталога, чтобы сделать блюдо в 2 раза полезнее! Обязательно добавь кнопку для покупки.

ИНТЕРАКТИВНЫЕ КНОПКИ:
Если ты предлагаешь пользователю купить конкретный товар или зайти в магазин, добавь в любом месте ответа специальный тег:
[BUTTON:Название кнопки|URL]
Например: [BUTTON:🛒 Открыть магазин|https://microgreenuzbekistan.com/catalog]
Или: [BUTTON:🥬 Купить Рукколу|https://microgreenuzbekistan.com/catalog?category=microgreens]
"""


async def _get_system_prompt() -> str:
    """Build full system prompt with product catalog"""
    catalog = await _load_product_catalog()
    return SYSTEM_PROMPT_BASE + catalog


async def analyze_image(image_bytes: bytes, user_question: str = "") -> str:
    """Analyze ANY image using Gemini (Plant, Document, etc)."""
    
    # Build prompt with catalog
    prompt = await _get_system_prompt()
    if user_question:
        prompt += f"\n\nВопрос пользователя: {user_question}"
    prompt += "\n\nПроанализируй это изображение. Если это растение — дай диагностику. Если текст — прочитай. Если что-то другое — опиши."
    
    # Try Gemini first
    if GEMINI_API_KEY:
        try:
            return await _analyze_with_gemini(image_bytes, prompt, mime_type="image/jpeg")
        except Exception as e:
            logger.error(f"Gemini error: {e}")
    
    return "⚠️ AI-сервисы временно недоступны для изображений."


async def transcribe_audio(audio_bytes: bytes, user_question: str = "") -> str:
    """Transcribe and answer audio using Gemini."""
    
    prompt = await _get_system_prompt()
    if user_question:
        prompt += f"\n\nПользователь отправил аудио с таким контекстом: {user_question}"
    prompt += "\n\nПрослушай это аудиозаобщение. Ответь на него. Если это вопрос — дай ответ. Если просьба — выполни."
    
    if GEMINI_API_KEY:
        try:
            # Gemini supports audio files directly
            return await _analyze_with_gemini(audio_bytes, prompt, mime_type="audio/ogg")
        except Exception as e:
            logger.error(f"Gemini Audio error: {e}")
            
    return "⚠️ Голосовые сообщения временно недоступны (требуется Gemini API)."


async def _analyze_with_gemini(data_bytes: bytes, prompt: str, mime_type: str = "image/jpeg") -> str:
    """Use Gemini Vision/Audio API via REST to avoid gRPC timeouts and blocking the event loop."""
    import base64
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    encoded_data = base64.b64encode(data_bytes).decode('utf-8')
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": encoded_data
                        }
                    }
                ]
            }
        ]
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        
        if response.status_code != 200:
            logger.error(f"Gemini REST error: {response.status_code} - {response.text}")
            raise Exception(f"Gemini API error: {response.status_code}")
            
        data = response.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as e:
            logger.error(f"Gemini parse error: {e} - Response: {data}")
            if "promptFeedback" in data and data["promptFeedback"].get("blockReason"):
                return "Извините, запрос был заблокирован из-за настроек безопасности."
            raise Exception("Invalid response format from Gemini")


async def get_ai_response(user_message: str, system_context: str = "") -> str:
    """Get AI text response for group/bot questions using Groq (free) or Gemini."""
    
    system = system_context or await _get_system_prompt()
    
    # Try Groq first (faster, free tier) - TEXT ONLY
    if GROQ_API_KEY:
        try:
            from groq import AsyncGroq
            
            client = AsyncGroq(api_key=GROQ_API_KEY)
            response = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_message}
                ],
                max_tokens=1000,
                temperature=0.7
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Groq error: {e}")
            # Continue to Gemini fallback
    
    # Fallback to Gemini via REST
    if GEMINI_API_KEY:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
            prompt = f"{system}\n\nВопрос пользователя: {user_message}"
            
            payload = {
                "contents": [{"parts": [{"text": prompt}]}]
            }
            
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    return data["candidates"][0]["content"]["parts"][0]["text"]
                else:
                    logger.error(f"Gemini text REST error: {response.status_code} - {response.text}")
        except Exception as e:
            logger.error(f"Gemini error: {e}")
    
    return "Мозг перезагружается... 🤖 Попробуйте позже!"

