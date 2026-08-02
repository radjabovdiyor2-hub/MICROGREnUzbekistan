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

# --- HITL (Human In The Loop) ---


async def send_hitl_approval_request(workflow_name: str, step_name: str, context: dict):
    """Отправляет запрос администратору на подтверждение критического шага."""
    try:
        from shared.config import settings
        from aiogram import Bot
        from aiogram.enums import ParseMode
        from aiogram.client.default import DefaultBotProperties
        
        bot = Bot(
            token=settings.stepan_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML)
        )
        
        admin_id = settings.admin_telegram_ids[0]
        
        builder = InlineKeyboardBuilder()
        
        # Данные слишком большие для callback_data, поэтому сохраняем минимальный контекст
        cb_base = f"hitl:{workflow_name}:{step_name}"
        builder.button(text="✅ Одобрить", callback_data=f"{cb_base}:approve")
        builder.button(text="❌ Отклонить", callback_data=f"{cb_base}:reject")
        
        text = (
            f"⚠️ <b>Требуется ваше решение (Human-in-the-Loop)</b>\n\n"
            f"<b>Процесс:</b> {workflow_name}\n"
            f"<b>Шаг:</b> {step_name}\n"
            f"<b>Контекст:</b>\n"
        )
        
        for k, v in context.items():
            text += f" • {k}: {str(v)[:100]}\n"
            
        await bot.send_message(admin_id, text, reply_markup=builder.as_markup())
        await bot.session.close()
    except Exception as e:
        logger.error(f"Failed to send HITL request: {e}", exc_info=True)


@task_ui_router.callback_query(F.data.startswith("hitl:"))
async def on_hitl_response(callback: CallbackQuery):
    try:
        _, workflow_name, step_name, decision = callback.data.split(":")
        
        is_approved = (decision == "approve")
        
        from shared.event_bus import event_bus
        
        # Имитируем завершение задачи администратором (Admin acts as a bot)
        await event_bus.publish(
            "TASK_COMPLETED",
            {
                "workflow_name": workflow_name,
                "current_step": step_name,
                "is_approved": is_approved,
                "completed_by": "admin"
            },
            "admin"
        )

        status_text = "✅ Одобрено" if is_approved else "❌ Отклонено (возврат)"
        new_text = callback.message.html_text + f"\n\n<i>{status_text}</i>"
        
        await callback.message.edit_text(new_text, parse_mode="HTML")
        await callback.answer(f"Вы {status_text.lower()} этот шаг.", show_alert=True)
    except Exception as e:
        logger.error(f"Error handling HITL callback: {e}", exc_info=True)
        await callback.answer("Ошибка при обработке решения", show_alert=True)
