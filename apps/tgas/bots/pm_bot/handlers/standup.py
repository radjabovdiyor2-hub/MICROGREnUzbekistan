"""PM Bot — Daily Standup"""
from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from bots.pm_bot.states import StandupStates
from bots.pm_bot.keyboards.inline import back_kb
router = Router()

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
    await msg.answer(
        f"📝 <b>Standup записан!</b>\n━━━━━━━━━━━━━━━━━━\n"
        f"✅ Вчера: {d['yesterday']}\n"
        f"📌 Сегодня: {d['today']}\n"
        f"🚫 Блокеры: {msg.text}", reply_markup=back_kb())
