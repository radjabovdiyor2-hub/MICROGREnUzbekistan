"""Analytics Bot — Start handler"""
from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from bots.analytics_bot.keyboards.inline import an_menu_kb, lang_kb
router = Router()

@router.message(CommandStart())
async def cmd_start(msg: Message, state: FSMContext):
    await state.update_data(lang="ru")
    await msg.answer("📈 <b>Analytics Bot</b>\n\nДашборды, аналитика и прогнозы для руководителя.", reply_markup=an_menu_kb())

@router.callback_query(F.data == "an:menu")
async def menu(cb: CallbackQuery): 
    await cb.message.edit_text("📈 Аналитика:", reply_markup=an_menu_kb())
    await cb.answer()

@router.callback_query(F.data == "an:lang")
async def lang(cb: CallbackQuery):
    await cb.message.edit_text("🌐 Язык:", reply_markup=lang_kb())
    await cb.answer()

@router.callback_query(F.data.startswith("an:setlang:"))
async def setlang(cb: CallbackQuery, state: FSMContext):
    l = cb.data.split(":")[-1]
    await state.update_data(lang=l)
    await cb.message.edit_text("✅ OK!", reply_markup=an_menu_kb(l))
    await cb.answer()
