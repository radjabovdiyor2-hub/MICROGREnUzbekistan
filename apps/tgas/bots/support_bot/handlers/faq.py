"""Support Bot — FAQ, Orders, Recipes, Complaints, AI"""

import logging

from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.config import settings
from shared.database import get_session_ctx
from shared.utils import format_price, simulate_typing
from shared.ai_engine import AIEngine
from bots.support_bot.keyboards.inline import back_kb, sup_menu_kb
from bots.support_bot.states import ComplaintStates

logger = logging.getLogger(__name__)
router = Router()
ai = AIEngine()

FAQ = [
    ("Как заказать?", "Нажмите /start в боте продаж и выберите Каталог."),
    ("Доставка?", "Бесплатно от 500 000 сум по Самарканду."),
    # Click/Payme не предлагаем: онлайн-оплаты в системе нет (см. CLAUDE.md).
    ("Оплата?", "Наличные, картой курьеру, банковский перевод."),
    ("Возврат?", "В течение 24 часов при сохранении упаковки."),
    ("Хранение?", "В холодильнике при +4°C, до 7 дней."),
]


@router.callback_query(F.data == "sup:faq")
async def faq(cb: CallbackQuery):
    lines = ["❓ <b>FAQ</b>\n━━━━━━━━━━━━━━━━━━"]
    for q, a in FAQ:
        lines.append(f"\n<b>Q: {q}</b>\nA: {a}")
    await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()


@router.callback_query(F.data == "sup:order")
async def order_status(cb: CallbackQuery):
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT order_number, total_amount, status FROM crm_orders "
                "WHERE customer_id=(SELECT id FROM customers WHERE telegram_id=:tid) ORDER BY created_at DESC LIMIT 3"
            ),
            {"tid": cb.from_user.id},
        )
        orders = r.fetchall()
    if not orders:
        await cb.message.edit_text("📦 У вас нет заказов.", reply_markup=back_kb())
    else:
        lines = ["📦 <b>Ваши заказы:</b>\n"]
        emoji = {
            "new": "🆕",
            "confirmed": "✅",
            "preparing": "🔧",
            "ready": "📦",
            "delivering": "🚚",
            "delivered": "✅",
            "cancelled": "❌",
        }
        for o in orders:
            lines.append(
                f"{emoji.get(o.status, '📦')} #{o.order_number} — {format_price(o.total_amount)} ({o.status})"
            )
        await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()


@router.callback_query(F.data == "sup:recipes")
async def recipes(cb: CallbackQuery):
    await cb.message.edit_text(
        "🍽 <b>Рецепты с микрозеленью</b>\n━━━━━━━━━━━━━━━━━━\n\n"
        "🥗 <b>Салат с руколой</b>\nРукола, помидоры черри, моцарелла, оливковое масло.\n\n"
        "🥑 <b>Тост с авокадо</b>\nАвокадо, микрозелень гороха, лимонный сок.\n\n"
        "🍝 <b>Паста с базиликом</b>\nПаста, соус песто из микрозелени базилика.",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "sup:complaint")
async def complaint(cb: CallbackQuery, state: FSMContext):
    await state.set_state(ComplaintStates.entering_text)
    await cb.message.edit_text("📝 Опишите вашу проблему:")
    await cb.answer()


@router.message(ComplaintStates.entering_text)
async def complaint_text(msg: Message, state: FSMContext):
    async with get_session_ctx() as session:
        await session.execute(
            text(
                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                "VALUES ((SELECT id FROM customers WHERE telegram_id=:tid), 'telegram', 'complaint', 'support_bot', :s, NOW())"
            ),
            {"tid": msg.from_user.id, "s": msg.text},
        )
    # 🔗 EventBus: уведомляем PM бота о жалобе
    from shared.event_bus import event_bus, Events

    await event_bus.publish(
        Events.COMPLAINT_RECEIVED,
        {
            "summary": msg.text,
            "customer_name": msg.from_user.full_name,
            "telegram_id": msg.from_user.id,
        },
        source_bot="support_bot",
    )
    await state.clear()
    await msg.answer(
        "✅ Жалоба принята! Мы разберёмся в ближайшее время.",
        reply_markup=sup_menu_kb(),
    )


# Эмбеддинги для векторного поиска по базе знаний идут через общий движок.
# Свой AsyncOpenAI здесь был прямым AI-клиентом в обход mg_ai: расход мимо
# учёта ai_usage и третья копия ключа. Движок одноразовый на процесс.
_embeddings_engine = None


def _get_embeddings_engine():
    global _embeddings_engine
    if _embeddings_engine is None and settings.openai_api_key:
        from shared.ai_engine import AIEngine

        _embeddings_engine = AIEngine()
    return _embeddings_engine


# Про сломанную базу знаний пишем в лог один раз за процесс: иначе каждое
# сообщение клиента давало бы одинаковую строку и утопило остальные записи.
_kb_failure_logged = False


async def search_knowledge(query: str, limit: int = 2) -> str:
    """Ищет ответ в базе знаний. Пустая строка — база недоступна или пуста.

    ВАЖНО: пустой результат означает «искать было негде», а не «ответа нет».
    Вызывающий обязан это различать — иначе бот отвечает из общих знаний,
    пообещав клиенту поиск по базе. Раньше любая ошибка уходила в print()
    мимо логгера, и отсутствие таблицы knowledge_base никак не проявлялось:
    ответы выглядели правдоподобно, а база не участвовала вовсе.
    """
    global _kb_failure_logged
    try:
        engine = _get_embeddings_engine()
        if not engine:
            if not _kb_failure_logged:
                logger.warning(
                    "База знаний недоступна: не задан OPENAI_API_KEY — "
                    "поиск по базе выключен, бот отвечает из общих знаний"
                )
                _kb_failure_logged = True
            return ""
        emb = await engine.embed(query)
        if emb is None:
            return ""

        async with get_session_ctx() as session:
            r = await session.execute(
                text("""
                SELECT title, content FROM knowledge_base
                ORDER BY embedding <=> CAST(:emb AS vector) LIMIT :lim
            """),
                {"emb": str(emb), "lim": limit},
            )
            rows = r.fetchall()

        if not rows:
            return ""

        context_str = "\n\n".join([f"[{row.title}]\n{row.content}" for row in rows])
        return f"\nДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ИЗ БАЗЫ ЗНАНИЙ:\n{context_str}\n"
    except Exception as e:
        if not _kb_failure_logged:
            # Обычная причина — таблицы knowledge_base нет: её создаёт только
            # scripts/build_knowledge_base.py, а init.sql применяется лишь при
            # первой инициализации тома.
            logger.warning(
                "Поиск по базе знаний не работает (%s). Проверьте расширение "
                "vector и запустите scripts/build_knowledge_base.py",
                e,
            )
            _kb_failure_logged = True
        return ""


@router.callback_query(F.data == "sup:ai")
async def start_ai(cb: CallbackQuery):
    # Не обещаем поиск по базе знаний: она может быть не собрана, и тогда
    # обещание оказывается ложным — проверить это заранее нечем.
    await cb.message.edit_text(
        "🤖 Задайте вопрос — постараюсь помочь:", reply_markup=back_kb()
    )
    await cb.answer()


@router.message(F.text, F.chat.type == "private")
async def ai_chat(msg: Message):
    await simulate_typing(msg, delay=2)
    from bots.support_bot.main import get_dynamic_support_policy
    from shared.prompts import TEAM_CONTEXT

    kb_context = await search_knowledge(msg.text)

    role = "Ты ИИ-консультант поддержки Microgreen Uzbekistan."
    if kb_context:
        task = (
            "Опирайся на приведённую базу знаний. Если ответа в ней нет, отвечай "
            "вежливо из общих знаний, но не придумывай правила компании."
        )
    else:
        # База не отдала ничего — не упоминаем её вовсе, иначе модель ссылается
        # на источник, которого не видела, и звучит увереннее, чем вправе.
        task = (
            "Отвечай вежливо и по делу. НЕ придумывай правила компании, цены, "
            "сроки и условия: если точных данных нет — скажи об этом и "
            "предложи уточнить у менеджера."
        )

    system_prompt = f"{TEAM_CONTEXT}\n\n{role} {task}{kb_context}"

    resp = await ai.chat_completion(await get_dynamic_support_policy(system_prompt), msg.text, effort="medium")
    await msg.answer(resp)
