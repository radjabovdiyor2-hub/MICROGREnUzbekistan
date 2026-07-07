"""PM Bot — Start, Menu, Language"""
from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from bots.pm_bot.keyboards.inline import pm_menu_kb, lang_kb
router = Router()

@router.message(CommandStart())
async def cmd_start(msg: Message, state: FSMContext):
    await state.clear()
    await state.update_data(lang="ru")
    await msg.answer("📋 <b>PM Bot — Управление проектами</b>\n\nВыберите действие:", reply_markup=pm_menu_kb("ru"))

@router.callback_query(F.data == "pm:menu")
async def nav_menu(cb: CallbackQuery, state: FSMContext):
    d = await state.get_data()
    await cb.message.edit_text("📋 Главное меню:", reply_markup=pm_menu_kb(d.get("lang","ru")))
    await cb.answer()

@router.callback_query(F.data == "pm:lang")
async def switch_lang(cb: CallbackQuery):
    await cb.message.edit_text("🌐 Выберите язык:", reply_markup=lang_kb())
    await cb.answer()

@router.callback_query(F.data.startswith("pm:setlang:"))
async def set_lang(cb: CallbackQuery, state: FSMContext):
    lang = cb.data.split(":")[-1]
    await state.update_data(lang=lang)
    await cb.message.edit_text("✅ Язык изменён!" if lang=="ru" else "✅ Til o'zgartirildi!", reply_markup=pm_menu_kb(lang))
    await cb.answer()
