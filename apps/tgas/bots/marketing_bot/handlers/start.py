"""Marketing Bot — Start"""

from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from bots.marketing_bot.keyboards.inline import mkt_menu_kb, lang_kb

router = Router()


@router.message(CommandStart())
async def cmd_start(msg: Message, state: FSMContext) -> None:
    await state.update_data(lang="ru")
    await msg.answer(
        "📢 <b>Marketing Bot</b>\n\nРассылки, акции и анализ аудитории.",
        reply_markup=mkt_menu_kb(),
    )


@router.callback_query(F.data == "mkt:menu")
async def menu(cb: CallbackQuery) -> None:
    await cb.message.edit_text("📢 Маркетинг:", reply_markup=mkt_menu_kb())
    await cb.answer()


@router.callback_query(F.data == "mkt:lang")
async def lang(cb: CallbackQuery) -> None:
    await cb.message.edit_text("🌐 Язык:", reply_markup=lang_kb())
    await cb.answer()


@router.callback_query(F.data.startswith("mkt:setlang:"))
async def setlang(cb: CallbackQuery, state: FSMContext) -> None:
    lang_code = cb.data.split(":")[-1]
    await state.update_data(lang=lang_code)
    await cb.message.edit_text("✅ OK!", reply_markup=mkt_menu_kb(lang_code))
    await cb.answer()
