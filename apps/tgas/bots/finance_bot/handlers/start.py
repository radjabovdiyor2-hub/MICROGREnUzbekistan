import logging
from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.utils import format_price, simulate_typing
from shared.ai_engine import AIEngine
from bots.finance_bot.keyboards.inline import (
    fin_menu_kb,
    back_kb,
    expense_categories_kb,
    income_categories_kb,
)
from bots.finance_bot.states import ExpenseStates, IncomeStates
from shared.prompts import role_prompt

logger = logging.getLogger(__name__)
router = Router()
ai = AIEngine()


@router.message(CommandStart())
async def cmd_start(msg: Message):
    await msg.answer(
        "💰 <b>Finance Bot</b>\n\nУчёт финансов, P&L и зарплаты.",
        reply_markup=fin_menu_kb(),
    )


@router.callback_query(F.data == "fin:menu")
async def menu(cb: CallbackQuery):
    await cb.message.edit_text("💰 Финансы:", reply_markup=fin_menu_kb())
    await cb.answer()


@router.callback_query(F.data == "fin:expense")
async def expense(cb: CallbackQuery, state: FSMContext):
    await state.set_state(ExpenseStates.entering_category)
    await cb.message.edit_text(
        "💸 Выберите категорию расхода:", reply_markup=expense_categories_kb()
    )
    await cb.answer()


@router.callback_query(ExpenseStates.entering_category, F.data.startswith("exp_cat:"))
async def exp_category(cb: CallbackQuery, state: FSMContext):
    cat = cb.data.split(":")[1]
    await state.update_data(category=cat)
    await state.set_state(ExpenseStates.entering_amount)
    await cb.message.edit_text(
        f"💸 Категория: {cat.capitalize()}\nВведите сумму расхода (в сумах):"
    )
    await cb.answer()


@router.message(ExpenseStates.entering_amount)
async def exp_amount(msg: Message, state: FSMContext):
    try:
        amt = float((msg.text or "").replace(" ", ""))
    except (ValueError, AttributeError) as exc:
        logger.warning("Invalid expense amount: %s", exc)
        await msg.answer("❌ Введите число!")
        return
    await state.update_data(amount=amt)
    await state.set_state(ExpenseStates.entering_description)
    await msg.answer("📝 Описание расхода:")


@router.message(ExpenseStates.entering_description)
async def exp_desc(msg: Message, state: FSMContext):
    d = await state.get_data()
    async with get_session_ctx() as session:
        await session.execute(
            text(
                "INSERT INTO finances (type, amount, category, description, date, created_at) "
                "VALUES ('expense', :a, :c, :d, CURRENT_DATE, NOW())"
            ),
            {"a": d["amount"], "c": d.get("category", "general"), "d": msg.text},
        )
    # 🔗 EventBus: крупный расход → уведомление
    if d["amount"] >= 1000000:
        from shared.event_bus import event_bus, Events

        await event_bus.publish(
            Events.LARGE_EXPENSE_ALERT,
            {"amount": d["amount"], "description": msg.text},
            source_bot="finance_bot",
        )
    await state.clear()
    await msg.answer(
        f"✅ Расход {format_price(d['amount'])} записан!", reply_markup=fin_menu_kb()
    )


@router.callback_query(F.data == "fin:income")
async def income(cb: CallbackQuery, state: FSMContext):
    await state.set_state(IncomeStates.entering_category)
    await cb.message.edit_text(
        "💰 Выберите категорию дохода:", reply_markup=income_categories_kb()
    )
    await cb.answer()


@router.callback_query(IncomeStates.entering_category, F.data.startswith("inc_cat:"))
async def inc_category(cb: CallbackQuery, state: FSMContext):
    cat = cb.data.split(":")[1]
    await state.update_data(category=cat)
    await state.set_state(IncomeStates.entering_amount)
    await cb.message.edit_text(
        f"💰 Категория: {cat.capitalize()}\nВведите сумму дохода:"
    )
    await cb.answer()


@router.message(IncomeStates.entering_amount)
async def inc_amount(msg: Message, state: FSMContext):
    try:
        amt = float((msg.text or "").replace(" ", ""))
    except (ValueError, AttributeError) as exc:
        logger.warning("Invalid income amount: %s", exc)
        await msg.answer("❌ Введите число!")
        return
    await state.update_data(amount=amt)
    await state.set_state(IncomeStates.entering_description)
    await msg.answer("📝 Источник дохода:")


@router.message(IncomeStates.entering_description)
async def inc_desc(msg: Message, state: FSMContext):
    d = await state.get_data()
    async with get_session_ctx() as session:
        await session.execute(
            text(
                "INSERT INTO finances (type, amount, category, description, date, created_at) "
                "VALUES ('income', :a, :c, :d, CURRENT_DATE, NOW())"
            ),
            {"a": d["amount"], "c": d.get("category", "sales"), "d": msg.text},
        )
    await state.clear()
    await msg.answer(
        f"✅ Доход {format_price(d['amount'])} записан!", reply_markup=fin_menu_kb()
    )


@router.callback_query(F.data == "fin:pnl")
async def pnl(cb: CallbackQuery):
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as inc, "
                "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as exp "
                "FROM finances WHERE date >= date_trunc('month', CURRENT_DATE)"
            )
        )
        d = r.fetchone()
    profit = d.inc - d.exp
    emoji = "📈" if profit >= 0 else "📉"
    await cb.message.edit_text(
        f"📊 <b>P&L — текущий месяц</b>\n━━━━━━━━━━━━━━━━━━\n"
        f"💰 Доходы: {format_price(d.inc)}\n💸 Расходы: {format_price(d.exp)}\n"
        f"{emoji} <b>Прибыль: {format_price(profit)}</b>",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "fin:balance")
async def balance(cb: CallbackQuery):
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END),0) as bal FROM finances"
            )
        )
        bal = r.scalar() or 0
    await cb.message.edit_text(
        f"🏦 <b>Баланс:</b> {format_price(bal)}", reply_markup=back_kb()
    )
    await cb.answer()


@router.callback_query(F.data == "fin:debts")
async def debts(cb: CallbackQuery):
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT o.order_number, o.total_amount, c.name FROM crm_orders o "
                "JOIN customers c ON c.id = o.customer_id "
                "WHERE o.payment_status = 'pending' ORDER BY o.created_at LIMIT 10"
            )
        )
        debts = r.fetchall()
    if not debts:
        await cb.message.edit_text(
            "💳 Нет неоплаченных заказов!", reply_markup=back_kb()
        )
    else:
        lines = ["💳 <b>Дебиторка</b>\n━━━━━━━━━━━━━━━━━━"]
        for d in debts:
            lines.append(
                f"🔴 #{d.order_number} — {d.name} — {format_price(d.total_amount)}"
            )
        await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()


@router.callback_query(F.data == "fin:salary")
async def salary(cb: CallbackQuery):
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT name, role, salary FROM crm_employees WHERE status='active' AND salary > 0"
            )
        )
        emps = r.fetchall()
    if not emps:
        await cb.message.edit_text(
            "💼 Нет сотрудников с зарплатой.", reply_markup=back_kb()
        )
    else:
        total = sum(e.salary for e in emps)
        lines = ["💼 <b>Зарплаты</b>\n━━━━━━━━━━━━━━━━━━"]
        for e in emps:
            lines.append(f"👤 {e.name} ({e.role}) — {format_price(e.salary)}")
        lines.append(f"\n💰 <b>Итого ФОТ: {format_price(total)}</b>")
        await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()


@router.callback_query(F.data == "fin:ai")
async def start_ai(cb: CallbackQuery):
    await cb.message.edit_text("🤖 Задайте финансовый вопрос:", reply_markup=back_kb())
    await cb.answer()


@router.message(F.text, F.chat.type == "private")
async def ai_fin(msg: Message):
    await simulate_typing(msg, delay=2)
    r = await ai.chat_completion(
        role_prompt("Ты финансист Microgreen Uzbekistan."), msg.text, effort="high"
    )
    await msg.answer(r)
