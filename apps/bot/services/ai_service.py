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

SYSTEM_PROMPT_BASE = """Ты — AI-ассистент экосистемы AgroTech Ecosystem.
Твоя роль: 
1. 🌿 Эксперт-агроном (микрозелень, гидропоника, аэропоника, вертикальные фермы, диагностика по фото).
2. 🤖 Универсальный помощник (поддерживаешь любые темы: погода, новости, философия, юмор).
3. 📦 Менеджер заказов (помогаешь выбрать и купить продукцию и оборудование).
4. 🛒 Продавец-консультант — знаешь ВСЕ товары. Предлагай подходящие товары с ценами!

ТВОЙ СТИЛЬ:
- Дружелюбный, вежливый, используешь эмодзи 🌿✨.
- Язык: Русский (по умолчанию), но отвечай на языке собеседника (UZ/EN).
- Если вопрос по агротехнологиям -> включай режим эксперта (детально, компетентно).
- Если вопрос общий -> отвечай полезно и по сути.
- Если клиент ищет товар -> СРАЗУ предлагай конкретные позиции из каталога ниже с ценами!

ПРАВИЛА РАБОТЫ С КАТАЛОГОМ:
- Предлагай КОНКРЕТНЫЕ товары с ценами из каталога ниже
- Если товар нет в наличии — предложи аналог
- Предлагай сопутствующие товары (удобрения к семенам, лампу к стеллажу)

Если пользователь присылает фото растения -> проведи диагностику, определи вид, оцени состояние и дай рекомендации.
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
    """Use Gemini Vision/Audio API."""
    import google.generativeai as genai
    
    genai.configure(api_key=GEMINI_API_KEY)
    # Use 1.5 Flash for multimodal (audio/video/image)
    model = genai.GenerativeModel("gemini-2.0-flash")
    
    data_part = {
        "mime_type": mime_type,
        "data": data_bytes
    }
    
    response = model.generate_content([prompt, data_part])
    return response.text


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
    
    # Fallback to Gemini
    if GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            
            genai.configure(api_key=GEMINI_API_KEY)
            model = genai.GenerativeModel("gemini-2.0-flash")
            
            prompt = f"{system}\n\nВопрос пользователя: {user_message}"
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.error(f"Gemini error: {e}")
    
    return "Мозг перезагружается... 🤖 Попробуйте позже!"

