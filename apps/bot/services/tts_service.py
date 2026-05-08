import os
import asyncio
import logging
import tempfile
import edge_tts

logger = logging.getLogger(__name__)

# Choose a nice Russian voice
VOICE = "ru-RU-DmitryNeural" # or "ru-RU-SvetlanaNeural"

async def generate_speech(text: str) -> bytes:
    """Generate speech from text using edge-tts and return audio bytes (Ogg/Opus)."""
    try:
        # Edge-tts output format. Telegram requires OGG with OPUS or MP3.
        # We will request WEBM_24KHZ_16BIT_MONO_OPUS or OGG_OPUS if available.
        # Edge-tts default audio-24khz-48kbitrate-mono-mp3 is safe for Telegram.
        communicate = edge_tts.Communicate(text, VOICE)
        
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
                
        return audio_data
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        return None
