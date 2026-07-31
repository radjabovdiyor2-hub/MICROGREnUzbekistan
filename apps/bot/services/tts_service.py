"""
Синтез речи витринного бота.

Реализация переехала в общий пакет `mg_ai.tts`: раньше edge-tts вызывался
здесь, а офис озвучивал через OpenAI из своего движка — два синтезатора у
разных поставщиков и с разными голосами. Теперь оба варианта живут в одном
месте, витрина по-прежнему берёт бесплатный edge-tts.
"""

import logging

from mg_ai.tts import edge_tts_generate

logger = logging.getLogger(__name__)

# Русский голос витрины. Оставлен здесь, а не в пакете: выбор голоса —
# решение продукта, а не транспорта.
VOICE = "ru-RU-DmitryNeural"  # альтернатива: ru-RU-SvetlanaNeural


async def generate_speech(text: str) -> bytes:
    """Озвучить текст. Возвращает mp3-байты, пригодные для Telegram."""
    return await edge_tts_generate(text, voice=VOICE)
