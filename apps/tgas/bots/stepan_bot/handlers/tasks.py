"""Степан (Менеджер) — Задачи CRUD"""

from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared import tasks_repo
from shared.database import get_session_ctx
from bots.stepan_bot.states import TaskStates
from bots.stepan_bot.keyboards.inline import (
    priority_kb,
    confirm_kb,
    back_kb,
    pm_menu_kb,
)

router = Router()


@router.callback_query(F.data == "pm:create_task")
async def create_task(cb: CallbackQuery, state: FSMContext):
    await state.set_state(TaskStates.entering_title)
    await cb.message.edit_text("📝 Введите название задачи:")
    await cb.answer()


@router.message(TaskStates.entering_title)
async def task_title(msg: Message, state: FSMContext):
    await state.update_data(title=msg.text)
    await state.set_state(TaskStates.choosing_priority)
    await msg.answer("Выберите приоритет:", reply_markup=priority_kb())


@router.callback_query(TaskStates.choosing_priority, F.data.startswith("pm:pri:"))
async def task_priority(cb: CallbackQuery, state: FSMContext):
    pri = cb.data.split(":")[-1]
    await state.update_data(priority=pri)
    await state.set_state(TaskStates.entering_description)
    await cb.message.edit_text("📝 Описание задачи:")
    await cb.answer()


@router.message(TaskStates.entering_description)
async def task_desc(msg: Message, state: FSMContext):
    await state.update_data(description=msg.text)
    d = await state.get_data()
    pri_emoji = {"urgent": "🔴", "high": "🟡", "medium": "🟢", "low": "⚪"}.get(
        d["priority"], "🟢"
    )
    await state.set_state(TaskStates.confirming)
    await msg.answer(
        f"📋 <b>Новая задача:</b>\n\n"
        f"📝 {d['title']}\n{pri_emoji} Приоритет: {d['priority']}\n📄 {d['description']}\n\nСоздать?",
        reply_markup=confirm_kb(),
    )


# Сколько дней даётся задаче в зависимости от того, как её назвали срочной.
#
# Дедлайн здесь не спрашивается отдельным шагом намеренно: создание задачи
# и так идёт в четыре экрана, а пятый ради числа, которое почти всегда
# выводится из приоритета, — это лишняя работа владельцу. Нужен другой срок —
# он ставится одной фразой Стёпану, там дедлайн есть в явном виде.
DEADLINE_DAYS = {"urgent": 1, "high": 2, "medium": 3, "low": 7}


@router.callback_query(TaskStates.confirming, F.data == "pm:yes")
async def confirm_task(cb: CallbackQuery, state: FSMContext):
    d = await state.get_data()

    # ── Через tasks_repo, а не сырым INSERT ──────────────────────────────
    #
    # Здесь стоял свой `INSERT INTO tasks` без `deadline`. Дайджест
    # просрочки (`list_overdue`) ключуется по `deadline < CURRENT_DATE`,
    # поэтому задача из PM-меню не попадала в него НИКОГДА: заводили её
    # руками в четыре шага — и о ней больше не напоминал никто.
    #
    # Заодно возвращаются вещи, которые репозиторий делает сам и о которых
    # копия не знала: `updated_at`, дедуп по недавним задачам и пинг SSE,
    # без которого экран «Задачи отделам» в админке оставался прежним.
    priority = d.get("priority", "medium")
    created = await tasks_repo.create(
        title=d["title"],
        department="pm",
        description=d.get("description", ""),
        priority=priority,
        deadline_days=DEADLINE_DAYS.get(priority, 3),
        chat_id=cb.message.chat.id,
    )
    task_id = created.get("task_id")

    await state.set_state(None)
    if not created.get("dispatched"):
        # Строка есть, исполнителя нет — молчать об этом нельзя: владелец
        # уйдёт в уверенности, что работа передана.
        await cb.message.edit_text(
            f"⚠️ Задача #{task_id} создана, но отдел о ней не узнал — "
            "проверьте шину событий. Она видна в списке задач.",
            reply_markup=pm_menu_kb(d.get("lang", "ru")),
        )
        await cb.answer()
        return

    await cb.message.edit_text(
        f"✅ Задача #{task_id} создана и передана в работу!",
        reply_markup=pm_menu_kb(d.get("lang", "ru")),
    )
    await cb.answer()


@router.callback_query(F.data == "pm:no")
async def cancel_task(cb: CallbackQuery, state: FSMContext):
    d = await state.get_data()
    await state.set_state(None)
    await cb.message.edit_text(
        "❌ Отменено.", reply_markup=pm_menu_kb(d.get("lang", "ru"))
    )
    await cb.answer()


@router.callback_query(F.data == "pm:my_tasks")
async def my_tasks(cb: CallbackQuery, state: FSMContext):
    await state.get_data()
    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT title, status, priority FROM tasks WHERE status != 'done' ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END LIMIT 10"
            )
        )
        tasks = res.fetchall()
    if not tasks:
        await cb.message.edit_text("📋 Нет активных задач.", reply_markup=back_kb())
        await cb.answer()
        return
    lines = ["📋 <b>Активные задачи:</b>\n"]
    for t in tasks:
        e = {"urgent": "🔴", "high": "🟡", "medium": "🟢", "low": "⚪"}.get(
            t.priority, "🟢"
        )
        s = {"todo": "⬜", "in_progress": "🔄", "done": "✅"}.get(t.status, "⬜")
        lines.append(f"{e}{s} {t.title}")
    await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()
