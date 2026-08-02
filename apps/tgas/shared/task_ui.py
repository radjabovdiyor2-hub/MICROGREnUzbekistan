import logging
from aiogram import Router, F
from aiogram.types import CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder

logger = logging.getLogger(__name__)
task_ui_router = Router()


def get_task_keyboard(task_id: int):
    """Генерирует клавиатуру с кнопкой 'Выполнено'."""
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Выполнено", callback_data=f"task_done:{task_id}")
    return builder.as_markup()


@task_ui_router.callback_query(F.data.startswith("task_done:"))
async def on_task_done(callback: CallbackQuery):
    try:
        task_id = callback.data.split(":")[1]

        bot_info = await callback.bot.get_me()
        bot_name = bot_info.username or "unknown_bot"

        username = callback.from_user.username or callback.from_user.first_name

        from shared.event_bus import event_bus

        await event_bus.publish(
            "TASK_COMPLETED",
            {
                "task_id": task_id,
                "completed_by": bot_name,
                "chat_id": callback.message.chat.id,
                "text": f"Сотрудник @{username} вручную закрыл задачу.",
            },
            bot_name,
        )

        new_text = (
            callback.message.html_text + "\n\n<i>✅ Отмечено как выполненное.</i>"
        )
        try:
            await callback.message.edit_text(new_text, parse_mode="HTML")
        except Exception as e:
            logger.warning(f"Could not edit message: {e}")

        await callback.answer(
            "Задача отправлена в статус 'выполнено'!", show_alert=True
        )
    except Exception as e:
        logger.error(f"Error handling task_done callback: {e}", exc_info=True)
        await callback.answer("Ошибка при закрытии задачи", show_alert=True)
