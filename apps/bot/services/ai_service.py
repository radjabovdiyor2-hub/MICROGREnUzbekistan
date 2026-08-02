import os
import base64
import tempfile
import time
from typing import Optional

import httpx
from dotenv import load_dotenv
from pathlib import Path

from mg_ai.engine import AIEngine

# Load env
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path, override=True)

import logging
logger = logging.getLogger(__name__)

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


# ── AI: всё через OpenAI ──────────────────────────────────────────────
# Раньше здесь было три поставщика: Groq (llama-3.3-70b) для текста,
# Gemini для картинок и аудио, и собственный REST-клиент к каждому. Теперь
# один движок mg_ai — тот же, что у ИИ-офиса, — и один поставщик.
#
# Следствие, о котором стоит помнить: Gemini flash был дешевле, а Groq
# бесплатен. Ответы витрины теперь стоят денег; расход виден в админке,
# раздел «Расходы на ИИ».

_engine: Optional[AIEngine] = None


def _get_engine() -> AIEngine:
    """Ленивый общий движок. Один на процесс — держит HTTP-сессию и клиент."""
    global _engine
    if _engine is None:
        _engine = AIEngine(
            openai_key=os.getenv("OPENAI_API_KEY"),
            openai_model=os.getenv("OPENAI_MODEL") or "gpt-4o-mini",
            bot_name="storefront_bot",
        )
    return _engine


async def analyze_image(image_bytes: bytes, user_question: str = "") -> str:
    """Разобрать изображение: растение, документ, что угодно."""
    prompt = await _get_system_prompt()
    if user_question:
        prompt += f"\n\nВопрос пользователя: {user_question}"
    prompt += (
        "\n\nПроанализируй это изображение. Если это растение — дай диагностику. "
        "Если текст — прочитай. Если что-то другое — опиши."
    )

    encoded = base64.b64encode(image_bytes).decode("utf-8")
    res = await _get_engine().chat_completion(
        system_prompt=prompt,
        user_message=user_question or "Что на изображении?",
        image_base64=encoded,
        max_tokens=1024,
    )
    return res or "⚠️ AI-сервисы временно недоступны для изображений."


async def transcribe_audio(audio_bytes: bytes, user_question: str = "") -> str:
    """Расшифровать голосовое и ответить на него.

    Два шага вместо одного: Whisper переводит речь в текст, ответ даёт
    обычный диалог. Раньше аудио уходило в Gemini одним мультимодальным
    запросом — с уходом на OpenAI такой возможности нет, зато расшифровка
    точнее, а сам вопрос теперь виден в логах и в расходе.
    """
    engine = _get_engine()

    fd, path = tempfile.mkstemp(prefix="voice_", suffix=".ogg")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(audio_bytes)
        text = await engine.transcribe_audio(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass

    if not text:
        return "⚠️ Не удалось разобрать голосовое сообщение."

    prompt = await _get_system_prompt()
    if user_question:
        prompt += f"\n\nКонтекст от пользователя: {user_question}"

    res = await engine.chat_completion(
        system_prompt=prompt,
        user_message=text,
        max_tokens=1024,
    )
    return res or f"Расслышал: «{text}», но ответить сейчас не могу."


async def get_ai_response(user_message: str, system_context: str = "") -> str:
    """Текстовый ответ для группы и личных вопросов.

    `system_context` ДОПОЛНЯЕТ базовый промпт, а не заменяет его. Раньше здесь
    стояло `system_context or await _get_system_prompt()`, и единственный
    вызывающий — обработчик групповых чатов — передавал трёхстрочную роль.
    Это выбрасывало и каталог с ценами, и фирменный голос, и запрет выдумывать
    факты: в группе бот отвечал про товары по памяти модели, а не по базе.
    """
    system = await _get_system_prompt()
    if system_context:
        system = f"{system}\n\n{system_context}"
    res = await _get_engine().chat_completion(
        system_prompt=system,
        user_message=user_message,
        max_tokens=1000,
    )
    return res or "Мозг перезагружается... 🤖 Попробуйте позже!"
