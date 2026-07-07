"""PM Bot — Задачи CRUD"""
from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.database import get_session_ctx
from bots.pm_bot.states import TaskStates
from bots.pm_bot.keyboards.inline import priority_kb, confirm_kb, back_kb, pm_menu_kb
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
    pri_emoji = {"urgent":"🔴","high":"🟡","medium":"🟢","low":"⚪"}.get(d["priority"],"🟢")
    await state.set_state(TaskStates.confirming)
    await msg.answer(
        f"📋 <b>Новая задача:</b>\n\n"
        f"📝 {d['title']}\n{pri_emoji} Приоритет: {d['priority']}\n📄 {d['description']}\n\nСоздать?",
        reply_markup=confirm_kb())

@router.callback_query(TaskStates.confirming, F.data == "pm:yes")
async def confirm_task(cb: CallbackQuery, state: FSMContext):
    d = await state.get_data()
    async with get_session_ctx() as session:
        await session.execute(text(
            "INSERT INTO tasks (title, description, priority, department, status, created_at) "
            "VALUES (:t, :desc, :p, 'pm', 'todo', NOW())"),
            {"t": d["title"], "desc": d["description"], "p": d["priority"]})
    await state.set_state(None)
    await cb.message.edit_text("✅ Задача создана!", reply_markup=pm_menu_kb(d.get("lang","ru")))
    await cb.answer()

@router.callback_query(F.data == "pm:no")
async def cancel_task(cb: CallbackQuery, state: FSMContext):
    d = await state.get_data()
    await state.set_state(None)
    await cb.message.edit_text("❌ Отменено.", reply_markup=pm_menu_kb(d.get("lang","ru")))
    await cb.answer()

@router.callback_query(F.data == "pm:my_tasks")
async def my_tasks(cb: CallbackQuery, state: FSMContext):
    d = await state.get_data()
    async with get_session_ctx() as session:
        res = await session.execute(text("SELECT title, status, priority FROM tasks WHERE status != 'done' ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END LIMIT 10"))
        tasks = res.fetchall()
    if not tasks:
        await cb.message.edit_text("📋 Нет активных задач.", reply_markup=back_kb())
        await cb.answer(); return
    lines = ["📋 <b>Активные задачи:</b>\n"]
    for t in tasks:
        e = {"urgent":"🔴","high":"🟡","medium":"🟢","low":"⚪"}.get(t.priority,"🟢")
        s = {"todo":"⬜","in_progress":"🔄","done":"✅"}.get(t.status,"⬜")
        lines.append(f"{e}{s} {t.title}")
    await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()
