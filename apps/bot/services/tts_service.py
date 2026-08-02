"""
Синтез речи витринного бота — через OpenAI, как и остальной ИИ.

Раньше здесь был бесплатный edge-tts, а офис озвучивал через OpenAI: два
синтезатора у разных поставщиков и с разными голосами. Теперь поставщик
один. Реализация живёт в общем пакете `mg_ai.tts`.

Цена: озвучка стала платной. Расход виден в админке, раздел «Расходы на ИИ».
Если понадобится вернуть бесплатный вариант, в `mg_ai.tts` остался
`edge_tts_generate` — он никуда не делся.
"""

import logging
import os
from typing import Optional

from mg_ai.tts import openai_tts

logger = logging.getLogger(__name__)

# Голос витрины. Выбор голоса — решение продукта, поэтому он здесь, а не
# в транспортном пакете.
VOICE = "alloy"


async def generate_speech(text: str) -> Optional[bytes]:
    """Озвучить текст. Возвращает байты ogg/opus для Telegram.

    OpenAI отдаёт файл, а обработчик ждёт байты (BufferedInputFile), поэтому
    читаем и убираем за собой. Файл временный и уникальный — параллельные
    голосовые не затирают друг друга.
    """
    path = await openai_tts(text, voice=VOICE)
    if not path:
        return None

    try:
        with open(path, "rb") as fh:
            return fh.read()
    except OSError as e:
        logger.error("Не удалось прочитать озвучку %s: %s", path, e)
        return None
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
