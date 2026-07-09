import logging
from aiogram import Router, F
from aiogram.types import Message, ReactionTypeEmoji

logger = logging.getLogger(__name__)

async def set_reaction(message: Message, emoji: str):
    """Установить реакцию на сообщение."""
    try:
        await message.react([ReactionTypeEmoji(emoji=emoji)])
    except Exception as e:
        logger.warning(f"Не удалось поставить реакцию {emoji}: {e}")

def create_group_router(bot_username: str, handle_mention_func, wake_words=None) -> Router:
    """
    Создаёт роутер для работы в групповом чате.
    bot_username: Имя бота без @ (например, stepan_bot)
    handle_mention_func: Асинхронная функция, которая вызывается, если бота тегнули.
    wake_words: Список слов/фраз, на которые бот реагирует (ищет в любом месте сообщения).
    """
    router = Router()
    wake_words = wake_words or []
    
    def _match_wake_words(text: str) -> bool:
        """Проверяет, содержит ли текст любое из wake-слов."""
        if not text or not wake_words:
            return False
        text_lower = text.lower()
        return any(w.lower() in text_lower for w in wake_words)
    
    # Фильтр: сообщение из группы/супергруппы И бота упомянули ИЛИ wake_word найден
    @router.message(
        F.chat.type.in_({"group", "supergroup"}),
        (F.text.icontains(f"@{bot_username}")) | 
        (F.reply_to_message.from_user.username == bot_username) |
        (F.text.func(_match_wake_words))
    )
    async def group_mention_handler(message: Message, **kwargs):
        # Ожидаем реакцию "глаза в процессе"
        await set_reaction(message, "👀")
        
        # Вызываем логику обработчика бота
        try:
            import inspect
            sig = inspect.signature(handle_mention_func)
            passed_kwargs = {k: v for k, v in kwargs.items() if k in sig.parameters}
            await handle_mention_func(message, **passed_kwargs)
            # Если ок, ставим "палец вверх"
            await set_reaction(message, "👍")
        except Exception as e:
            logger.error(f"Ошибка при обработке упоминания в группе: {e}")
            # Если ошибка
            await set_reaction(message, "👎")

    return router

