import typing
import logging
from aiogram import Router, F
from aiogram.types import Message, ReactionTypeEmoji

logger = logging.getLogger(__name__)


async def set_reaction(message: Message, emoji: str) -> None:
    """Установить реакцию на сообщение."""
    try:
        await message.react([ReactionTypeEmoji(emoji=emoji)])
    except Exception as e:
        logger.warning(f"Не удалось поставить реакцию {emoji}: {e}")


def create_group_router(
    bot_username: str, handle_mention_func, wake_words=None
) -> Router:
    """
    Создаёт роутер для работы в групповом чате.
    bot_username: Имя бота без @ (например, stepan_bot)
    handle_mention_func: Асинхронная функция, которая вызывается, если бота тегнули.
    wake_words: Зарезервировано для будущего использования (не активировано —
                раньше вызывало каскадные AI-вызовы, когда несколько ботов реагировали
                на одно сообщение по общим словам).
    """
    router = Router()

    @router.message(
        F.chat.type.in_({"group", "supergroup"}),
        (F.text.icontains(f"@{bot_username}"))
        | (F.reply_to_message.from_user.username == bot_username),
    )
    async def group_mention_handler(message: Message, **kwargs) -> None:
        await set_reaction(message, "👀")

        try:
            import inspect

            sig = inspect.signature(handle_mention_func)
            passed_kwargs = {k: v for k, v in kwargs.items() if k in sig.parameters}
            await handle_mention_func(message, **passed_kwargs)
            await set_reaction(message, "👍")
        except Exception as e:
            logger.error(f"Ошибка при обработке упоминания в группе: {e}")
            await set_reaction(message, "👎")

    return router
