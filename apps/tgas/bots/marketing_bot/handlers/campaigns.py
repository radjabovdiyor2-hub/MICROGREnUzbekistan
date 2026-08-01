"""Marketing Bot — Campaigns, Segments, Promos, Competitors, Analytics"""

import logging
import asyncio
from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.ai_engine import AIEngine
from shared.utils import simulate_typing
from bots.marketing_bot.states import CampaignStates
from bots.marketing_bot.keyboards.inline import (
    back_kb,
    segments_kb,
    confirm_kb,
    mkt_menu_kb,
)

router = Router()
ai = AIEngine()


@router.callback_query(F.data == "mkt:campaign")
async def create_campaign(cb: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(CampaignStates.choosing_segment)
    await cb.message.edit_text(
        "📢 <b>Создание рассылки</b>\n\nВыберите сегмент:", reply_markup=segments_kb()
    )
    await cb.answer()


@router.callback_query(CampaignStates.choosing_segment, F.data.startswith("mkt:seg:"))
async def pick_segment(cb: CallbackQuery, state: FSMContext) -> None:
    seg = cb.data.split(":")[-1]
    await state.update_data(segment=seg)
    await state.set_state(CampaignStates.entering_message)
    await cb.message.edit_text("✍️ Введите текст рассылки:")
    await cb.answer()


@router.message(CampaignStates.entering_message)
async def campaign_text(msg: Message, state: FSMContext) -> None:
    d = await state.get_data()
    await state.update_data(text=msg.text)
    await state.set_state(CampaignStates.confirming)
    await msg.answer(
        f"🔍 <b>Превью:</b>\n━━━━━━━━━━━━━━━━━━\n{msg.text}\n━━━━━━━━━━━━━━━━━━\n\n👥 Сегмент: {d['segment']}\n\nОтправить?",
        reply_markup=confirm_kb(),
    )


@router.callback_query(CampaignStates.confirming, F.data == "mkt:send_yes")
async def send_campaign(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    segment = data.get("segment")
    message_text = data.get("text")

    await state.clear()
    await cb.message.edit_text("⏳ Рассылка началась...", reply_markup=None)

    query_str = "SELECT telegram_id FROM customers WHERE telegram_id IS NOT NULL"
    if segment == "b2b":
        query_str += " AND customer_type = 'b2b'"
    elif segment == "b2c":
        query_str += " AND customer_type = 'b2c'"
    elif segment == "vip":
        query_str += " AND status = 'vip'"
    elif segment == "churn":
        query_str += " AND status = 'churned'"

    async with get_session_ctx() as session:
        result = await session.execute(text(query_str))
        users = result.fetchall()

    success_count = 0
    for row in users:
        tg_id = row[0]
        try:
            await cb.bot.send_message(chat_id=tg_id, text=message_text)
            success_count += 1
            await asyncio.sleep(0.05)  # Rate limiting
        except Exception as e:
            logging.error(f"Failed to send to {tg_id}: {e}")

    await cb.message.edit_text(
        f"✅ Рассылка завершена!\n\nУспешно отправлено: {success_count} пользователям.",
        reply_markup=mkt_menu_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "mkt:send_no")
async def cancel_campaign(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await cb.message.edit_text("❌ Рассылка отменена.", reply_markup=mkt_menu_kb())
    await cb.answer()


@router.callback_query(F.data == "mkt:segments")
async def show_segments(cb: CallbackQuery) -> None:
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT COUNT(*) as total, "
                "COUNT(*) FILTER (WHERE customer_type='b2b') as b2b, "
                "COUNT(*) FILTER (WHERE customer_type='b2c') as b2c, "
                "COUNT(*) FILTER (WHERE status='vip') as vip, "
                "COUNT(*) FILTER (WHERE status='active') as active, "
                "COUNT(*) FILTER (WHERE status='churned') as churned "
                "FROM customers"
            )
        )
        c = r.fetchone()
    await cb.message.edit_text(
        f"👥 <b>Сегменты аудитории</b>\n━━━━━━━━━━━━━━━━━━\n"
        f"🏢 B2B: {c.b2b}\n🛒 B2C: {c.b2c}\n"
        f"⭐ VIP: {c.vip}\n✅ Активные: {c.active}\n"
        f"❌ Отток: {c.churned}\n📊 Всего: {c.total}",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "mkt:promo")
async def show_promo(cb: CallbackQuery) -> None:
    await cb.message.edit_text(
        "🏷️ <b>Пример акции:</b>\n━━━━━━━━━━━━━━━━━━\n"
        "🌱 Руккола микрозелень\n\n💰 Было: 55 000 сум\n"
        "🔥 Стало: 44 000 сум (-20%)\n\n📅 01.07 — 07.07.2026\n"
        "🚚 Бесплатная доставка от 500 000 сум\n\n📞 +998 94 999 95 99\n"
        "🌐 microgreenuzbekistan.com",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "mkt:analytics")
async def mkt_analytics(cb: CallbackQuery) -> None:
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT COUNT(*) as cnt, COUNT(*) FILTER (WHERE interaction_type='order') as orders "
                "FROM interactions WHERE created_at >= date_trunc('month', CURRENT_DATE)"
            )
        )
        d = r.fetchone()
    await cb.message.edit_text(
        f"📊 <b>Маркетинг аналитика</b>\n━━━━━━━━━━━━━━━━━━\n"
        f"📨 Взаимодействий: {d.cnt}\n📦 Из них заказы: {d.orders}",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "mkt:competitors")
async def competitors(cb: CallbackQuery) -> None:
    await simulate_typing(cb.message, delay=2)
    from shared.prompts import TEAM_CONTEXT

    resp = await ai.chat_completion(
        f"{TEAM_CONTEXT}\n\nТы маркетолог Microgreen Uzbekistan.",
        "Дай краткий SWOT-анализ для магазина микрозелени в Самарканде.",
    )
    await cb.message.edit_text(
        f"🔍 <b>Конкурентный анализ:</b>\n\n{resp}", reply_markup=back_kb()
    )
    await cb.answer()


@router.callback_query(F.data == "mkt:ideas")
async def promo_ideas(cb: CallbackQuery) -> None:
    await simulate_typing(cb.message, delay=2)
    from shared.prompts import TEAM_CONTEXT

    resp = await ai.chat_completion(
        f"{TEAM_CONTEXT}\n\nТы креативный маркетолог Microgreen Uzbekistan.",
        "Придумай 3 идеи для промо-акции на микрозелень в Узбекистане на этой неделе.",
    )
    await cb.message.edit_text(f"💡 <b>AI Идеи:</b>\n\n{resp}", reply_markup=back_kb())
    await cb.answer()


@router.message(F.text, F.chat.type == "private")
async def ai_mkt(msg: Message) -> None:
    await simulate_typing(msg, delay=2)
    from shared.prompts import TEAM_CONTEXT

    resp = await ai.chat_completion(
        f"{TEAM_CONTEXT}\n\nТы маркетолог Microgreen Uzbekistan. Помогай пользователю с маркетинговыми задачами. Если задача выходит за рамки маркетинга, отправь его к Степану или профильному боту.",
        msg.text,
    )
    await msg.answer(resp)
