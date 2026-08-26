"""Стёпан (Менеджер) — Daily Standup"""

import json
import logging

from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from sqlalchemy import text

from bots.stepan_bot.states import StandupStates
from bots.stepan_bot.keyboards.inline import back_kb
from shared import tasks_repo
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)
router = Router()

# ══════════════════════════════════════════════════════════════════════
# Стендап отвечал «📝 Standup записан!» и не записывал НИЧЕГО: три ответа
# жили в состоянии FSM и исчезали вместе с ним. Ни строки в базе, ни задачи,
# ни следа в отчётах — процесс существовал только визуально, а сообщение об
# успехе было прямой неправдой.
#
# Теперь у него два следствия, и оба видны за пределами чата:
#   • сам стендап ложится в `audit_log` и виден на вкладке «Аудит» —
#     это журнал, а журнал и есть подходящее место для «что я сделал»;
#   • блокер превращается в ЗАДАЧУ. Помеха, о которой сказали вслух и
#     забыли, — худшее, что может случиться со стендапом.
# ══════════════════════════════════════════════════════════════════════

# Ответы, которые означают «блокеров нет». Всё остальное считаем помехой:
# лучше лишняя задача, чем потерянная.
_NO_BLOCKERS = {"", "-", "—", "нет", "нету", "no", "yo'q", "yoq", "ничего", "все ок", "всё ок"}


def _is_blocker(textv: str) -> bool:
    return textv.strip().lower().strip(".!") not in _NO_BLOCKERS


async def _record(actor: str, data: dict) -> bool:
    """Стендап в журнал действий. False — не записали, и об этом скажут."""
    try:
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO audit_log (action, actor, role, target, meta) "
                    "VALUES ('standup.recorded', :actor, 'ADMIN', 'standup', CAST(:meta AS jsonb))"
                ),
                {"actor": actor[:100], "meta": json.dumps(data, ensure_ascii=False)},
            )
            await session.commit()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Стендап не записан в журнал: %s", exc)
        return False


@router.callback_query(F.data == "pm:standup")
async def standup_start(cb: CallbackQuery, state: FSMContext):
    await state.set_state(StandupStates.entering_yesterday)
    await cb.message.edit_text("📝 <b>Daily Standup</b>\n\nЧто вы сделали вчера?")
    await cb.answer()


@router.message(StandupStates.entering_yesterday)
async def standup_y(msg: Message, state: FSMContext):
    await state.update_data(yesterday=msg.text)
    await state.set_state(StandupStates.entering_today)
    await msg.answer("📌 Что планируете сделать сегодня?")


@router.message(StandupStates.entering_today)
async def standup_t(msg: Message, state: FSMContext):
    await state.update_data(today=msg.text)
    await state.set_state(StandupStates.entering_blockers)
    await msg.answer("🚫 Есть блокеры или проблемы?")


@router.message(StandupStates.entering_blockers)
async def standup_b(msg: Message, state: FSMContext):
    d = await state.get_data()
    await state.clear()

    blockers = msg.text or ""
    actor = msg.from_user.username or msg.from_user.first_name or "владелец"
    saved = await _record(
        actor,
        {"yesterday": d.get("yesterday"), "today": d.get("today"), "blockers": blockers},
    )

    task_line = ""
    if _is_blocker(blockers):
        created = await tasks_repo.create(
            title=f"Блокер со стендапа: {blockers[:120]}",
            department="pm",
            description=f"Названо на стендапе {actor}. Сегодня планировалось: {d.get('today')}",
            priority="high",
            deadline_days=1,
            chat_id=msg.chat.id,
            # Разбирает помеху человек, а не отдел: будить бота нечем.
            notify_department=False,
        )
        task_line = f"\n🛠 Заведена задача #{created.get('task_id')} на разбор блокера"

    head = "📝 <b>Standup записан!</b>" if saved else "📝 <b>Standup принят</b> (в журнал не попал)"
    await msg.answer(
        f"{head}\n━━━━━━━━━━━━━━━━━━\n"
        f"✅ Вчера: {d.get('yesterday')}\n"
        f"📌 Сегодня: {d.get('today')}\n"
        f"🚫 Блокеры: {blockers}{task_line}",
        reply_markup=back_kb(),
    )
