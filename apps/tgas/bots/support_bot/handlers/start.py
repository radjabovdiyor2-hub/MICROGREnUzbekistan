"""Support Bot — Start"""

from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from bots.support_bot.keyboards.inline import sup_menu_kb, lang_kb

router = Router()


@router.message(CommandStart())
async def cmd_start(msg: Message, state: FSMContext):
    await state.update_data(lang="ru")
    await msg.answer(
        "🎧 <b>Support Bot</b>\n\nFAQ, статус заказов и AI-консультант.",
        reply_markup=sup_menu_kb(),
    )


@router.callback_query(F.data == "sup:menu")
async def menu(cb: CallbackQuery):
    await cb.message.edit_text("🎧 Поддержка:", reply_markup=sup_menu_kb())
    await cb.answer()


@router.callback_query(F.data == "sup:lang")
async def lang(cb: CallbackQuery):
    await cb.message.edit_text("🌐:", reply_markup=lang_kb())
    await cb.answer()


@router.callback_query(F.data.startswith("sup:setlang:"))
async def setlang(cb: CallbackQuery, state: FSMContext):
    await state.update_data(lang=cb.data.split(":")[-1])
    await cb.message.edit_text("✅ OK!", reply_markup=sup_menu_kb())
    await cb.answer()
