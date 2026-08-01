import logging
from aiogram import Router, F
from aiogram.types import Message

logger = logging.getLogger(__name__)

unsubscribe_router = Router()

@unsubscribe_router.message(
    F.text & F.text.lower().in_(["стоп", "stop", "отписаться", "unsubscribe"])
)
async def process_unsubscribe(message: Message) -> None:
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        tid = message.from_user.id
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "UPDATE customers SET status = 'unsubscribed' WHERE telegram_id = :tid"
                ),
                {"tid": tid},
            )
            await session.commit()
        await message.reply("Вы отписаны от рассылок.")
    except Exception as e:
        logger.error(f"Error unsubscribing customer: {e}")
