"""
mg_ai.tts — синтез речи: OpenAI tts-1 и edge-tts.
===================================================

Два провайдера, оба доступны всем приложениям:
  · openai_tts — качественный голос через OpenAI (tts-1, opus), платный
  · edge_tts_generate — бесплатный голос через Microsoft Edge TTS (mp3)
"""

from __future__ import annotations

import logging
import os
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)


async def openai_tts(
    text: str,
    voice: str = "alloy",
    api_key: Optional[str] = None,
) -> Optional[str]:
    """Генерация аудио через OpenAI tts-1 (opus). Возвращает путь к .ogg файлу."""
    key = api_key or os.getenv("OPENAI_API_KEY", "")
    if not key:
        logger.error("OpenAI API key не задан — TTS невозможен")
        return None

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=key, timeout=60.0)
        logger.info("TTS (OpenAI): %s...", text[:50])
        response = await client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text,
            response_format="opus",
        )
        fd, file_path = tempfile.mkstemp(prefix="tts_", suffix=".ogg")
        os.close(fd)
        response.stream_to_file(file_path)
        await client.close()
        return file_path
    except Exception as e:
        logger.error("Ошибка OpenAI TTS: %s", e, exc_info=True)
        return None


async def edge_tts_generate(
    text: str,
    voice: str = "ru-RU-DmitryNeural",
) -> Optional[bytes]:
    """Генерация аудио через edge-tts (бесплатно). Возвращает mp3 bytes."""
    try:
        import edge_tts

        communicate = edge_tts.Communicate(text, voice)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return audio_data if audio_data else None
    except Exception as e:
        logger.error("Ошибка edge-tts: %s", e, exc_info=True)
        return None
