"""Support Bot — FAQ, Orders, Recipes, Complaints, AI"""
from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.utils import format_price, simulate_typing
from shared.ai_engine import AIEngine
from bots.support_bot.keyboards.inline import back_kb, sup_menu_kb
from bots.support_bot.states import ComplaintStates
router = Router()
ai = AIEngine()

FAQ = [("Как заказать?","Нажмите /start в боте продаж и выберите Каталог."),
       ("Доставка?","Бесплатно от 500 000 сум по Самарканду."),
       ("Оплата?","Наличные, Click, Payme, перевод."),
       ("Возврат?","В течение 24 часов при сохранении упаковки."),
       ("Хранение?","В холодильнике при +4°C, до 7 дней.")]

@router.callback_query(F.data == "sup:faq")
async def faq(cb: CallbackQuery):
    lines = ["❓ <b>FAQ</b>\n━━━━━━━━━━━━━━━━━━"]
    for q, a in FAQ: lines.append(f"\n<b>Q: {q}</b>\nA: {a}")
    await cb.message.edit_text("\n".join(lines), reply_markup=back_kb()); await cb.answer()

@router.callback_query(F.data == "sup:order")
async def order_status(cb: CallbackQuery):
    async with get_session_ctx() as session:
        r = await session.execute(text(
            "SELECT order_number, total_amount, status FROM orders "
            "WHERE customer_id=(SELECT id FROM customers WHERE telegram_id=:tid) ORDER BY created_at DESC LIMIT 3"),
            {"tid": cb.from_user.id})
        orders = r.fetchall()
    if not orders:
        await cb.message.edit_text("📦 У вас нет заказов.", reply_markup=back_kb())
    else:
        lines = ["📦 <b>Ваши заказы:</b>\n"]
        emoji = {"new":"🆕","confirmed":"✅","preparing":"🔧","ready":"📦","delivering":"🚚","delivered":"✅","cancelled":"❌"}
        for o in orders:
            lines.append(f"{emoji.get(o.status,'📦')} #{o.order_number} — {format_price(o.total_amount)} ({o.status})")
        await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()

@router.callback_query(F.data == "sup:recipes")
async def recipes(cb: CallbackQuery):
    await cb.message.edit_text(
        "🍽 <b>Рецепты с микрозеленью</b>\n━━━━━━━━━━━━━━━━━━\n\n"
        "🥗 <b>Салат с руколой</b>\nРукола, помидоры черри, моцарелла, оливковое масло.\n\n"
        "🥑 <b>Тост с авокадо</b>\nАвокадо, микрозелень гороха, лимонный сок.\n\n"
        "🍝 <b>Паста с базиликом</b>\nПаста, соус песто из микрозелени базилика.", reply_markup=back_kb())
    await cb.answer()

@router.callback_query(F.data == "sup:complaint")
async def complaint(cb: CallbackQuery, state: FSMContext):
    await state.set_state(ComplaintStates.entering_text)
    await cb.message.edit_text("📝 Опишите вашу проблему:"); await cb.answer()

@router.message(ComplaintStates.entering_text)
async def complaint_text(msg: Message, state: FSMContext):
    async with get_session_ctx() as session:
        await session.execute(text(
            "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
            "VALUES ((SELECT id FROM customers WHERE telegram_id=:tid), 'telegram', 'complaint', 'support_bot', :s, NOW())"),
            {"tid": msg.from_user.id, "s": msg.text})
    # 🔗 EventBus: уведомляем PM бота о жалобе
    from shared.event_bus import event_bus, Events
    await event_bus.publish(Events.COMPLAINT_RECEIVED, {
        "summary": msg.text, "customer_name": msg.from_user.full_name,
        "telegram_id": msg.from_user.id
    }, source_bot="support_bot")
    await state.clear()
    await msg.answer("✅ Жалоба принята! Мы разберёмся в ближайшее время.", reply_markup=sup_menu_kb())

from shared.config import settings
from openai import AsyncOpenAI

openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

async def search_knowledge(query: str, limit: int = 2) -> str:
    try:
        response = await openai_client.embeddings.create(input=query, model="text-embedding-3-small")
        emb = response.data[0].embedding
        
        async with get_session_ctx() as session:
            r = await session.execute(text("""
                SELECT title, content FROM knowledge_base 
                ORDER BY embedding <=> CAST(:emb AS vector) LIMIT :lim
            """), {"emb": str(emb), "lim": limit})
            rows = r.fetchall()
            
        if not rows:
            return ""
        
        context_str = "\n\n".join([f"[{row.title}]\n{row.content}" for row in rows])
        return f"\nДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ИЗ БАЗЫ ЗНАНИЙ:\n{context_str}\n"
    except Exception as e:
        print(f"RAG Error: {e}")
        return ""

@router.callback_query(F.data == "sup:ai")
async def start_ai(cb: CallbackQuery):
    await cb.message.edit_text("🤖 Задайте вопрос (я поищу ответ в базе знаний):", reply_markup=back_kb())
    await cb.answer()

@router.message(F.text, F.chat.type == "private")
async def ai_chat(msg: Message):
    await simulate_typing(msg, delay=2)
    from shared.prompts import TEAM_CONTEXT
    
    kb_context = await search_knowledge(msg.text)
    system_prompt = f"{TEAM_CONTEXT}\n\nТы ИИ-консультант поддержки Microgreen Uzbekistan. Опирайся на предоставленную базу знаний для ответов на вопросы клиента. Если ответа нет в базе, отвечай вежливо из общих знаний, но не придумывай правила компании.{kb_context}"
    
    resp = await ai.chat_completion(system_prompt, msg.text)
    await msg.answer(resp)
