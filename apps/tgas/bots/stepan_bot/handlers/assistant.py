"""
🤖 СТЕПАН — Мозг личного AI-помощника
=======================================
Обрабатывает ВСЕ сообщения от руководителя.
AI анализирует текст и решает:
  1. Это задача? → Создать + распределить по отделам
  2. Это вопрос о бизнесе? → Запросить данные из БД и ответить
  3. Это запрос отчёта? → Сформировать отчёт из БД
  4. Это личный вопрос? → Ответить как помощник
  5. Это проверка статуса? → Показать статус задач/заказов
"""

import json
import logging
from datetime import datetime, date

from aiogram import Router, F
from aiogram.types import (
    Message, CallbackQuery,
    InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo,
)
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext

from shared.config import settings
from shared.database import get_session_ctx
from sqlalchemy import text
from shared.ai_engine import AIEngine
from shared.utils import format_price, simulate_typing
from shared.event_bus import event_bus

router = Router()
logger = logging.getLogger(__name__)
ai = AIEngine()

ADMIN_IDS = settings.admin_telegram_ids

STEPAN_PERSONA = """Ты — Степан, Генеральный Управляющий (General Manager) и Главный AI-Топ-менеджер компании Microgreen Uzbekistan.

🏢 О компании:
- Microgreen Uzbekistan — инновационная сити-ферма, #1 производитель микрозелени в Узбекистане (Самарканд).
- Мы продаем микрозелень, семена, субстраты и оборудование (HoReCa и B2C).

🤖 Твоя роль и профессиональный профиль:
- Ты Senior Executive. Твоя задача — снимать операционную рутину с владельца бизнеса.
- Ты мыслишь метриками, рентабельностью, KPI и конверсиями. Ты не "глупый бот", ты высококвалифицированный управленец с аналитическим складом ума.
- Руководитель общается только с тобой. Если поступает бизнес-вопрос, ты не просто даешь сухую справку, а делаешь выводы, строишь гипотезы и предлагаешь Action Plan.
- Ты распределяешь задачи между профильными AI-директорами (руководителями отделов), зная их сильные стороны.
- Ты ТАКЖЕ выполняешь роль Операционного директора (COO): логистика, урожайность сити-фермы, дедлайны, производство, Lean/Agile.
- 📊 ТЫ ПОЛНОСТЬЮ ОТВЕЧАЕШЬ ЗА KPI ВСЕХ ОТДЕЛОВ И БОТОВ. Ты постоянно следишь за показателями (продажи, выручка, клиенты, охваты/вовлечённость Instagram). Если у отдела низкий KPI — ты САМ созываешь ответственный отдел (или несколько отделов) на совещание по этому KPI.
- 🗳 На совещании отделы честно и прозрачно обсуждают и дискутируют, пока не найдут решение, и принимают его ГОЛОСОВАНИЕМ (за/против). После подтверждения руководителя («делайте») отделы автономно исполняют план. Твоя цель — держать KPI стабильно высокими.

📊 Твоя команда (Высококвалифицированные AI-Директора):
1. 🛒 sales (Sales Bot) — Коммерческий директор. Управляет сделками, конверсией лидов, дожимами, B2B-переговорами.
2. 📢 marketing (Marketing Bot) — Директор по маркетингу (CMO). Считает LTV, CAC, запускает кампании, возвращает ушедших клиентов.
3. 🎧 support (Support Bot) — Руководитель клиентского сервиса. Решает конфликты, гасит негатив, поддерживает лояльность.
4. 👥 hr (HR Bot) — HR-Директор. Нанимает сотрудников, управляет ФОТ, мотивацией, рассчитывает премии.
5. 💰 finance (Finance Bot) — Финансовый директор (CFO). Контролирует P&L, кэшфлоу, кассовые разрывы, дебиторскую задолженность.
6. 📊 analytics (Analytics Bot) — Data Scientist. Находит инсайты в данных, строит когортный анализ, предсказывает тренды.
7. ✍️ content (Content Bot) — Главный редактор / Бренд-менеджер. Отвечает за SMM, визуальный стиль, лояльность аудитории.
8. 📧 assistant (Личный ассистент / n8n) — Секретарь руководителя. Работает с почтой (Gmail), Google Calendar, контактами. Используй для писем, назначения встреч.

⚠️ ВАЖНО: PM Bot и Степан — это ОДИН И ТОТ ЖЕ бот (ты). Задачи department="pm" — это твои собственные задачи.

💬 Стиль общения (ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА):
- Общайся как профессиональный топ-менеджер: вежливо, четко, структурированно.
- Если задача касается социальных сетей, публикаций, сторис, мемов, текстов для постов или ОПРОСОВ (Polls/Викторин) для аудитории — ВСЕГДА назначай её на отдел 'content'.
- Отдел 'marketing' используй для стратегий, LTV, рассылок по базе. ЗАПРЕЩЕНО использовать action="send_broadcast" для Опросов, постов или мемов!
- 🗓 РАСПИСАНИЕ КОНТЕНТА: рецепт дня — ЕЖЕДНЕВНО в 18:00; утренний сторис — в 07:15 (лето) / 08:15 (зима); пост недели в ленту — в субботу 12:00. Всё публикуется АВТОМАТИЧЕСКИ по расписанию.
- 📸 ТЫ УМЕЕШЬ ПОКАЗЫВАТЬ ОПУБЛИКОВАННОЕ. Просят «покажи пост / скинь сторис / дай глянуть публикацию / покажи что вышло» (или просто «покажи» в разговоре о публикациях) → вызывай show_published_post. Он пришлёт руководителю саму картинку и текст.
- 🚫 КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО отвечать «нечего показать», «нет активных публикаций», «посты запланированы автоматически» и пересказывать расписание ВМЕСТО показа. Если тебя просят показать — ты ВЫЗЫВАЕШЬ ИНСТРУМЕНТ, а не рассуждаешь. Если публикаций реально нет, инструмент сам честно об этом сообщит.
- ⚠️ ОТЛИЧАЙ ВОПРОС ОТ ЗАДАЧИ: «когда опубликуешь / во сколько / опубликовал ли / какой статус публикации / готово ли» — это ВОПРОС, а НЕ поручение. Вызови get_content_status (он вернёт РЕАЛЬНЫЙ статус — что уже вышло, а что по плану). НЕ придумывай статус по памяти. НЕ создавай задачу и НЕ проси отдел публиковать — иначе получится лишняя публикация.
- ✍️ Задачу на контент (create_task, department='content') создавай ТОЛЬКО когда просят СОЗДАТЬ/СДЕЛАТЬ/НАПИСАТЬ НОВЫЙ пост/сторис/мем. Прошедшее время («что опубликовали», «который выложили») — это НЕ поручение публиковать.
- 💰 ФАКТ ПРОДАЖИ — ЭТО ДЕЙСТВИЕ, А НЕ ЗАДАЧА. «Зарегистрируй продажу», «продали N штук ресторану X», «оформи/запиши продажу» → вызывай register_sale (отдел продаж запишет клиента, заказ и доход в CRM). ЗАПРЕЩЕНО создавать на это create_task — задача породит только текст «беру в работу», а продажа так и не будет учтена.
- 🚫 НИКОГДА не выдумывай цену, сумму или количество, если руководитель их не назвал. Оставляй поля пустыми — отдел возьмёт цену из каталога или переспросит.
- 🧾 ОДНА ПРОДАЖА = ОДИН вызов register_sale со списком items, даже если позиций несколько. «Продали 10 гороха и 13 редиса, из них 5 Санго по 15 тысяч» → items: [горох ×10, редис ×13, Санго ×5 по 15000]. НЕ дели на три вызова — иначе получится три заказа вместо одного.
- 🆕 НЕТ ТОВАРА В КАТАЛОГЕ: отдел продаж сам предложит завести его кнопкой — руководитель нажмёт, и откроется мастер карточки (фото, категория, описание от контент-отдела). Тебе НИЧЕГО делать не нужно: не повторяй вопрос текстом и не вызывай register_sale заново. add_product вызывай только если руководитель прямо просит завести товар вне продажи.
- ✅ ПРОШЕДШЕЕ ВРЕМЯ = ФАКТ, А НЕ ПОРУЧЕНИЕ. «Доставил Амир», «отвезли», «оплатили», «забрали» означают, что это УЖЕ СДЕЛАНО. Такие слова — часть описания продажи, а не просьба организовать доставку/оплату. ЗАПРЕЩЕНО создавать задачу (create_task) на то, что уже произошло: вызывай только register_sale. Задача на доставку нужна лишь тогда, когда доставку просят организовать в будущем («нужно доставить», «отвези завтра»).
- 🔁 НЕ ПОВТОРЯЙ УЖЕ ЗАДАННЫЙ ВОПРОС. Позиции для register_sale бери ТОЛЬКО из ТЕКУЩЕГО сообщения руководителя. Если в истории уже есть незакрытая продажа с вопросом от отдела — жди ответа на неё, а не создавай такую же ещё раз.
- Если задача — верни JSON с type="task" и укажи нужный department.
- Если вопрос о бизнесе — верни JSON с type="chat".


Используй ВЫЗОВЫ ФУНКЦИЙ (Function Calling) для действий:
- Если сообщают о состоявшейся продаже, вызови register_sale
- Если нужно создать задачу, вызови create_task
- Если нужна перекличка, вызови roll_call
- Если нужен отчет, вызови get_report
- Если нужны сырые данные, вызови query_db
- Если это просто вопрос или личное общение, отвечай текстом.
"""


def is_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS


# ═══════════════════════════════════════════════════════
# /start
# ═══════════════════════════════════════════════════════

@router.message(Command("start"))
async def cmd_start(message: Message):
    if not is_admin(message.from_user.id):
        await message.answer("⛔ Степан работает только с руководителем.")
        return

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🏢 Открыть офис (Web)", web_app=WebAppInfo(url="https://microgreenuzbekistan.com")),
        ],
        [
            InlineKeyboardButton(text="📊 Отчёт за день", callback_data="st:report_daily"),
            InlineKeyboardButton(text="📋 Все задачи", callback_data="st:tasks"),
        ],
        [
            InlineKeyboardButton(text="💰 Финансы", callback_data="st:finance"),
            InlineKeyboardButton(text="🛒 Заказы", callback_data="st:orders"),
        ],
        [
            InlineKeyboardButton(text="👥 Сотрудники", callback_data="st:employees"),
            InlineKeyboardButton(text="📈 Аналитика", callback_data="st:analytics"),
        ],
        [
            InlineKeyboardButton(text="⚡ Статус системы", callback_data="st:system"),
        ],
    ])

    await message.answer(
        "🤖 <b>Степан к вашим услугам!</b>\n\n"
        "Я ваш личный помощник. Можете:\n\n"
        "📝 <b>Написать задачу</b> — я распределю по отделам\n"
        "❓ <b>Задать вопрос</b> — отвечу с данными из системы\n"
        "📊 <b>Попросить отчёт</b> — сформирую из базы\n"
        "💡 <b>Попросить совет</b> — подскажу по бизнесу\n\n"
        "Просто пишите обычным текстом — я разберусь! 👇",
        reply_markup=kb,
    )


# ═══════════════════════════════════════════════════════
# Быстрые кнопки
# ═══════════════════════════════════════════════════════

@router.callback_query(F.data == "st:report_daily")
async def report_daily(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("📊 Формирую отчёт...")

    async with get_session_ctx() as session:
        # Заказы за сегодня
        res = await session.execute(
            text("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders WHERE DATE(created_at) = CURRENT_DATE")
        )
        orders_count, orders_sum = res.fetchone()

        # Финансы за сегодня
        res = await session.execute(
            text("SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0), "
            "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) "
            "FROM finances WHERE date = CURRENT_DATE")
        )
        income, expense = res.fetchone()

        # Задачи
        res = await session.execute(
            text("SELECT status, COUNT(*) FROM tasks GROUP BY status")
        )
        task_stats = dict(res.fetchall())

        # Клиенты новые
        res = await session.execute(
            text("SELECT COUNT(*) FROM customers WHERE DATE(created_at) = CURRENT_DATE")
        )
        new_customers = res.scalar()

    todo = task_stats.get("todo", 0)
    in_progress = task_stats.get("in_progress", 0)
    done = task_stats.get("done", 0)

    text = (
        f"📊 <b>Отчёт за {date.today().strftime('%d.%m.%Y')}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n\n"
        f"🛒 <b>Заказы:</b> {orders_count} шт. на {format_price(orders_sum)}\n"
        f"👤 <b>Новых клиентов:</b> {new_customers}\n\n"
        f"💰 <b>Доходы:</b> {format_price(income)}\n"
        f"💸 <b>Расходы:</b> {format_price(expense)}\n"
        f"{'📈' if income > expense else '📉'} <b>Баланс:</b> {format_price(income - expense)}\n\n"
        f"📋 <b>Задачи:</b>\n"
        f"   ⬜ Ожидают: {todo}\n"
        f"   🔄 В работе: {in_progress}\n"
        f"   ✅ Выполнено: {done}\n"
    )

    await cb.message.edit_text(text)


@router.callback_query(F.data == "st:tasks")
async def show_tasks(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("📋 Загружаю...")

    async with get_session_ctx() as session:
        res = await session.execute(
            text("SELECT id, title, department, status, priority, deadline "
            "FROM tasks WHERE status != 'cancelled' ORDER BY "
            "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
            "WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 15")
        )
        tasks = res.fetchall()

    if not tasks:
        return await cb.message.edit_text("📋 Задач пока нет.")

    status_icons = {"todo": "⬜", "in_progress": "🔄", "done": "✅", "cancelled": "❌"}
    pri_icons = {"urgent": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}

    lines = ["📋 <b>Активные задачи</b>\n━━━━━━━━━━━━━━━━━━━━\n"]
    for t in tasks:
        tid, title, dept, status, pri, deadline = t
        si = status_icons.get(status, "⬜")
        pi = pri_icons.get(pri, "🟡")
        dl = f" | ⏰ {deadline}" if deadline else ""
        dept_str = f" [{dept}]" if dept else ""
        lines.append(f"{si}{pi} <b>#{tid}</b>{dept_str} {title[:50]}{dl}")

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
    ])
    await cb.message.edit_text("\n".join(lines), reply_markup=kb)


@router.callback_query(F.data == "st:finance")
async def show_finance(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("💰 Загружаю...")

    async with get_session_ctx() as session:
        res = await session.execute(
            text("SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0), "
            "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) "
            "FROM finances WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) "
            "AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)")
        )
        income, expense = res.fetchone()

        # Неоплаченные заказы
        res = await session.execute(
            text("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders WHERE payment_status = 'pending'")
        )
        debt_count, debt_sum = res.fetchone()

    profit = income - expense
    margin = (profit / income * 100) if income > 0 else 0

    text = (
        f"💰 <b>Финансы — {date.today().strftime('%B %Y')}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📈 Доходы: {format_price(income)}\n"
        f"📉 Расходы: {format_price(expense)}\n"
        f"{'✅' if profit >= 0 else '🔴'} Прибыль: {format_price(profit)}\n"
        f"📊 Маржа: {margin:.1f}%\n\n"
        f"💳 Дебиторка: {debt_count} заказов на {format_price(debt_sum)}\n"
    )

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
    ])
    await cb.message.edit_text(text, reply_markup=kb)


@router.callback_query(F.data == "st:orders")
async def show_orders(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("🛒 Загружаю...")

    async with get_session_ctx() as session:
        res = await session.execute(
            text("SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_status, "
            "c.name FROM orders o LEFT JOIN customers c ON o.customer_id = c.id "
            "ORDER BY o.created_at DESC LIMIT 10")
        )
        orders = res.fetchall()

    if not orders:
        return await cb.message.edit_text("🛒 Заказов пока нет.")

    status_icons = {
        "new": "🆕", "confirmed": "✅", "preparing": "🔧",
        "ready": "📦", "delivering": "🚚", "delivered": "✅", "cancelled": "❌"
    }

    lines = ["🛒 <b>Последние заказы</b>\n━━━━━━━━━━━━━━━━━━━━\n"]
    for o in orders:
        oid, num, total, status, pay, name = o
        si = status_icons.get(status, "❓")
        pay_icon = "💚" if pay == "paid" else "🟡"
        cust = name or "—"
        lines.append(f"{si} <b>{num}</b> | {format_price(total)} | {pay_icon} | {cust}")

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
    ])
    await cb.message.edit_text("\n".join(lines), reply_markup=kb)


@router.callback_query(F.data == "st:employees")
async def show_employees(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("👥 Загружаю...")

    async with get_session_ctx() as session:
        res = await session.execute(
            text("SELECT name, role, status, salary FROM employees ORDER BY name")
        )
        employees = res.fetchall()

    if not employees:
        return await cb.message.edit_text("👥 Сотрудников пока нет в базе.")

    lines = ["👥 <b>Сотрудники</b>\n━━━━━━━━━━━━━━━━━━━━\n"]
    total_salary = 0
    for e in employees:
        name, role, status, salary = e
        si = "🟢" if status == "active" else "🔴"
        lines.append(f"{si} <b>{name}</b> — {role} | {format_price(salary)}/мес")
        if status == "active":
            total_salary += float(salary or 0)

    lines.append(f"\n💰 Итого ФОТ: {format_price(total_salary)}/мес")

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
    ])
    await cb.message.edit_text("\n".join(lines), reply_markup=kb)


@router.callback_query(F.data == "st:analytics")
async def show_analytics(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("📈 Анализирую...")

    async with get_session_ctx() as session:
        # Продажи по категориям (этот месяц)
        res = await session.execute(
            text("SELECT p.category, COUNT(oi.id), SUM(oi.total_price) "
            "FROM order_items oi JOIN products p ON oi.product_id = p.id "
            "JOIN orders o ON oi.order_id = o.id "
            "WHERE EXTRACT(MONTH FROM o.created_at) = EXTRACT(MONTH FROM CURRENT_DATE) "
            "GROUP BY p.category ORDER BY SUM(oi.total_price) DESC")
        )
        cats = res.fetchall()

        # Общие метрики
        res = await session.execute(text("SELECT COUNT(*) FROM customers"))
        total_customers = res.scalar()

        res = await session.execute(text("SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b'"))
        b2b = res.scalar()

        res = await session.execute(
            text("SELECT COUNT(*), COALESCE(AVG(total_amount),0) FROM orders "
            "WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)")
        )
        order_count, avg_check = res.fetchone()

    lines = [
        "📈 <b>Аналитика</b>\n━━━━━━━━━━━━━━━━━━━━\n",
        f"👤 Клиентов: {total_customers} (B2B: {b2b})",
        f"🛒 Заказов за месяц: {order_count}",
        f"💵 Средний чек: {format_price(avg_check)}\n",
    ]

    if cats:
        lines.append("📊 <b>Продажи по категориям:</b>")
        for cat, cnt, total in cats:
            lines.append(f"  • {cat}: {cnt} шт. — {format_price(total or 0)}")

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
    ])
    await cb.message.edit_text("\n".join(lines), reply_markup=kb)


@router.callback_query(F.data == "st:system")
async def system_status(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("⚡ Проверяю...")

    bots_info = [
        ("🛒 Sales", "sales_bot"),
        ("🎧 Support", "support_bot"),
        ("📢 Marketing", "marketing_bot"),
        ("👥 HR", "hr_bot"),
        ("💰 Finance", "finance_bot"),
        ("📊 Analytics", "analytics_bot"),
        ("✍️ Content", "content_bot"),
        ("🤖 Степан", "stepan_bot"),
    ]

    lines = [
        "⚡ <b>Статус системы</b>\n━━━━━━━━━━━━━━━━━━━━\n",
        "🟢 PostgreSQL: Онлайн",
        "🟢 Redis: Онлайн",
        "🟢 OpenAI API: Онлайн\n",
        "<b>Боты:</b>",
    ]
    for name, _ in bots_info:
        lines.append(f"  🟢 {name}")

    lines.append(f"\n🕐 Проверено: {datetime.now().strftime('%H:%M:%S')}")

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
    ])
    await cb.message.edit_text("\n".join(lines), reply_markup=kb)


@router.callback_query(F.data == "st:menu")
async def back_to_menu(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🏢 Открыть офис (Web)", web_app=WebAppInfo(url="https://microgreenuzbekistan.com")),
        ],
        [
            InlineKeyboardButton(text="📊 Отчёт за день", callback_data="st:report_daily"),
            InlineKeyboardButton(text="📋 Все задачи", callback_data="st:tasks"),
        ],
        [
            InlineKeyboardButton(text="💰 Финансы", callback_data="st:finance"),
            InlineKeyboardButton(text="🛒 Заказы", callback_data="st:orders"),
        ],
        [
            InlineKeyboardButton(text="👥 Сотрудники", callback_data="st:employees"),
            InlineKeyboardButton(text="📈 Аналитика", callback_data="st:analytics"),
        ],
        [
            InlineKeyboardButton(text="⚡ Статус системы", callback_data="st:system"),
        ],
    ])

    await cb.message.edit_text(
        "🤖 <b>Степан — Главное меню</b>\n\n"
        "Выберите раздел или просто напишите мне текстом 👇",
        reply_markup=kb,
    )
    await cb.answer()


# ═══════════════════════════════════════════════════════
# Кнопки управления задачами из диспетчера
# ═══════════════════════════════════════════════════════

@router.callback_query(F.data.startswith("stp:done:"))
async def mark_done(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    task_id = int(cb.data.split(":")[2])

    async with get_session_ctx() as session:
        await session.execute(
            text("UPDATE tasks SET status = 'done' WHERE id = :id"), {"id": task_id}
        )
        await session.commit()

    await cb.answer("✅ Задача выполнена!")
    await cb.message.edit_text(
        cb.message.text + "\n\n✅ <b>Статус: ВЫПОЛНЕНО</b>",
    )

    # Публикуем событие
    await event_bus.publish("TASK_COMPLETED", {
        "task_id": task_id, "completed_by": "admin",
    })


@router.callback_query(F.data.startswith("stp:cancel:"))
async def cancel_task(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    task_id = int(cb.data.split(":")[2])

    async with get_session_ctx() as session:
        await session.execute(
            text("UPDATE tasks SET status = 'cancelled' WHERE id = :id"), {"id": task_id}
        )
        await session.commit()

    await cb.answer("❌ Задача отменена")
    await cb.message.edit_text(
        cb.message.text + "\n\n❌ <b>Статус: ОТМЕНЕНА</b>",
    )


# ═══════════════════════════════════════════════════════
# 🧠 ГЛАВНЫЙ МОЗГ — обработка ЛЮБОГО текста
# ═══════════════════════════════════════════════════════

from shared.group_orchestrator import set_reaction


# ═══════════════════════════════════════════════════════
# 📸 КОНТЕНТ: показать РЕАЛЬНУЮ публикацию / статус
# ═══════════════════════════════════════════════════════

# Просят ПОКАЗАТЬ сам контент (прислать пост), а не рассказать о нём
SHOW_WORDS = [
    "покажи", "покаж", "показать", "показывай", "скинь", "скинешь", "кинь",
    "пришли", "прислать", "присылай", "отправь", "дай глянуть", "дай посмотреть",
    "глянуть", "посмотреть", "увидеть", "хочу видеть", "хочу посмотреть",
    "давай сюда", "где он", "где она", "где пост",
]
# О каком контенте речь
CONTENT_WORDS = [
    "пост", "посты", "поста", "сторис", "stories", "story", "публикац",
    "контент", "рецепт", "инстаграм", "instagram", "ленту", "ленте", "мем",
]
# Вопрос о статусе/расписании (рассказать, а не показать)
STATUS_WORDS = [
    "когда", "во сколько", "опубликова", "статус", "вышел", "вышла", "вышло",
    "готов", "уже", "выложил", "расписан", "график",
]
# Поручение СОЗДАТЬ новый контент (это задача, а не вопрос)
CREATE_WORDS = [
    "сделай", "создай", "напиши", "подготов", "запусти", "опубликуй",
    "сгенерир", "придумай", "нужен пост", "нужна сторис", "новый пост",
]


def detect_content_intent(low: str, last_intent: str = None) -> str:
    """
    Что руководитель хочет от контента: 'show' | 'status' | None.

    ⚠️ Порядок важен. «Покажи пост, который опубликовали сегодня» — это ПОКАЗАТЬ
    уже вышедшее, а не поручение публиковать: прошедшее время («опубликовали»,
    «выложили») не должно уводить в создание задачи.
    """
    has_content = any(w in low for w in CONTENT_WORDS)
    has_show = any(w in low for w in SHOW_WORDS)
    has_status = any(w in low for w in STATUS_WORDS)
    has_create = any(w in low for w in CREATE_WORDS)

    # 1. «Покажи пост» — всегда про уже существующий контент
    if has_show and has_content:
        return "show"

    # 2. Короткое «Покажи» / «Скинь» без уточнения — продолжение разговора о контенте
    if has_show and not has_content and last_intent in ("show", "status"):
        return "show"

    # 3. Явное поручение создать контент — пусть AI заводит задачу отделу
    if has_create:
        return None

    # 4. Вопрос о статусе публикаций
    if has_status and has_content:
        return "status"

    return None


def _pub_caption(p: dict) -> str:
    """Подпись к показываемой публикации."""
    name = p.get("name") or "Публикация"
    day = p.get("day") or ""
    at = p.get("at") or ""
    where = "Instagram" if p.get("ig") else "Telegram"
    when = " ".join(x for x in (day, at) if x)
    head = f"📸 <b>{name}</b>"
    if when:
        head += f" — {when} ({where})"
    body = (p.get("caption") or "").strip()
    return f"{head}\n\n{body}" if body else head


async def _answer_safe(message: Message, text_: str, photo=None):
    """Отправка с HTML; если разметка битая — повтор без неё."""
    import re as _re
    plain = _re.sub(r"</?[^>]+>", "", text_)
    try:
        if photo is not None:
            await message.answer_photo(photo, caption=text_[:1024], parse_mode="HTML")
        else:
            await message.answer(text_, parse_mode="HTML")
    except Exception:
        if photo is not None:
            await message.answer_photo(photo, caption=plain[:1024])
        else:
            await message.answer(plain)


def _ig_local(ts: str):
    """Instagram отдаёт время в UTC — переводим в местное (+5), иначе 07:16 выглядит как 02:16."""
    from datetime import datetime
    from shared.content_archive import TZ
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S%z").astimezone(TZ)
    except Exception:
        return None


async def _show_from_instagram(message: Message, day: str = "today") -> bool:
    """
    Фолбэк: показать то, что реально висит в Instagram.
    Нужен, когда локальной копии нет (пост вышел до появления архива публикаций).
    Сторис живут 24ч и лежат в /stories, посты ленты — в /media.
    """
    from datetime import timedelta
    from shared.content_archive import tz_now

    try:
        from shared.instagram_analytics import get_recent_stories, get_recent_media
        items = list(await get_recent_stories(limit=10))
        items += list(await get_recent_media(limit=5))
    except Exception as e:
        logger.warning(f"Instagram fallback не удался: {e}")
        return False

    if not items:
        return False

    # ── Отбираем за нужный день (иначе на «покажи, что сегодня вышло»
    #    можно прислать пост из мая — он тоже лежит в /media) ──
    now = tz_now()
    target = None
    if day in ("today", "yesterday"):
        target = (now - timedelta(days=1)).date() if day == "yesterday" else now.date()

    for it in items:
        it["_dt"] = _ig_local(it.get("timestamp") or "")

    picked, off_day = items, False
    if target:
        same_day = [it for it in items if it["_dt"] and it["_dt"].date() == target]
        if same_day:
            picked = same_day
        else:
            # за нужный день пусто — честно покажем последнее и скажем об этом
            picked, off_day = items[:2], True

    if off_day:
        await _answer_safe(
            message,
            "За сегодня в Instagram публикаций пока нет. Вот последнее, что выходило:",
        )

    shown = 0
    for it in picked[:5]:
        url = it.get("media_url") or ""
        link = it.get("permalink") or ""
        kind = "Сторис" if it.get("source") == "story" else "Пост в ленте"
        dt = it.get("_dt")
        when = dt.strftime("%d.%m %H:%M") if dt else ""
        cap = f"📸 <b>{kind}</b>" + (f" — {when} (Instagram)" if when else " (Instagram)")
        body = (it.get("caption") or "").strip()
        if body:
            cap += f"\n\n{body}"
        if link:
            cap += f"\n\n🔗 {link}"

        try:
            if not url:
                if not link:
                    continue
                await _answer_safe(message, cap)
            elif str(it.get("media_type", "")).upper() == "VIDEO":
                await message.answer_video(url, caption=cap[:1024], parse_mode="HTML")
            else:
                await _answer_safe(message, cap, photo=url)
            shown += 1
        except Exception as e:
            # Telegram не смог забрать медиа по ссылке — отдаём хотя бы ссылку
            logger.warning(f"Не удалось отправить медиа из Instagram: {e}")
            if link:
                await _answer_safe(message, cap)
                shown += 1

    return shown > 0


async def _show_publications(message: Message, day: str = "today") -> bool:
    """
    Показать РЕАЛЬНЫЙ опубликованный контент (картинка + текст).

    Источники по приоритету:
      1) журнал контент-бота (bus_tasks/content_media) — то, что публиковали мы;
      2) Instagram Graph API — если локальной копии нет.
    Возвращает True, если что-то реально показали.
    """
    import os
    from aiogram.types import FSInputFile

    posts, status_msg = [], ""
    try:
        from shared.bot_bus import send_task, get_result

        tid = await send_task("stepan_bot", "content_bot", "get_last_post", {"day": day})
        res = await get_result(tid, timeout=30)
        if res and res.get("status") == "done":
            result = res.get("result") or {}
            posts = (result.get("data") or {}).get("posts") or []
            status_msg = result.get("message") or ""
    except Exception as e:
        logger.warning(f"Не удалось получить публикации у контент-бота: {e}")

    shown = 0
    for p in posts:
        path = p.get("file")
        # Запись без картинки И без текста (старый формат журнала) — показывать нечего
        if not path and not p.get("caption"):
            continue
        cap = _pub_caption(p)
        try:
            if path and os.path.isfile(path):
                await _answer_safe(message, cap, photo=FSInputFile(path))
            else:
                await _answer_safe(message, cap)
            shown += 1
        except Exception as e:
            logger.warning(f"Не удалось показать публикацию {p.get('slot')}: {e}")

    if shown:
        return True

    # ── Фолбэк: тянем прямо из Instagram ──
    if await _show_from_instagram(message, day):
        return True

    # ── Честно говорим, что показать нечего (без выдумок) ──
    await _answer_safe(
        message,
        status_msg or "Пока показать нечего — сегодня публикаций ещё не было.",
    )
    return False


async def _content_status(message: Message) -> bool:
    """Статус публикаций — спрашиваем у контент-бота, не выдумываем."""
    try:
        from shared.bot_bus import send_task, get_result
        tid = await send_task("stepan_bot", "content_bot", "get_status", {})
        res = await get_result(tid, timeout=30)
        if res and res.get("status") == "done":
            msg = (res.get("result") or {}).get("message")
            if msg:
                await _answer_safe(message, msg)
                return True
    except Exception as e:
        logger.warning(f"Не удалось получить статус контента: {e}")
    return False


def _last_plan_from_history(history: list) -> tuple:
    """
    Последний СОДЕРЖАТЕЛЬНЫЙ ответ Степана и вопрос, на который он отвечал.
    Именно его руководитель видит на экране, когда пишет «Выполняй».
    Служебные пометки быстрых перехватов («[Показал ...]») планом не считаем.
    """
    for i in range(len(history) - 1, -1, -1):
        msg = history[i] or {}
        if msg.get("role") != "assistant":
            continue
        content = (msg.get("content") or "").strip()
        if content.startswith("[") or len(content) < 40:
            continue
        question = ""
        for j in range(i - 1, -1, -1):
            if (history[j] or {}).get("role") == "user":
                question = (history[j] or {}).get("content", "")
                break
        return question, content
    return "", ""


async def _remember(state: FSMContext, user_text: str, assistant_text: str, intent: str = None):
    """
    Записать обмен в историю.

    Без этого быстрые перехваты (статус/показ/совещание) выходили через return,
    история не пополнялась — и следующее короткое «Покажи» приходило к AI без
    контекста, из-за чего он отвечал отпиской вместо самого поста.
    """
    if not state:
        return
    try:
        data = await state.get_data()
        history = data.get("history", [])
        history.append({"role": "user", "content": user_text})
        history.append({"role": "assistant", "content": assistant_text})
        if len(history) > 10:
            history = history[-10:]
        await state.update_data(history=history, last_intent=intent)
    except Exception as e:
        logger.warning(f"Не удалось сохранить историю: {e}")


@router.message(F.voice)
async def handle_voice(message: Message, state: FSMContext = None):
    if not is_admin(message.from_user.id):
        return

    # Download voice
    await set_reaction(message, "👀")
    voice_file = await message.bot.get_file(message.voice.file_id)
    file_path = f"temp_voice_{message.message_id}.ogg"
    await message.bot.download_file(voice_file.file_path, file_path)

    # Transcribe
    import os
    try:
        user_text = await ai.transcribe_audio(file_path)
        if user_text:
            await message.reply(f"🎤 <i>Распознано:</i> {user_text}", parse_mode="HTML")
            # state пробрасываем — иначе голосовые теряют контекст разговора
            await _process_brain(message, user_text, state)
        else:
            await message.answer("😔 Извините, не удалось расшифровать голосовое сообщение.")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@router.message(F.text)
async def brain(message: Message, state: FSMContext = None):
    """Степан обрабатывает текстовые сообщения."""
    # Если это группа, реагируем только на упоминание Степана (оркестратор уже отфильтровал)
    if message.chat.type in ("group", "supergroup"):
        if not message.text:
            return
            
    if not is_admin(message.from_user.id):
        # Разрешаем отвечать другим ботам, если мы сделаем EventBus обёртку, но пока игнорим чужих
        return

    user_text = message.text.strip()
    if not user_text:
        return
        
    await _process_brain(message, user_text, state)

async def _process_brain(message: Message, user_text: str, state: FSMContext = None):
    # Реакция 👀 "Взял в работу"
    await set_reaction(message, "👀")
    await simulate_typing(message, 2)

    low = user_text.lower()

    # Контекст прошлого обмена: last_intent — для коротких продолжений («Покажи»),
    # history — чтобы «Выполняй» знало, КАКОЙ план запускать.
    state_data = {}
    if state:
        try:
            state_data = await state.get_data()
        except Exception:
            state_data = {}
    last_intent = state_data.get("last_intent")
    history = state_data.get("history", [])

    # ── КОНТЕНТ: ПОКАЗАТЬ реальный пост / отдать статус публикаций ──
    # «Покажи пост» → присылаем сам пост (картинка + текст), а не расписание.
    # Ничего не публикуем и не создаём задачу — это просмотр уже вышедшего.
    intent = detect_content_intent(low, last_intent)

    if intent == "show":
        day = "yesterday" if "вчера" in low else "today"
        ok = await _show_publications(message, day)
        await set_reaction(message, "👍" if ok else "🤷‍♂️")
        await _remember(
            state, user_text,
            "[Показал руководителю опубликованный контент]" if ok
            else "[Показывать нечего — публикаций ещё не было]",
            intent="show",
        )
        return

    if intent == "status":
        if await _content_status(message):
            await set_reaction(message, "👍")
            await _remember(state, user_text, "[Отдал статус публикаций на сегодня]",
                            intent="status")
            return
        # контент-бот не ответил — уходим в обычную обработку ниже

    # ── Команда «делайте / запускайте» → ЗАПУСК ПРИНЯТОГО ПЛАНА ──
    # После совещания это НЕ должно перезапускать анализ: если есть готовое
    # решение — запускаем его план в работу, а не создаём новые задачи-анализы.
    from bots.stepan_bot.handlers.team_meeting import (
        is_meeting_request, run_team_meeting,
        is_execution_command, handle_execution_command,
        is_status_request, run_plan_status,
    )
    if is_execution_command(low):
        try:
            # Передаём план, который Степан только что предложил в чате, — это то,
            # что руководитель видит на экране, когда пишет «Делай». Он важнее
            # старого сохранённого решения (иначе воскресает вчерашний план).
            prev_q, prev_plan = _last_plan_from_history(history)
            if await handle_execution_command(
                message.bot, message.chat.id,
                fresh_plan=prev_plan, fresh_question=prev_q,
            ):
                await set_reaction(message, "👍")
                await _remember(state, user_text, "[Запустил план в работу]",
                                intent="execute")
                return

            # Плана нет — честно спрашиваем. НЕ проваливаемся в общий AI:
            # именно там он выдумывал задачу и публиковал пост в Instagram.
            await message.answer(
                "🤔 Не вижу плана, который нужно выполнить.\n\n"
                "Скажите, что именно запустить — или задайте вопрос, "
                "и я соберу отделы на совещание."
            )
            await set_reaction(message, "🤷‍♂️")
            await _remember(state, user_text, "[Плана для запуска нет — попросил уточнение]")
            return
        except Exception as e:
            logger.error(f"Ошибка запуска плана: {e}", exc_info=True)
            await message.answer("😔 Не удалось запустить план. Попробуйте ещё раз.")
            await set_reaction(message, "🤷‍♂️")
            return

    # ── Запрос статуса плана ──
    if is_status_request(low):
        try:
            await run_plan_status(message.bot, message.chat.id)
            await set_reaction(message, "👍")
            await _remember(state, user_text, "[Отдал статус принятого плана]",
                            intent="plan_status")
            return
        except Exception as e:
            logger.error(f"Ошибка статуса плана: {e}", exc_info=True)

    # ── Перекличка: «отозвутся / перекличка / на связи / кто на связи» ──
    # Простой health-check отделов — НЕ совещание. Проверяем ДО is_meeting_request,
    # потому что «все отделы отозвутся» содержит «все отделы» и попадает в MEETING_TRIGGERS.
    _ROLL_CALL_TRIGGERS = [
        "отозв", "перекличк", "кто на связи", "все на связи",
        "на связи ли", "отчитайтесь", "отчитайся", "кто работает",
        "все работают", "все ли работают", "все ли на связи",
        "проверка связи", "чекин", "check in", "roll call",
    ]
    if any(t in low for t in _ROLL_CALL_TRIGGERS):
        try:
            from shared.event_bus import event_bus
            await event_bus.publish("ROLL_CALL", {
                "chat_id": message.chat.id,
                "message": user_text,
            }, source_bot="stepan_bot")
            await message.answer("📢 Я запросил все отделы отозваться в этом чате. Ожидайте подтверждений.")
            await set_reaction(message, "👍")
            await _remember(state, user_text, "[Запустил перекличку отделов]",
                            intent="roll_call")
        except Exception as e:
            logger.error(f"Ошибка переклички: {e}", exc_info=True)
            await message.answer("😔 Не удалось запустить перекличку.")
            await set_reaction(message, "🤷‍♂️")
        return

    # ── Кросс-функциональный вопрос → СОВЕЩАНИЕ ОТДЕЛОВ ──
    # Отделы обсуждают между собой, спорят и сходятся к одному решению,
    # вместо трёх разрозненных задач/ответов.
    if is_meeting_request(low):
        try:
            await run_team_meeting(message.bot, message.chat.id, user_text)
            await set_reaction(message, "👍")
            await _remember(state, user_text, "[Провёл совещание отделов по вопросу]",
                            intent="meeting")
        except Exception as e:
            logger.error(f"Ошибка совещания отделов: {e}", exc_info=True)
            await message.answer("😔 Не удалось провести совещание отделов. Попробуйте ещё раз.")
            await set_reaction(message, "🤷‍♂️")
        return


    # ── Формируем промпт с контекстом из БД ──
    db_context = await _get_db_context()

    from shared.prompts import TEAM_CONTEXT
    prompt = f"{TEAM_CONTEXT}\n\n{STEPAN_PERSONA}"
    prompt += f"\n\n📊 ТЕКУЩИЕ ДАННЫЕ ИЗ БАЗЫ:\n{db_context}"
    

    # история уже получена в начале _process_brain (state_data)

    tools = [
        {
            "type": "function",
            "function": {
                "name": "create_task",
                "description": "Создать и делегировать задачу одному из отделов (sales, marketing, support, hr, finance, pm, analytics, content)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "department": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]}
                    },
                    "required": ["department", "title", "description", "priority"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "roll_call",
                "description": "Провести перекличку: отправить всем ботам команду отозваться в общем чате",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string", "description": "Текст сообщения для переклички"}
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_report",
                "description": "Сформировать отчет (ежедневный, финансовый и т.д.)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "report_kind": {"type": "string", "enum": ["daily", "finance", "sales", "tasks", "full"]}
                    },
                    "required": ["report_kind"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "query_db",
                "description": "Запросить данные из БД (не отчет, а сырые данные)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "db_query": {"type": "string"}
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "show_published_post",
                "description": (
                    "ПОКАЗАТЬ руководителю сам опубликованный контент — прислать картинку и текст "
                    "поста/сторис/рецепта. Вызывай ВСЕГДА, когда просят показать, скинуть, прислать, "
                    "отправить, дать посмотреть или глянуть публикацию/пост/сторис/контент — в ЛЮБОЙ "
                    "формулировке, включая короткое «покажи» как продолжение разговора о публикациях. "
                    "⚠️ Ничего не публикует и не создаёт задачу — только показывает уже вышедшее."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "day": {
                            "type": "string",
                            "description": "Какой день показать: today, yesterday, last или YYYY-MM-DD",
                        }
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_content_status",
                "description": (
                    "Статус публикаций на сегодня: что уже вышло, а что ещё по плану. "
                    "Вызывай на вопросы «опубликовали ли», «когда выйдет», «во сколько», "
                    "«какой статус публикаций». ⚠️ Ничего не публикует и не создаёт задачу."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "register_sale",
                "description": (
                    "ЗАРЕГИСТРИРОВАТЬ СОСТОЯВШУЮСЯ ПРОДАЖУ в CRM: завести/найти клиента, создать заказ, "
                    "учесть доход. Вызывай ВСЕГДА, когда руководитель или менеджер сообщает о факте "
                    "продажи: «зарегистрируй продажу», «продали N штук ресторану X», «оформи продажу», "
                    "«запиши продажу», «мы продали». Это реальное действие отдела продаж — НЕ создавай "
                    "для этого задачу через create_task. Незаполненные поля оставляй пустыми: цену и "
                    "сумму НЕ ВЫДУМЫВАЙ, отдел сам возьмёт цену из каталога или переспросит."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "customer_name": {"type": "string", "description": "Кому продали: ресторан, кафе, человек"},
                        "phone": {"type": "string", "description": "Телефон клиента, если назван"},
                        "items": {
                            "type": "array",
                            "description": (
                                "ВСЕ позиции продажи одним списком — это ОДИН заказ. "
                                "«10 гороха и 13 редиса, из них 5 Санго по 15 тысяч» → три позиции "
                                "в одном вызове, а не три вызова register_sale."
                            ),
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product": {"type": "string", "description": "Товар, как назвал менеджер"},
                                    "quantity": {"type": "number", "description": "Количество"},
                                    "unit_price": {"type": "number", "description": "Цена за единицу — ТОЛЬКО если названа явно"},
                                },
                                "required": ["product", "quantity"],
                            },
                        },
                        "customer_type": {"type": "string", "enum": ["b2b", "b2c"], "description": "Ресторан/кафе/отель → b2b"},
                        "payment_status": {"type": "string", "enum": ["paid", "pending"], "description": "Оплачено или ждём оплату"},
                    },
                    "required": ["customer_name", "items"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "add_product",
                "description": (
                    "ДОБАВИТЬ НОВЫЙ ТОВАР В КАТАЛОГ — сразу и в магазин (витрину), и в CRM. "
                    "⚠️ Вызывай ТОЛЬКО после ЯВНОГО одобрения руководителя («да, добавь», «добавляй», "
                    "«заводи»). Сам, без спроса, товары не добавляй. Обычный сценарий: отдел продаж "
                    "сообщил, что товара нет в каталоге → ты спросил разрешение → руководитель одобрил "
                    "→ вызываешь add_product, а следом register_sale, чтобы дозаписать продажу."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Название товара, напр. «Микрозелень Санго»"},
                        "price": {"type": "number", "description": "Цена за единицу в сумах"},
                        "unit": {"type": "string", "enum": ["piece", "kg", "g", "pack", "set"], "description": "Единица измерения"},
                        "category": {
                            "type": "string",
                            "enum": ["microgreens", "baby-leaf", "salads", "flowers", "seeds", "substrate", "equipment", "sets"],
                            "description": "Категория каталога",
                        },
                        "stock": {"type": "number", "description": "Остаток на складе, если известен"},
                    },
                    "required": ["name", "price"],
                },
            },
        },
    ]

    try:
        response_msg = await ai.chat_with_tools(
            system_prompt=prompt,
            user_message=user_text,
            tools=tools,
            conversation_history=history
        )
    except Exception as e:
        # Раньше здесь было глухое «не смог обработать» — по нему невозможно понять,
        # кончилась ли квота OpenAI, протух ли ключ или отвалилась сеть. Называем причину.
        logger.error(f"AI error: {type(e).__name__}: {e}", exc_info=True)
        await message.answer(f"😔 Не смог обработать: {_ai_error_reason(e)}", parse_mode="HTML")
        await set_reaction(message, "🤷‍♂️")
        return

    # Функция для отправки ответа (текст + опционально голос)
    async def send_response(text_resp: str):
        if not text_resp: return
        # Защита: если модель вернула JSON-обёртку ({"type":"chat","response":"..."})
        # вместо чистого текста — вытащим человекочитаемую часть.
        stripped = text_resp.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                obj = json.loads(stripped)
                if isinstance(obj, dict):
                    text_resp = (obj.get("response") or obj.get("answer")
                                 or obj.get("text") or obj.get("message") or text_resp)
            except Exception:
                pass
        # Длинные ответы — в разворачиваемую цитату (короткие как есть)
        from shared.utils import collapsible
        try:
            await message.answer(collapsible(text_resp), parse_mode="HTML")
        except Exception:
            import re as _re
            await message.answer(_re.sub(r"</?[^>]+>", "", text_resp))
        await set_reaction(message, "👍")
        if message.voice:
            try:
                import os
                from aiogram.types import FSInputFile
                voice_path = await ai.generate_speech(text_resp)
                if voice_path and os.path.exists(voice_path):
                    voice_file = FSInputFile(voice_path)
                    await message.answer_voice(voice_file)
                    os.remove(voice_path)
            except Exception as e:
                logger.error(f"Voice generation failed: {e}")

    # Process tools if called
    if response_msg.tool_calls:
        tool_results_text = []
        intent_after = None
        sale_handled = False  # одно сообщение = одна продажа, сколько бы вызовов ни выдала модель

        # Сообщение о СОСТОЯВШЕЙСЯ продаже — это факт, а не поручение. «Продали 10 гороха,
        # доставил Амир» модель норовила превратить ещё и в задачу отделу «организовать
        # доставку» — то есть поручить сделать то, что уже сделано. Регистрируем продажу,
        # задачи по ней не создаём.
        calls = list(response_msg.tool_calls)
        if any(c.function.name == "register_sale" for c in calls):
            dropped = [c.function.name for c in calls if c.function.name == "create_task"]
            if dropped:
                logger.info("Степан: продажа уже состоялась — не создаю задачу %s", dropped)
            calls = [c for c in calls if c.function.name != "create_task"]

        for tool_call in calls:
            name = tool_call.function.name
            args = json.loads(tool_call.function.arguments or "{}")

            if name == "create_task":
                # Activate the previously dead _handle_task orchestrator
                await _handle_task(message, args)
                tool_results_text.append(f"Задача передана в отдел {args.get('department', 'pm')}.")

            elif name == "register_sale":
                # Продажу регистрирует ОТДЕЛ ПРОДАЖ (bot_bus), а не Степан своими руками:
                # это его должностная обязанность, и результат — факты из БД, а не текст.
                # Модель иногда дробит одну продажу на вызов per-позицию — это дало бы
                # три заказа и три ответа в чат вместо одного. Берём только первый вызов.
                if sale_handled:
                    logger.warning("Степан: повторный register_sale в одном сообщении — игнорирую")
                    continue
                sale_handled = True
                result_text = await _register_sale(message, args, user_text)
                tool_results_text.append(result_text)
                intent_after = "sale"

            elif name == "add_product":
                # Новый товар заводит отдел продаж — и в магазине, и в CRM.
                # Вызывается только после одобрения руководителя (см. промпт).
                result_text = await _add_product(message, args)
                tool_results_text.append(result_text)
                intent_after = "sale"

            elif name == "roll_call":
                from shared.event_bus import event_bus
                await event_bus.publish("ROLL_CALL", {"chat_id": message.chat.id, "message": args.get("message", "Перекличка!")})
                tool_results_text.append("Перекличка запущена.")
                await send_response("📢 Я запросил все отделы отозваться в этом чате. Ожидайте подтверждений.")

            elif name == "get_report":
                report = await _generate_report(args.get("report_kind", "daily"))
                await message.answer(f"📊 Отчет:\n\n{report}")
                tool_results_text.append("Отчет отправлен.")

            elif name == "query_db":
                db_ans = await _query_db(args.get("db_query", ""))
                await message.answer(f"🔍 Данные из БД:\n\n{db_ans}")
                tool_results_text.append("Данные отправлены.")

            elif name == "show_published_post":
                # Показываем САМ пост (картинка + текст), а не пересказ расписания
                ok = await _show_publications(message, args.get("day", "today"))
                tool_results_text.append(
                    "Опубликованный контент показан руководителю."
                    if ok else "Показывать нечего — публикаций ещё не было."
                )
                intent_after = "show"

            elif name == "get_content_status":
                if await _content_status(message):
                    tool_results_text.append("Статус публикаций отдан.")
                    intent_after = "status"

        # Update history with tool execution result
        if state:
            history.append({"role": "user", "content": user_text})
            history.append({"role": "assistant", "content": f"[TOOLS CALLED: {', '.join(tool_results_text)}] {response_msg.content or ''}"})
            if len(history) > 10: history = history[-10:]
            await state.update_data(history=history, last_intent=intent_after)

        # Показ поста и отчёт о продаже уже сами себя объяснили — не даём модели
        # сверху приписать выдуманный комментарий и противоречить фактам из БД.
        if response_msg.content and intent_after not in ("show", "sale"):
            await send_response(response_msg.content)

        await set_reaction(message, "👍")
        return
        
    # If no tools called, just send the text
    response_text = response_msg.content or ""
    if state:
        history.append({"role": "user", "content": user_text})
        history.append({"role": "assistant", "content": response_text})
        if len(history) > 10: history = history[-10:]
        await state.update_data(history=history)

    await send_response(response_text)


# ═══════════════════════════════════════════════════════
# Внутренние функции
# ═══════════════════════════════════════════════════════

async def _get_db_context() -> str:
    """Собираем ПОЛНЫЙ контекст из БД для AI — ВСЕ отделы и источники."""
    try:
        async with get_session_ctx() as session:
            lines = []

            # ═══ ЗАКАЗЫ ═══
            # Все заказы сегодня (включая Instagram)
            res = await session.execute(
                text("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders "
                "WHERE DATE(created_at) = CURRENT_DATE")
            )
            cnt, total = res.fetchone()
            lines.append(f"📦 Заказы сегодня: {cnt} на {format_price(total)}")

            # Заказы из Instagram
            res = await session.execute(
                text("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders "
                "WHERE DATE(created_at) = CURRENT_DATE AND order_number LIKE 'IG-%'")
            )
            ig_cnt, ig_total = res.fetchone()
            if ig_cnt > 0:
                lines.append(f"  📸 Из Instagram: {ig_cnt} на {format_price(ig_total)}")

            # Все заказы за неделю
            res = await session.execute(
                text("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders "
                "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'")
            )
            week_cnt, week_total = res.fetchone()
            lines.append(f"📦 Заказы за неделю: {week_cnt} на {format_price(week_total)}")

            # Новые/необработанные заказы
            res = await session.execute(
                text("SELECT COUNT(*) FROM orders WHERE status = 'new'")
            )
            new_orders = res.scalar()
            if new_orders > 0:
                lines.append(f"⚠️ Необработанных заказов: {new_orders}")

            # ═══ ЗАДАЧИ ПО ОТДЕЛАМ ═══
            res = await session.execute(
                text("SELECT department, COUNT(*) FROM tasks "
                "WHERE status IN ('todo','in_progress') "
                "GROUP BY department ORDER BY COUNT(*) DESC")
            )
            dept_tasks = res.fetchall()
            active_total = sum(r[1] for r in dept_tasks)
            lines.append(f"\n📋 Активных задач: {active_total}")
            for dept, cnt in dept_tasks:
                lines.append(f"  - {dept or 'общие'}: {cnt}")

            # Задачи связанные с Instagram
            res = await session.execute(
                text("SELECT COUNT(*) FROM tasks "
                "WHERE status IN ('todo','in_progress') "
                "AND (title LIKE '%IG%' OR title LIKE '%Instagram%' OR description LIKE '%Instagram%')")
            )
            ig_tasks = res.scalar()
            if ig_tasks > 0:
                lines.append(f"  📸 Из Instagram: {ig_tasks}")

            # ═══ ФИНАНСЫ ═══
            res = await session.execute(
                text("SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0), "
                "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) "
                "FROM finances WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)")
            )
            inc, exp = res.fetchone()
            lines.append(f"\n💰 Доходы за месяц: {format_price(inc)}")
            lines.append(f"💸 Расходы за месяц: {format_price(exp)}")

            # ═══ КЛИЕНТЫ ═══
            res = await session.execute(text("SELECT COUNT(*) FROM customers"))
            cust = res.scalar()
            res = await session.execute(
                text("SELECT COUNT(*) FROM customers WHERE notes LIKE '%instagram%' OR notes LIKE '%Instagram%'")
            )
            ig_cust = res.scalar() or 0
            lines.append(f"\n👥 Всего клиентов: {cust} (из Instagram: {ig_cust})")

            # ═══ ПОСЛЕДНИЕ СОБЫТИЯ ═══
            # Последние 5 задач
            res = await session.execute(
                text("SELECT title, department, status, created_at FROM tasks "
                "ORDER BY created_at DESC LIMIT 5")
            )
            recent = res.fetchall()
            if recent:
                lines.append("\n📌 Последние задачи:")
                for t in recent:
                    created = t[3].strftime('%d.%m %H:%M') if t[3] else ''
                    lines.append(f"  - [{t[1] or '?'}] {t[0][:60]} ({t[2]}) {created}")

            # Последние заказы (все за сегодня + последние 5)
            res = await session.execute(
                text("SELECT order_number, total_amount, status, notes, created_at FROM orders "
                "WHERE DATE(created_at) = CURRENT_DATE "
                "ORDER BY created_at DESC LIMIT 10")
            )
            recent_orders = res.fetchall()
            if recent_orders:
                lines.append("\n🛒 Заказы сегодня (детали):")
                for o in recent_orders:
                    created = o[4].strftime('%H:%M') if o[4] else ''
                    notes = (o[3] or '')[:120]
                    lines.append(f"  - {o[0]}: {format_price(o[1])} ({o[2]}) [{created}] {notes}")

            return "\n".join(lines)
    except Exception as e:
        logger.warning(f"DB context error: {e}")
        return "Данные из БД временно недоступны."


def _ai_error_reason(exc: Exception) -> str:
    """Человеческая причина отказа модели — чтобы не гадать по логам."""
    name = type(exc).__name__
    text_l = str(exc).lower()

    if "insufficient_quota" in text_l or "exceeded your current quota" in text_l:
        return ("на счёте OpenAI закончились деньги (insufficient_quota). "
                "Пополните баланс — до этого я думать не могу.")
    if name == "RateLimitError" or "rate limit" in text_l or "429" in text_l:
        return "OpenAI ограничил частоту запросов (rate limit). Попробуйте через минуту."
    if name == "AuthenticationError" or "invalid_api_key" in text_l or "401" in text_l:
        return "ключ OpenAI недействителен — проверьте OPENAI_API_KEY на сервере."
    if "timeout" in text_l or name in ("APITimeoutError", "APIConnectionError"):
        return "OpenAI не ответил вовремя (сеть/таймаут). Повторите."
    if name == "BadRequestError" or "400" in text_l:
        return f"OpenAI отклонил запрос: {str(exc)[:200]}"
    return f"{name}: {str(exc)[:200]}"


async def _register_sale(message: Message, args: dict, user_text: str) -> str:
    """
    Продажа → отдел продаж (bot_bus) → факты из БД в чат.

    Степан не пишет заказ сам: регистрация продажи — обязанность отдела продаж.
    Он делегирует действие и докладывает руководителю РЕЗУЛЬТАТ, а не намерение.
    Если отдел не ответил (бот лежит) — говорим об этом прямо, а не имитируем успех.
    """
    from shared.bot_bus import send_task, get_result
    from bots.stepan_bot.handlers.sale_ui import answer_sale_result

    params = {k: v for k, v in (args or {}).items() if v not in (None, "")}
    params["notes"] = user_text[:500]
    params["registered_by"] = "sales_bot"

    await message.answer("💼 Передал в отдел продаж — регистрирую продажу в CRM…")

    try:
        task_id = await send_task("stepan_bot", "sales_bot", "register_sale", params)
        bus_result = await get_result(task_id, timeout=60)
    except Exception as e:
        logger.error(f"Регистрация продажи: сбой шины: {e}", exc_info=True)
        await message.answer("😔 Отдел продаж недоступен — продажа НЕ зарегистрирована. Повторите позже.")
        return "Продажа не зарегистрирована: шина недоступна."

    if not bus_result or bus_result.get("status") == "error":
        err = (bus_result or {}).get("error", "отдел не ответил за 60 секунд")
        await message.answer(
            f"⚠️ Продажа <b>не зарегистрирована</b>: {err}.\n"
            f"Проверьте, что sales_bot запущен, и повторите.",
            parse_mode="HTML",
        )
        return f"Продажа не зарегистрирована: {err}"

    # Показ результата (факты / вопрос с кнопками / ошибка) — общий для первого
    # вызова и для дозаписи после нажатия кнопки.
    return await answer_sale_result(message, bus_result.get("result") or {})


async def _add_product(message: Message, args: dict) -> str:
    """
    Новый товар → отдел продаж (bot_bus) → каталог витрины + зеркало в CRM.

    Вызывается только после одобрения руководителя: сам Степан товары не выдумывает.
    """
    from shared.bot_bus import send_task, get_result

    params = {k: v for k, v in (args or {}).items() if v not in (None, "")}
    name = params.get("name", "товар")

    await message.answer(f"🛒 Добавляю «{name}» в каталог — магазин и CRM…")

    try:
        task_id = await send_task("stepan_bot", "sales_bot", "add_product", params)
        bus_result = await get_result(task_id, timeout=60)
    except Exception as e:
        logger.error(f"Добавление товара: сбой шины: {e}", exc_info=True)
        await message.answer("😔 Отдел продаж недоступен — товар НЕ добавлен.")
        return "Товар не добавлен: шина недоступна."

    if not bus_result or bus_result.get("status") == "error":
        err = (bus_result or {}).get("error", "отдел не ответил за 60 секунд")
        await message.answer(f"⚠️ Товар <b>не добавлен</b>: {err}", parse_mode="HTML")
        return f"Товар не добавлен: {err}"

    result = bus_result.get("result") or {}
    await message.answer(result.get("message", "Не понял результат добавления товара."))

    if result.get("status") == "ok":
        return (f"Товар «{name}» добавлен в каталог"
                + (" и в магазин." if result.get("data", {}).get("in_storefront") else " (только CRM)."))
    return f"Товар не добавлен: {result.get('message', 'нет данных')}"


async def _handle_task(message: Message, data: dict):
    """Создаём задачу и распределяем по отделам."""
    dept = data.get("department", "pm").lower()
    title = data.get("title", "Новая задача")
    priority = data.get("priority", "medium")
    description = data.get("description", "")
    deadline = data.get("deadline")
    assignee = data.get("assignee", "")
    response_text = data.get("response", "")

    # ── Принудительное перенаправление (Safety routing) ──
    combined_text = f"{title.lower()} {description.lower()} {dept.lower()}"
    if any(word in combined_text for word in ["опрос", "poll", "викторин", "мем", "сторис", "stories", "пост", "публикац", "контент"]):
        dept = "content"
        assignee = "Content Bot"

    # ── Защита от «осиротевших» отделов ──
    # Задачу должен кто-то слушать (event_bus TASK_CREATED). Отделы operations/
    # production/logistics принимает PM (COO). Всё неизвестное (в т.ч. "assistant")
    # тоже отдаём PM, иначе задача создастся в БД, но исполнителя не будет.
    LISTENED_DEPTS = {
        "sales", "marketing", "support", "hr", "finance", "pm", "analytics",
        "content", "operations", "production", "logistics",
        "qa", "rnd", "devops"
    }
    if dept not in LISTENED_DEPTS:
        dept = "pm"

    # ── Делегирование через Bot Bus для контент-задач ──
    if dept == "content":
        content_actions = {
            "story": "publish_story", "сторис": "publish_story",
            "stories": "publish_story", "сториз": "publish_story",
            "post": "publish_post", "пост": "publish_post",
            "публикуй": "publish_story", "опубликуй": "publish_story",
            "meme": "generate_meme", "мем": "generate_meme",
        }
        
        action = None
        combined = f"{title.lower()} {description.lower()}"
        
        for keyword, act in content_actions.items():
            if keyword in combined:
                action = act
                break
        
        if action:
            from shared.bot_bus import send_task, get_result
            
            await message.answer(
                f"📸 <b>Передаю в отдел контента!</b>\n\n"
                f"✍️ Действие: {action}\n"
                f"📝 Тема: {title}\n\n"
                f"⏳ Ожидайте, Content Bot генерирует и публикует...",
                parse_mode="HTML"
            )
            
            bus_task_id = await send_task(
                from_bot="stepan_bot",
                to_bot="content_bot",
                action=action,
                params={"topic": description or title}
            )
            
            result = await get_result(bus_task_id, timeout=120)
            
            if result and result.get("status") == "done":
                res_data = result.get("result", {})
                await message.answer(
                    f"✅ <b>Content Bot выполнил задачу!</b>\n\n"
                    f"📋 {res_data.get('message', 'Готово')}",
                    parse_mode="HTML"
                )
            elif result and result.get("status") == "error":
                await message.answer(
                    f"❌ <b>Ошибка:</b> {result.get('error', 'Неизвестная ошибка')}",
                    parse_mode="HTML"
                )
            else:
                await message.answer(
                    "⏰ Content Bot ещё работает. Результат появится в чате.",
                    parse_mode="HTML"
                )
            return

    # ── Делегирование личному ассистенту (n8n): почта / календарь / контакты ──
    elif dept == "assistant":
        from shared.bot_bus import send_task, get_result

        await message.answer(
            f"📧 <b>Передаю личному ассистенту!</b>\n\n"
            f"📝 Задача: {title}\n\n"
            f"⏳ Ожидайте, n8n обрабатывает (почта / календарь / контакты)...",
            parse_mode="HTML"
        )

        bus_task_id = await send_task(
            from_bot="stepan_bot",
            to_bot="n8n_bridge",
            action="assistant",
            params={
                "topic": description or title,
                "title": title,
                "description": description or title,
                "chat_id": message.chat.id,
            }
        )

        result = await get_result(bus_task_id, timeout=120)

        if result and result.get("status") == "done":
            res_data = result.get("result", {})
            await message.answer(
                f"✅ <b>Готово!</b>\n\n"
                f"📋 {res_data.get('message', 'Выполнено')}",
                parse_mode="HTML"
            )
        elif result and result.get("status") == "error":
            await message.answer(
                f"❌ <b>Ошибка:</b> {result.get('error', 'Неизвестная ошибка')}",
                parse_mode="HTML"
            )
        else:
            await message.answer(
                "⏰ Ассистент ещё обрабатывает. Результат появится в чате.",
                parse_mode="HTML"
            )
        return

    # ── Делегирование через Bot Bus для других отделов ──
    elif dept in ("sales", "finance", "hr", "analytics", "marketing", "support", "pm"):
        dept_to_bot = {
            "sales": "sales_bot", "finance": "finance_bot", "hr": "hr_bot",
            "analytics": "analytics_bot", "marketing": "marketing_bot",
            "support": "support_bot", "pm": "stepan_bot"
        }
        dept_actions = {
            "sales": {
                "заказ": "get_orders", "заказы": "get_orders", "orders": "get_orders",
                "клиент": "get_clients", "clients": "get_clients",
            },
            "finance": {
                "баланс": "get_balance", "p&l": "get_balance", "пнл": "get_balance",
                "расход": "add_expense", "expense": "add_expense",
            },
            "hr": {
                "сотрудник": "get_employees", "employees": "get_employees",
                "команд": "get_employees", "штат": "get_employees",
            },
            "analytics": {
                "отчёт": "get_report", "отчет": "get_report", "report": "get_report",
                "kpi": "get_report", "instagram": "get_instagram_stats", "инстаграм": "get_instagram_stats",
            },
            "marketing": {
                "рассылк": "send_broadcast", "broadcast": "send_broadcast",
                "кампани": "send_broadcast",
            },
            "support": {
                "жалоб": "handle_complaint", "complaint": "handle_complaint",
                "dm": "check_instagram_dm", "директ": "check_instagram_dm",
            },
            "pm": {  # pm = Степан (задачи/производство)
                "задач": "get_tasks", "tasks": "get_tasks",
                "дедлайн": "get_deadlines", "deadline": "get_deadlines", "срок": "get_deadlines",
            },
        }

        bot_name = dept_to_bot[dept]
        action = None
        combined = f"{title.lower()} {description.lower()}"

        actions_map = dept_actions.get(dept, {})
        for keyword, act in actions_map.items():
            if keyword in combined:
                action = act
                break

        # Если ключевое слово не совпало — НЕ подменяем задачу канонным действием:
        # проваливаемся ниже в общий путь (insert в tasks + TASK_CREATED),
        # чтобы отдел получил исходную формулировку задачи.
        if action:
            from shared.bot_bus import send_task, get_result

            dept_icons = {
                "sales": "🛒", "finance": "💰", "hr": "👥",
                "analytics": "📊", "marketing": "📢",
                "support": "🎧", "pm": "🤖",  # pm = Степан
            }
            icon = dept_icons.get(dept, "📌")

            await message.answer(
                f"{icon} <b>Передаю в отдел {dept}!</b>\n\n"
                f"⚡ Действие: {action}\n"
                f"📝 Тема: {title}\n\n"
                f"⏳ Ожидайте, {bot_name} обрабатывает...",
                parse_mode="HTML"
            )

            bus_task_id = await send_task(
                from_bot="stepan_bot",
                to_bot=bot_name,
                action=action,
                params={"topic": description or title, "title": title, "description": description}
            )

            result = await get_result(bus_task_id, timeout=120)

            if result and result.get("status") == "done":
                res_data = result.get("result", {})
                await message.answer(
                    f"✅ <b>{bot_name} выполнил задачу!</b>\n\n"
                    f"📋 {res_data.get('message', 'Готово')}",
                    parse_mode="HTML"
                )
            elif result and result.get("status") == "error":
                await message.answer(
                    f"❌ <b>Ошибка:</b> {result.get('error', 'Неизвестная ошибка')}",
                    parse_mode="HTML"
                )
            else:
                await message.answer(
                    f"⏰ {bot_name} ещё работает. Результат появится в чате.",
                    parse_mode="HTML"
                )
            return

    # Сохраняем в БД
    try:
        from datetime import datetime
        parsed_deadline = None
        if deadline and isinstance(deadline, str) and deadline.lower() not in ("null", "none"):
            try:
                parsed_deadline = datetime.strptime(deadline, "%Y-%m-%d").date()
            except ValueError:
                pass
                
        async with get_session_ctx() as session:
            res = await session.execute(
                text("INSERT INTO tasks (title, assignee, department, status, priority, deadline, description) "
                "VALUES (:p1, :p2, :p3, 'todo', :p4, :p5, :p6) RETURNING id"),
                {"p1": title, "p2": assignee, "p3": dept, "p4": priority, "p5": parsed_deadline, "p6": description}
            )
            task_id = res.scalar()
            await session.commit()
    except Exception as e:
        logger.error(f"Task creation error: {e}")
        safe_e = str(e).replace('<', '&lt;').replace('>', '&gt;')
        await message.answer(f"❌ Ошибка при создании задачи: {safe_e}", parse_mode="HTML")
        return

    # Публикуем событие
    try:
        await event_bus.publish("TASK_CREATED", {
            "task_id": task_id,
            "title": title,
            "department": dept,
            "priority": priority,
            "assignee": assignee,
            "description": description,
            "chat_id": message.chat.id
        })
    except Exception:
        pass

    dept_icons = {
        "sales": "🛒", "marketing": "📢", "support": "🎧",
        "hr": "👥", "finance": "💰", "pm": "🤖",  # pm = Степан
        "analytics": "📊", "content": "✍️",
        "qa": "🔬", "rnd": "🧬", "devops": "🛠",
    }
    pri_icons = {"urgent": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Выполнено", callback_data=f"stp:done:{task_id}"),
            InlineKeyboardButton(text="❌ Отменить", callback_data=f"stp:cancel:{task_id}"),
        ],
    ])

    msg = await message.answer(
        f"✅ <b>Задача #{task_id} создана!</b>\n\n"
        f"{dept_icons.get(dept, '📌')} <b>Отдел:</b> {dept}\n"
        f"{pri_icons.get(priority, '🟡')} <b>Приоритет:</b> {priority}\n"
        f"👤 <b>Ответственный:</b> {assignee or 'не назначен'}\n"
        f"📅 <b>Дедлайн:</b> {deadline or 'не указан'}\n\n"
        f"📝 {title}\n\n"
        f"{'📋 ' + description[:300] if description else ''}\n\n"
        f"{'💬 ' + response_text if response_text else ''}",
        reply_markup=kb,
    )

    try:
        async with get_session_ctx() as session:
            await session.execute(
                text("UPDATE tasks SET message_id = :mid, chat_id = :cid WHERE id = :tid"),
                {"mid": msg.message_id, "cid": msg.chat.id, "tid": task_id}
            )
            await session.commit()
    except Exception as e:
        logger.error(f"Failed to save message_id for task {task_id}: {e}")


async def _query_db(query_type: str) -> str:
    """Выполняем запрос к БД по типу."""
    try:
        async with get_session_ctx() as session:
            if query_type == "sales_summary":
                res = await session.execute(
                    text("SELECT COUNT(*), COALESCE(SUM(total_amount),0), COALESCE(AVG(total_amount),0) "
                    "FROM orders WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)")
                )
                cnt, total, avg = res.fetchone()
                return f"🛒 Заказов: {cnt} | Сумма: {format_price(total)} | Средний: {format_price(avg)}"

            elif query_type == "tasks_status":
                res = await session.execute(
                    text("SELECT status, COUNT(*) FROM tasks GROUP BY status")
                )
                stats = dict(res.fetchall())
                return (f"📋 Задачи: ⬜ {stats.get('todo',0)} | 🔄 {stats.get('in_progress',0)} | "
                        f"✅ {stats.get('done',0)} | ❌ {stats.get('cancelled',0)}")

            elif query_type == "finance_report":
                res = await session.execute(
                    text("SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0), "
                    "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) "
                    "FROM finances WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)")
                )
                inc, exp = res.fetchone()
                return f"💰 Доходы: {format_price(inc)} | 💸 Расходы: {format_price(exp)} | Прибыль: {format_price(inc-exp)}"

            elif query_type == "orders_today":
                res = await session.execute(
                    text("SELECT order_number, total_amount, status FROM orders "
                    "WHERE DATE(created_at) = CURRENT_DATE ORDER BY created_at DESC")
                )
                orders = res.fetchall()
                if not orders:
                    return "📦 Сегодня заказов нет."
                lines = ["📦 Заказы сегодня:"]
                for o in orders:
                    lines.append(f"  {o[0]} — {format_price(o[1])} [{o[2]}]")
                return "\n".join(lines)

            elif query_type == "customers_count":
                res = await session.execute(
                    text("SELECT COUNT(*), "
                    "SUM(CASE WHEN customer_type='b2b' THEN 1 ELSE 0 END), "
                    "SUM(CASE WHEN status='vip' THEN 1 ELSE 0 END) FROM customers")
                )
                total, b2b, vip = res.fetchone()
                return f"👥 Клиентов: {total} | B2B: {b2b or 0} | VIP: {vip or 0}"

            elif query_type == "employees":
                res = await session.execute(
                    text("SELECT name, role, status FROM employees ORDER BY name")
                )
                emps = res.fetchall()
                if not emps:
                    return "👥 Сотрудников нет."
                lines = ["👥 Сотрудники:"]
                for e in emps:
                    icon = "🟢" if e[2] == "active" else "🔴"
                    lines.append(f"  {icon} {e[0]} — {e[1]}")
                return "\n".join(lines)

        return ""
    except Exception as e:
        return f"⚠️ Ошибка запроса: {e}"


async def _generate_report(kind: str) -> str:
    """Генерируем отчёт по типу."""
    try:
        async with get_session_ctx() as session:
            lines = [f"📊 <b>Отчёт: {kind}</b>\n"]

            # Заказы
            res = await session.execute(
                text("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders "
                "WHERE DATE(created_at) = CURRENT_DATE")
            )
            cnt, total = res.fetchone()
            lines.append(f"🛒 Заказы сегодня: {cnt} на {format_price(total)}")

            # Финансы
            res = await session.execute(
                text("SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0), "
                "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) "
                "FROM finances WHERE date = CURRENT_DATE")
            )
            inc, exp = res.fetchone()
            lines.append(f"💰 Доходы: {format_price(inc)} | 💸 Расходы: {format_price(exp)}")

            # Задачи
            res = await session.execute(
                text("SELECT status, COUNT(*) FROM tasks GROUP BY status")
            )
            stats = dict(res.fetchall())
            lines.append(
                f"📋 Задачи: ⬜{stats.get('todo',0)} 🔄{stats.get('in_progress',0)} ✅{stats.get('done',0)}"
            )

            # Новые клиенты
            res = await session.execute(
                text("SELECT COUNT(*) FROM customers WHERE DATE(created_at) = CURRENT_DATE")
            )
            new_c = res.scalar()
            lines.append(f"👤 Новых клиентов: {new_c}")

            return "\n".join(lines)
    except Exception as e:
        return f"⚠️ Ошибка: {e}"
