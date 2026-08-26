"""Sales Bot — AI-чат с менеджером."""

from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from shared.ai_engine import AIEngine
from shared.utils import simulate_typing
from bots.sales_bot.keyboards.inline import main_menu, back_menu_kb
from shared.prompts import TEAM_CONTEXT

router = Router()
ai = AIEngine()


@router.callback_query(F.data == "menu:ai_chat")
async def start_ai_chat(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await cb.message.edit_text(
        "💬 Задайте любой вопрос о нашей продукции!"
        if lang == "ru"
        else "💬 Mahsulotlarimiz haqida savolingizni bering!",
        reply_markup=back_menu_kb(lang),
    )
    await cb.answer()


@router.callback_query(F.data == "menu:orders")
async def show_orders(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    from sqlalchemy import text as sqt
    from shared.database import get_session_ctx

    async with get_session_ctx() as session:
        res = await session.execute(
            sqt(
                "SELECT order_number, total_amount, status, created_at FROM crm_orders "
                "WHERE customer_id = (SELECT id FROM customers WHERE telegram_id = :tid) "
                "ORDER BY created_at DESC LIMIT 5"
            ),
            {"tid": cb.from_user.id},
        )
        orders = res.fetchall()

    if not orders:
        await cb.message.edit_text(
            "📦 У вас пока нет заказов"
            if lang == "ru"
            else "📦 Sizda hali buyurtmalar yo'q",
            reply_markup=await main_menu(lang),
        )
    else:
        from shared.utils import format_price

        lines = [
            "📦 <b>Ваши заказы:</b>\n"
            if lang == "ru"
            else "📦 <b>Buyurtmalaringiz:</b>\n"
        ]
        for o in orders:
            lines.append(
                f"#{o.order_number} — {format_price(o.total_amount)} ({o.status})"
            )
        await cb.message.edit_text("\n".join(lines), reply_markup=await main_menu(lang))
    await cb.answer()


@router.message(F.text, F.chat.type == "private")
async def ai_fallback(message: Message, state: FSMContext):
    await simulate_typing(message, delay=2)
    from shared.prompts import TEAM_CONTEXT
    from shared.feedback_loop import feedback_loop

    # Получаем динамические параметры поведения (петля обратной связи)
    active_behavior = await feedback_loop.get_active_behavior("sales_bot", "conversion")
    tone_modifier = active_behavior.get(
        "tone_modifier", "Будь доброжелателен и подчеркивай свежесть продукции."
    )

    prompt = (
        f"{TEAM_CONTEXT}\n\n"
        "Ты — Коммерческий Директор (CRO) Microgreen Uzbekistan. Сейчас ты общаешься с клиентом.\n"
        f"Указание по стилю (из петель обучения): {tone_modifier}\n"
        "Твоя цель: квалифицировать лид, провести презентацию ценности (value proposition) микрозелени и закрыть сделку."
    )

    response = await ai.chat_completion(
        system_prompt=prompt, user_message=message.text, effort="high"
    )
    await message.answer(response)


@router.message(F.photo, F.chat.type == "private")
async def ai_vision_recipe(message: Message, state: FSMContext):
    """Smart Fridge Recipe feature: analyzes photo and suggests a recipe with microgreens."""
    import base64
    from io import BytesIO

    msg = await message.answer("🔍 Изучаю содержимое... Придумываю рецепт...")
    await simulate_typing(message, delay=2)

    try:
        # Get the highest resolution photo
        photo = message.photo[-1]
        file_info = await message.bot.get_file(photo.file_id)

        # Download file to memory
        downloaded_file = await message.bot.download_file(
            file_info.file_path, destination=BytesIO()
        )
        image_bytes = downloaded_file.read()
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")

        vision_prompt = (
            "Посмотри на фотографию продуктов (например, в холодильнике). "
            "1) Перечисли, какие продукты ты видишь.\n"
            "2) Придумай 1 шикарный ресторанный рецепт или полезный завтрак из этих продуктов.\n"
            "3) ОБЯЗАТЕЛЬНО добавь в рецепт нашу микрозелень (рукколу, базилик, горошек или шпинат) и скажи, как она улучшит вкус блюда.\n"
            "4) В конце предложи клиенту заказать микрозелень прямо сейчас (например, набор 'Стартовый')."
        )

        response = await ai.chat_completion(
            # Командный контекст (включает фирменный голос) — как в соседнем
            # обработчике ниже. Раньше здесь была одна строка без бренда.
            system_prompt=(
                f"{TEAM_CONTEXT}\n\n"
                "Ты — шеф-повар и менеджер по продажам Microgreen Uzbekistan. "
                "Смотришь на фото продуктов клиента и предлагаешь рецепт. "
                "Не выдумывай, чего на фото нет: перечисляй только то, что видишь."
            ),
            user_message=vision_prompt,
            image_base64=image_b64,
            max_tokens=800,
        )

        await msg.edit_text(response)
    except Exception as e:
        import logging

        logging.error(f"Vision error: {e}", exc_info=True)
        await msg.edit_text(
            "Извините, не удалось проанализировать фотографию. Попробуйте еще раз позже."
        )
