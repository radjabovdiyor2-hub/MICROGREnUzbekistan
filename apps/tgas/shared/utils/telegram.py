import asyncio
import logging

logger = logging.getLogger(__name__)

async def simulate_typing(
    bot_or_message,
    chat_id: int = None,
    seconds: float = 1.5,
    delay: float = None,
) -> None:
    if delay is not None:
        seconds = delay
    try:
        if hasattr(bot_or_message, "answer"):
            from aiogram.enums import ChatAction
            await bot_or_message.answer_chat_action(ChatAction.TYPING)
        else:
            await bot_or_message.send_chat_action(chat_id=chat_id, action="typing")
        clamped = max(0.3, min(seconds, 5.0))
        await asyncio.sleep(clamped)
    except Exception as e:
        logger.debug(f"Ошибка имитации набора текста: {e}")
