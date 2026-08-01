"""Content Bot — Start + All Handlers"""

from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from shared.ai_engine import AIEngine
from shared.utils import simulate_typing
from bots.content_bot.keyboards.inline import cnt_menu_kb, back_kb
from bots.content_bot.states import ContentStates

router = Router()
ai = AIEngine()


@router.message(CommandStart())
async def cmd_start(msg: Message, state: FSMContext):
    await state.clear()
    await msg.answer(
        "✍️ <b>Content Bot</b>\n\nAI-генерация постов, описаний и рецептов.",
        reply_markup=cnt_menu_kb(),
    )


@router.callback_query(F.data == "cnt:menu")
async def menu(cb: CallbackQuery, state: FSMContext):
    await state.clear()
    await cb.message.edit_text("✍️ Контент:", reply_markup=cnt_menu_kb())
    await cb.answer()


@router.callback_query(F.data == "cnt:insta")
async def insta(cb: CallbackQuery, state: FSMContext):
    await state.update_data(content_type="insta")
    await state.set_state(ContentStates.entering_topic)
    await cb.message.edit_text(
        "Введите тему или продукт для Instagram поста (например: 'горошек', 'полезный завтрак'):",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "cnt:tg")
async def tg(cb: CallbackQuery, state: FSMContext):
    await state.update_data(content_type="tg")
    await state.set_state(ContentStates.entering_topic)
    await cb.message.edit_text(
        "Введите тему для Telegram поста:", reply_markup=back_kb()
    )
    await cb.answer()


@router.callback_query(F.data == "cnt:desc")
async def desc(cb: CallbackQuery, state: FSMContext):
    await state.update_data(content_type="desc")
    await state.set_state(ContentStates.entering_topic)
    await cb.message.edit_text(
        "Введите название продукта для описания:", reply_markup=back_kb()
    )
    await cb.answer()


@router.callback_query(F.data == "cnt:recipe")
async def recipe(cb: CallbackQuery, state: FSMContext):
    await state.update_data(content_type="recipe")
    await state.set_state(ContentStates.entering_topic)
    await cb.message.edit_text(
        "Введите главный ингредиент для рецепта (например: 'руккола', 'редис'):",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "cnt:plan")
async def plan(cb: CallbackQuery, state: FSMContext):
    await state.update_data(content_type="plan")
    await state.set_state(ContentStates.entering_topic)
    await cb.message.edit_text(
        "Введите тематику или фокус для контент-плана:", reply_markup=back_kb()
    )
    await cb.answer()


@router.callback_query(F.data == "cnt:ai")
async def start_ai(cb: CallbackQuery, state: FSMContext):
    await state.update_data(content_type="ai")
    await state.set_state(ContentStates.entering_topic)
    await cb.message.edit_text(
        "🤖 Опишите подробно, какой контент вам нужен:", reply_markup=back_kb()
    )
    await cb.answer()


@router.message(ContentStates.entering_topic, F.text)
async def generate_content(msg: Message, state: FSMContext):
    data = await state.get_data()
    content_type = data.get("content_type")
    topic = msg.text

    await simulate_typing(msg, delay=2)

    if content_type == "insta":
        r = await ai.chat_completion(
            "Ты SMM-менеджер Microgreen Uzbekistan.",
            f"Напиши пост для Instagram о: {topic}. С эмодзи и хештегами.",
        )
        await msg.answer(f"📸 <b>Instagram пост:</b>\n\n{r}", reply_markup=back_kb())
    elif content_type == "tg":
        r = await ai.chat_completion(
            "Ты контент-менеджер Telegram канала Microgreen Uzbekistan.",
            f"Напиши информационный пост для Telegram канала на тему: {topic}.",
        )
        await msg.answer(f"📢 <b>Telegram пост:</b>\n\n{r}", reply_markup=back_kb())
    elif content_type == "desc":
        r = await ai.chat_completion(
            "Ты копирайтер Microgreen Uzbekistan.",
            f"Напиши продающее описание для продукта: {topic}.",
        )
        await msg.answer(f"📝 <b>Описание товара:</b>\n\n{r}", reply_markup=back_kb())
    elif content_type == "recipe":
        r = await ai.chat_completion(
            "Ты шеф-повар.",
            f"Напиши простой рецепт для ресторана или дома, используя: {topic}.",
        )
        await msg.answer(f"🍽 <b>Рецепт:</b>\n\n{r}", reply_markup=back_kb())
    elif content_type == "plan":
        r = await ai.chat_completion(
            "Ты SMM-стратег Microgreen Uzbekistan.",
            f"Составь контент-план на неделю для соцсетей на тему: {topic}.",
        )
        await msg.answer(f"📅 <b>Контент-план:</b>\n\n{r}", reply_markup=back_kb())
    elif content_type == "ai":
        r = await ai.chat_completion("Ты копирайтер Microgreen Uzbekistan.", topic)
        await msg.answer(f"🤖 <b>AI Копирайтер:</b>\n\n{r}", reply_markup=back_kb())
    else:
        await msg.answer("Неизвестный тип контента.", reply_markup=back_kb())

    await state.clear()
