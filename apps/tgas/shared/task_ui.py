import logging
from aiogram import Router, F
from aiogram.types import CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder

from shared import tg_cards
from shared.approvals import is_owner

logger = logging.getLogger(__name__)
task_ui_router = Router()


def get_task_keyboard(task_id: int):
    """Клавиатура карточки задачи: закрыть или удалить."""
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Выполнено", callback_data=f"task_done:{task_id}")
    builder.button(text="🗑 Удалить", callback_data=f"task_del:{task_id}")
    builder.adjust(2)
    return builder.as_markup()


@task_ui_router.callback_query(F.data.startswith("task_done:"))
async def on_task_done(callback: CallbackQuery):
    try:
        # Проверки прав здесь не было вообще, а `task_ui_router` подключён к
        # восьми ботам, часть из которых работает в групповых чатах: закрыть
        # чужую задачу мог любой участник группы. Ту же ошибку уже разбирали
        # в shared/approvals.py — там проверка стоит именно поэтому.
        if not is_owner(callback.from_user.id):
            return await callback.answer("⛔ Только владелец", show_alert=True)

        task_id = int((callback.data or "").split(":")[-1])

        bot_info = await callback.bot.get_me() if callback.bot else None
        bot_name = (bot_info.username if bot_info else None) or "unknown_bot"

        username = callback.from_user.username or callback.from_user.first_name

        # ── Статус пишем ЗДЕСЬ, а не надеемся на событие ─────────────────
        #
        # Раньше нажатие только публиковало `TASK_COMPLETED`, а статус в базе
        # менял единственный обработчик — у Стёпана. Стёпан лежит (выкат,
        # перезапуск, падение) — нажатие пропадает молча: Redis Pub/Sub не
        # переигрывает пропущенное, а `retry_stuck_tasks` берёт только `todo`.
        # Владелец видел «✅ Отмечено как выполненное», а закрытой задачу не
        # считал никто.
        #
        # Кнопка подключена к восьми ботам, и каждый из них умеет сходить в
        # ту же базу через единственную дверь `tasks_repo`.
        from shared import tasks_repo

        closed = await tasks_repo.set_status(task_id, "done")
        if not closed:
            return await callback.answer(
                f"Задача #{task_id} не найдена — статус не изменён", show_alert=True
            )

        # Событие остаётся, но теперь оно ИЗВЕЩЕНИЕ, а не способ записи:
        # на нём висят доклад в чат и учёт у аналитики.
        from shared.event_bus import event_bus

        await event_bus.publish(
            "TASK_COMPLETED",
            {
                "task_id": task_id,
                "completed_by": bot_name,
                # ⚠️ Не `callback.message.chat.id` напрямую. Карточка
                # задачи живёт столько же, сколько сама задача, а
                # сообщение старше 48 часов Telegram отдаёт
                # недоступным — обращение к `.chat` роняло обработчик
                # ЗДЕСЬ, то есть уже ПОСЛЕ смены статуса на `done`.
                # Владелец получал «Ошибка при закрытии задачи» на
                # закрытую задачу и нажимал второй раз.
                "chat_id": tg_cards.chat_id_of(callback),
                "text": f"Сотрудник @{username} вручную закрыл задачу.",
            },
            bot_name,
        )

        await tg_cards.append(callback, "<i>✅ Отмечено как выполненное.</i>")

        await callback.answer(
            "Задача отправлена в статус 'выполнено'!", show_alert=True
        )
    except Exception as e:
        logger.error(f"Error handling task_done callback: {e}", exc_info=True)
        await callback.answer("Ошибка при закрытии задачи", show_alert=True)


@task_ui_router.callback_query(F.data.startswith("task_del:"))
async def on_task_delete(callback: CallbackQuery):
    """Удалить задачу из карточки отдела. Только владелец, в два шага."""
    try:
        if not is_owner(callback.from_user.id):
            return await callback.answer("⛔ Только владелец", show_alert=True)

        task_id = int((callback.data or "").split(":")[-1])
        builder = InlineKeyboardBuilder()
        builder.button(text="🗑 Да, удалить", callback_data=f"task_delok:{task_id}")
        builder.button(text="◀️ Не надо", callback_data=f"task_delno:{task_id}")
        builder.adjust(2)
        # Спрашиваем в тот же чат, а не реплаем на карточку: у карточки
        # старше 48 часов `reply` нет, и подтверждение не показалось бы.
        chat_id = tg_cards.chat_id_of(callback)
        if callback.bot is None or chat_id is None:
            return await callback.answer("Некуда спросить подтверждение", show_alert=True)
        await callback.bot.send_message(
            chat_id,
            f"🗑 Удалить задачу #{task_id} безвозвратно?\n"
            f"Если она просто потеряла смысл — закройте её как выполненную.",
            reply_markup=builder.as_markup(),
        )
        await callback.answer()
    except Exception as e:
        logger.error(f"Error handling task_del callback: {e}", exc_info=True)
        await callback.answer("Ошибка", show_alert=True)


@task_ui_router.callback_query(F.data.startswith("task_delok:"))
async def on_task_delete_confirmed(callback: CallbackQuery):
    try:
        if not is_owner(callback.from_user.id):
            return await callback.answer("⛔ Только владелец", show_alert=True)

        from shared import tasks_repo

        task_id = int((callback.data or "").split(":")[-1])
        removed = await tasks_repo.delete(task_id)
        if not removed:
            return await callback.answer("Задачи уже нет", show_alert=True)

        # Задача уже удалена — сообщить об этом обязаны, даже если карточку
        # редактировать нельзя.
        await tg_cards.append(
            callback, f"🗑 Задача #{task_id} удалена: {removed['title'][:150]}"
        )
        await callback.answer("Удалено")
    except Exception as e:
        logger.error(f"Error deleting task: {e}", exc_info=True)
        await callback.answer("Ошибка при удалении", show_alert=True)


@task_ui_router.callback_query(F.data.startswith("task_delno:"))
async def on_task_delete_declined(callback: CallbackQuery):
    await tg_cards.append(callback, "◀️ Удаление отменено — задача на месте.")
    await callback.answer()


# --- HITL (Human In The Loop) ---


async def send_hitl_approval_request(workflow_name: str, step_name: str, context: dict):
    """Отправляет запрос администратору на подтверждение критического шага."""
    try:
        from shared.config import settings
        from aiogram import Bot
        from aiogram.enums import ParseMode
        from aiogram.client.default import DefaultBotProperties
        
        # Без токена или без владельца спрашивать некому и нечем. Молчать
        # тут нельзя: шаг процесса остановлен и ждёт решения, которого не
        # будет, — а раньше это выглядело как обычный `Bot(token=None)` и
        # падало внутри aiogram, теряясь в общем `except`.
        if not settings.stepan_bot_token or not settings.admin_telegram_ids:
            logger.error(
                "HITL: шаг %s/%s ждёт решения, но спросить некому: "
                "нет токена бота или ADMIN_TELEGRAM_IDS",
                workflow_name,
                step_name,
            )
            return

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
        # Решение о шаге процесса принимают, посмотрев на сам процесс.
        # Без этой кнопки карточка была тупиком: названы имя процесса и
        # шага, а увидеть их можно было только зайдя на сайт.
        from shared import admin_links

        builder.add(admin_links.tab_button("🏢 Процессы", "workflow_studio", admin_id))
        builder.adjust(2, 1)
        
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
        # Проверки прав здесь не было, а `task_ui_router` подключён к восьми
        # ботам, часть которых работает в групповых чатах: одобрить шаг
        # процесса — например, выпуск нового товара — мог любой участник
        # группы. Ровно та же дыра, что была у кнопки «Выполнено» рядом.
        if not is_owner(callback.from_user.id):
            return await callback.answer("⛔ Только владелец", show_alert=True)

        parts = (callback.data or "").split(":")
        if len(parts) != 4:
            return await callback.answer("Решение не опознано", show_alert=True)
        _, workflow_name, step_name, decision = parts
        
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
        await tg_cards.append(callback, f"<i>{status_text}</i>")
        await callback.answer(f"Вы {status_text.lower()} этот шаг.", show_alert=True)
    except Exception as e:
        logger.error(f"Error handling HITL callback: {e}", exc_info=True)
        await callback.answer("Ошибка при обработке решения", show_alert=True)
