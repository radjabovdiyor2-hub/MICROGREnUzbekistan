"""Analytics Bot — AI Forecasts & Chat"""

from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from shared.ai_engine import AIEngine
from shared.utils import simulate_typing
from bots.analytics_bot.keyboards.inline import back_kb

router = Router()
ai = AIEngine()


@router.callback_query(F.data == "an:forecast")
async def forecast(cb: CallbackQuery):
    await simulate_typing(cb.message, delay=2)
    resp = await ai.chat_completion(
        "Ты бизнес-аналитик Microgreen Uzbekistan. Составь краткий прогноз на следующий месяц с учетом сезонности Узбекистана.",
        "Составь прогноз продаж микрозелени на следующий месяц.",
    )
    await cb.message.edit_text(
        f"📈 <b>Прогноз AI:</b>\n\n{resp}", reply_markup=back_kb()
    )
    await cb.answer()


@router.callback_query(F.data == "an:ai")
async def start_ai(cb: CallbackQuery):
    await cb.message.edit_text(
        "🤖 Задайте вопрос по аналитике:", reply_markup=back_kb()
    )
    await cb.answer()


@router.message(F.text, F.chat.type == "private")
async def ai_chat(msg: Message):
    await simulate_typing(msg, delay=2)
    resp = await ai.chat_completion(
        "Ты бизнес-аналитик Microgreen Uzbekistan. Отвечай с цифрами и рекомендациями.",
        msg.text,
    )
    await msg.answer(resp)
