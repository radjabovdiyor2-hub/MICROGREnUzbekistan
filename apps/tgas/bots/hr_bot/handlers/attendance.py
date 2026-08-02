from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy import text
from shared.database import get_session_ctx

router = Router()

@router.message(Command("checkin"))
async def cmd_checkin(msg: Message) -> None:
    tid = msg.from_user.id
    async with get_session_ctx() as session:
        # Find employee
        res = await session.execute(
            text("SELECT id FROM employees WHERE telegram_id = :tid"),
            {"tid": tid}
        )
        emp_id = res.scalar()
        if not emp_id:
            await msg.answer("❌ Вы не зарегистрированы как сотрудник (telegram_id не найден).")
            return

        # Check if already checked in today
        res = await session.execute(
            text("SELECT id FROM shifts WHERE employee_id = :eid AND date = CURRENT_DATE AND end_time IS NULL LIMIT 1"),
            {"eid": emp_id}
        )
        existing_shift = res.scalar()
        if existing_shift:
            await msg.answer("У вас уже есть открытая смена на сегодня.")
            return

        # Create shift
        await session.execute(
            text("INSERT INTO shifts (id, employee_id, date, start_time, type, updated_at) VALUES (gen_random_uuid(), :eid, CURRENT_DATE, NOW(), 'work', NOW())"),
            {"eid": emp_id}
        )
        await session.commit()
    await msg.answer("✅ Смена открыта! Удачного рабочего дня.")

@router.message(Command("checkout"))
async def cmd_checkout(msg: Message) -> None:
    tid = msg.from_user.id
    async with get_session_ctx() as session:
        # Find employee
        res = await session.execute(
            text("SELECT id FROM employees WHERE telegram_id = :tid"),
            {"tid": tid}
        )
        emp_id = res.scalar()
        if not emp_id:
            await msg.answer("❌ Вы не зарегистрированы как сотрудник.")
            return

        # Close shift
        res = await session.execute(
            text("UPDATE shifts SET end_time = NOW(), updated_at = NOW() WHERE employee_id = :eid AND date = CURRENT_DATE AND end_time IS NULL RETURNING id"),
            {"eid": emp_id}
        )
        closed_shift = res.scalar()
        if closed_shift:
            await session.commit()
            await msg.answer("🛑 Смена закрыта. Спасибо за работу!")
        else:
            await msg.answer("⚠️ Нет открытой смены на сегодня.")

@router.message(Command("status"))
async def cmd_status(msg: Message) -> None:
    tid = msg.from_user.id
    async with get_session_ctx() as session:
        # Find employee
        res = await session.execute(
            text("SELECT id, name FROM employees WHERE telegram_id = :tid"),
            {"tid": tid}
        )
        row = res.fetchone()
        if not row:
            await msg.answer("❌ Вы не зарегистрированы как сотрудник.")
            return
        
        emp_id, emp_name = row

        res = await session.execute(
            text("SELECT start_time, end_time FROM shifts WHERE employee_id = :eid AND date = CURRENT_DATE LIMIT 1"),
            {"eid": emp_id}
        )
        shift = res.fetchone()
        
        if not shift:
            await msg.answer(f"👤 <b>{emp_name}</b>\nНа сегодня смен нет.", parse_mode="HTML")
        elif shift.end_time:
            await msg.answer(f"👤 <b>{emp_name}</b>\nСмена завершена.\nНачало: {shift.start_time}\nКонец: {shift.end_time}", parse_mode="HTML")
        else:
            await msg.answer(f"👤 <b>{emp_name}</b>\nВ работе.\nСмена началась в {shift.start_time}", parse_mode="HTML")
