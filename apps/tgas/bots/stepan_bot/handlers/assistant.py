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
import re
from datetime import datetime, date
from typing import Optional

from aiogram import Router, F
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext

from shared import approvals, tasks_repo
from shared import tools as tool_registry
from shared.config import settings
from shared.database import get_session_ctx
from sqlalchemy import text
from shared.ai_engine import AIEngine
from shared.tool_runtime import dump_result
from shared.utils import contains_any, first_match, format_price, simulate_typing
from shared.event_bus import event_bus
from shared.group_orchestrator import set_reaction

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
- 👤 «ЗАРЕГИСТРИРУЙ» БЕЗ ТОВАРА — ЭТО КЛИЕНТ, А НЕ ПРОДАЖА. «Клиент Иван, номер такой-то, зарегистрируй», «запиши ресторан Навруз», «добавь клиента», «новый клиент» → вызывай add_customer (имя, телефон из сообщения, b2b для заведения / b2c для человека). register_sale — только когда назван ТОВАР, количество или сумма. ЗАПРЕЩЕНО выдумывать позицию («микрозелень»), чтобы вызов продажи прошёл валидацию: так вместо карточки клиента получается вопрос «такого товара нет в каталоге», и не заводится ни клиент, ни заказ.
- 👥 ТЁЗКА КЛИЕНТА: если add_customer вернул похожие карточки, это ВОПРОС, а не отказ. Ответ «нет / другой / новый» → вызови add_customer ещё раз с теми же данными и force_new=true. Ответ «да» → карточку не заводи. ЗАПРЕЩЕНО писать в чат слова «force_new», «повтори с флагом» и любые другие инструкции для машины: собеседник — человек, он их не выполнит, и клиент останется незаведённым.
- 🚫 НИКОГДА не выдумывай цену, сумму или количество, если руководитель их не назвал. Оставляй поля пустыми — отдел возьмёт цену из каталога или переспросит.
- 🧾 ОДНА ПРОДАЖА = ОДИН вызов register_sale со списком items, даже если позиций несколько. «Продали 10 гороха и 13 редиса, из них 5 Санго по 15 тысяч» → items: [горох ×10, редис ×13, Санго ×5 по 15000]. НЕ дели на три вызова — иначе получится три заказа вместо одного.
- 🆕 НЕТ ТОВАРА В КАТАЛОГЕ: отдел продаж сам предложит завести его кнопкой — руководитель нажмёт, и откроется мастер карточки (фото, категория, описание от контент-отдела). Вопрос текстом не повторяй. ИСКЛЮЧЕНИЕ: если в блоке «НЕЗАКРЫТАЯ ПРОДАЖА» написано «не хватает: цена» и руководитель цену назвал — вызови register_sale ещё раз с тем же клиентом и той же позицией, добавив unit_price. Без этого его ответ уходит в никуда. add_product вызывай только если руководитель прямо просит завести товар вне продажи.
- ✅ ПРОШЕДШЕЕ ВРЕМЯ = ФАКТ, А НЕ ПОРУЧЕНИЕ. «Доставил Амир», «отвезли», «оплатили», «забрали» означают, что это УЖЕ СДЕЛАНО. Такие слова — часть описания продажи, а не просьба организовать доставку/оплату. ЗАПРЕЩЕНО создавать задачу (create_task) на то, что уже произошло: вызывай только register_sale. Задача на доставку нужна лишь тогда, когда доставку просят организовать в будущем («нужно доставить», «отвези завтра»).
- 🔁 НЕ ПОВТОРЯЙ УЖЕ ЗАДАННЫЙ ВОПРОС. Новую продажу собирай из ТЕКУЩЕГО сообщения: не вытаскивай позиции из старой переписки и не создавай такую же ещё раз.
- ❓ НО ОТВЕТ НА ВОПРОС ОТДЕЛА — ЭТО ПРОДОЛЖЕНИЕ ТОЙ ЖЕ ПРОДАЖИ. Если ниже есть блок «НЕЗАКРЫТАЯ ПРОДАЖА», короткая реплика руководителя («15 штук», «по 20», «Жасмин») отвечает именно на неё: вызови register_sale ОДИН раз, взяв клиента и товар из блока, а недостающее — из реплики. Не заводи вторую продажу и не переспрашивай то, что в блоке уже есть.
- 🔢 КОЛИЧЕСТВО НЕ ВЫДУМЫВАЙ. Не назвали, сколько продали или сколько сажать, — оставь поле пустым: отдел спросит сам. Поставить 1 «чтобы вызов прошёл» — значит записать в базу выдуманное число, деньги и остаток вместе с ним.
- 📇 КЛИЕНТА НЕ СПРАШИВАЙ ДВАЖДЫ. Отдел продаж сам ищет карточку — нечётко, с латиницей и кириллицей: «ресторан жасмин», «Жасмин» и «Jasmina» находят одного клиента. Поэтому ЗАПРЕЩЕНО спрашивать телефон у клиента, который уже покупал: если номер в карточке есть, отдел возьмёт его сам. Спрашивай телефон ТОЛЬКО когда отдел прямо вернул такой вопрос.
- 🚫 ЗАПРЕЩЕНО отвечать «такого клиента нет» по памяти. Сначала find_customer — он видит всю базу. Твоя история диалога базой не является.
- 🙅 НЕТ ИНСТРУМЕНТА — СКАЖИ ПРЯМО «Я ЭТОГО НЕ УМЕЮ» и назови, где это делается (админка microgreenuzbekistan.com). ЗАПРЕЩЕНО отвечать, что действие «серьёзное», «требует отдельного рассмотрения» или согласования, если инструмента под него у тебя нет: это звучит как «могу, но не хочу», и руководитель ждёт от тебя того, чего не будет. Подтверждение у нас выглядит иначе — карточкой с кнопками ✅/❌; нет карточки, значит нет и действия.
- 🗑 УДАЛЕНИЕ КЛИЕНТОВ: инструмента у тебя нет и не будет — это делается в админке, раздел «Клиенты». Клиента, у которого есть заказы, база не удалит вообще (на заказах стоит защита), и это правильно: вместе с ним ушла бы вся история продаж и финансов. Так и отвечай.
- 📞 ВОПРОСЫ О КЛИЕНТАХ И ЗАКАЗАХ — ЭТО ИНСТРУМЕНТЫ, А НЕ ПАМЯТЬ. «Есть ли такой клиент», «кто он» → find_customer. «Кто взял заказ M-…», «что было в заказе», «оплачен ли» → get_order. «Что он раньше брал», «прошлые заказы клиента» → get_customer_orders. «Сколько сегодня продаж / какая выручка / сколько заказов» → get_sales_today. Отвечать по памяти или пересказывать историю чата ЗАПРЕЩЕНО — цифры и имена берутся из базы.
- Если задача — верни JSON с type="task" и укажи нужный department.
- Если вопрос о бизнесе — верни JSON с type="chat".


Используй ВЫЗОВЫ ФУНКЦИЙ (Function Calling) для действий:
- Если сообщают о состоявшейся продаже, вызови register_sale
- Если просят завести/записать/зарегистрировать КЛИЕНТА (товара в сообщении нет) — add_customer
- Если спрашивают про клиента — find_customer; про его прошлые заказы — get_customer_orders
- Если спрашивают про конкретный заказ (кто взял, что внутри, оплачен ли) — get_order
- Если нужно создать задачу, вызови create_task
- Если нужна перекличка, вызови roll_call
- Если спрашивают про продажи за день — get_sales_today; общая сводка за сегодня — get_business_summary; за период — get_finance_summary; P&L за месяц — get_pnl
- Если нужны продажи по товарам — top_products; задачи отделов — get_tasks; развёрнутый отчёт — build_report
- Если это просто вопрос или личное общение, отвечай текстом.
"""


def is_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS


#: Что сотруднику РАЗРЕШЕНО поручать Стёпану. Всё остальное — деньги, цены,
#: задачи отделам, рассылки, публикации — остаётся за руководителем.
#: Ограничение сделано набором инструментов, а не просьбой в промпте: просьбу
#: модель может и обойти, а чего нет в списке — того она вызвать не может.
STAFF_TOOLS = frozenset(
    {
        "find_customer",
        "add_customer",
        "get_customer_orders",
        "find_product",
        "get_price_list",
        "get_order",
    }
)


def is_staff_chat(message: Message) -> bool:
    """Рабочая группа отдела продаж — там пишут сотрудники, а не посторонние.

    16.08.2026 менеджер ответил «Нет» на вопрос бота о тёзке клиента, и ответ
    был отброшен молча: `brain` слышал только владельца. Со стороны это и есть
    «бот тупой» — он спросил и не услышал ответа. Своих узнаём по чату:
    `sales_group_id` уже настроен и никем, кроме команды, не читается.
    """
    group = getattr(settings, "sales_group_id", 0) or 0
    return bool(group) and message.chat.id == group


def may_command(message: Message) -> bool:
    """Кого Стёпан вообще слушает: руководитель или сотрудник в своей группе."""
    return is_admin(message.from_user.id) or is_staff_chat(message)


# ═══════════════════════════════════════════════════════
# /start
# ═══════════════════════════════════════════════════════


@router.message(Command("start"))
async def cmd_start(message: Message):
    if not is_admin(message.from_user.id):
        await message.answer("⛔ Степан работает только с руководителем.")
        return

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🏢 Открыть офис (Web)",
                    web_app=WebAppInfo(url="https://microgreenuzbekistan.com"),
                ),
            ],
            [
                InlineKeyboardButton(
                    text="📊 Отчёт за день", callback_data="st:report_daily"
                ),
                InlineKeyboardButton(text="📋 Все задачи", callback_data="st:tasks"),
            ],
            [
                InlineKeyboardButton(text="💰 Финансы", callback_data="st:finance"),
                InlineKeyboardButton(text="🛒 Заказы", callback_data="st:orders"),
            ],
            [
                InlineKeyboardButton(
                    text="👥 Сотрудники", callback_data="st:employees"
                ),
                InlineKeyboardButton(text="📈 Аналитика", callback_data="st:analytics"),
            ],
            [
                InlineKeyboardButton(
                    text="⚡ Статус системы", callback_data="st:system"
                ),
            ],
        ]
    )

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
            text(
                "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM crm_orders WHERE DATE(created_at) = CURRENT_DATE"
            )
        )
        orders_count, orders_sum = res.fetchone()

        # Финансы за сегодня
        res = await session.execute(
            text(
                "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0), "
                "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) "
                "FROM finances WHERE date = CURRENT_DATE"
            )
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

    report_text = (
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

    await cb.message.edit_text(report_text)


@router.callback_query(F.data == "st:tasks")
async def show_tasks(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("📋 Загружаю...")

    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT id, title, department, status, priority, deadline "
                "FROM tasks WHERE status != 'cancelled' ORDER BY "
                "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
                "WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 15"
            )
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

    # Кнопка удаления у каждой строки: это единственный экран, с которого
    # владелец разбирает накопившееся, и до сих пор он был только на чтение.
    lines.append("\n🗑 — удалить задачу с этим номером.")
    del_buttons = [
        InlineKeyboardButton(text=f"🗑 #{t[0]}", callback_data=f"stp:del:ask:{t[0]}")
        for t in tasks
    ]
    rows = [del_buttons[i : i + 3] for i in range(0, len(del_buttons), 3)]
    rows.append([InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")])
    await cb.message.edit_text(
        "\n".join(lines), reply_markup=InlineKeyboardMarkup(inline_keyboard=rows)
    )


@router.callback_query(F.data == "st:finance")
async def show_finance(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("💰 Загружаю...")

    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0), "
                "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) "
                "FROM finances WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) "
                "AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)"
            )
        )
        income, expense = res.fetchone()

        # Неоплаченные заказы
        res = await session.execute(
            text(
                "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM crm_orders WHERE payment_status = 'pending'"
            )
        )
        debt_count, debt_sum = res.fetchone()

    profit = income - expense
    margin = (profit / income * 100) if income > 0 else 0

    fin_text = (
        f"💰 <b>Финансы — {date.today().strftime('%B %Y')}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📈 Доходы: {format_price(income)}\n"
        f"📉 Расходы: {format_price(expense)}\n"
        f"{'✅' if profit >= 0 else '🔴'} Прибыль: {format_price(profit)}\n"
        f"📊 Маржа: {margin:.1f}%\n\n"
        f"💳 Дебиторка: {debt_count} заказов на {format_price(debt_sum)}\n"
    )

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
        ]
    )
    await cb.message.edit_text(fin_text, reply_markup=kb)


@router.callback_query(F.data == "st:orders")
async def show_orders(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("🛒 Загружаю...")

    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_status, "
                "c.name FROM crm_orders o LEFT JOIN customers c ON o.customer_id = c.id "
                "ORDER BY o.created_at DESC LIMIT 10"
            )
        )
        orders = res.fetchall()

    if not orders:
        return await cb.message.edit_text("🛒 Заказов пока нет.")

    status_icons = {
        "new": "🆕",
        "confirmed": "✅",
        "preparing": "🔧",
        "ready": "📦",
        "delivering": "🚚",
        "delivered": "✅",
        "cancelled": "❌",
    }

    lines = ["🛒 <b>Последние заказы</b>\n━━━━━━━━━━━━━━━━━━━━\n"]
    for o in orders:
        oid, num, total, status, pay, name = o
        si = status_icons.get(status, "❓")
        pay_icon = "💚" if pay == "paid" else "🟡"
        cust = name or "—"
        lines.append(f"{si} <b>{num}</b> | {format_price(total)} | {pay_icon} | {cust}")

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
        ]
    )
    await cb.message.edit_text("\n".join(lines), reply_markup=kb)


@router.callback_query(F.data == "st:employees")
async def show_employees(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("👥 Загружаю...")

    async with get_session_ctx() as session:
        res = await session.execute(
            text("SELECT name, role, status, salary FROM crm_employees ORDER BY name")
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

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
        ]
    )
    await cb.message.edit_text("\n".join(lines), reply_markup=kb)


@router.callback_query(F.data == "st:analytics")
async def show_analytics(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("📈 Анализирую...")

    async with get_session_ctx() as session:
        # Продажи по категориям (этот месяц)
        res = await session.execute(
            text(
                "SELECT p.category, COUNT(oi.id), SUM(oi.total_price) "
                "FROM crm_order_items oi JOIN crm_products p ON oi.product_id = p.id "
                "JOIN crm_orders o ON oi.order_id = o.id "
                "WHERE EXTRACT(MONTH FROM o.created_at) = EXTRACT(MONTH FROM CURRENT_DATE) "
                "GROUP BY p.category ORDER BY SUM(oi.total_price) DESC"
            )
        )
        cats = res.fetchall()

        # Общие метрики
        res = await session.execute(text("SELECT COUNT(*) FROM customers"))
        total_customers = res.scalar()

        res = await session.execute(
            text("SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b'")
        )
        b2b = res.scalar()

        res = await session.execute(
            text(
                "SELECT COUNT(*), COALESCE(AVG(total_amount),0) FROM crm_orders "
                "WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)"
            )
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

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
        ]
    )
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

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔙 Меню", callback_data="st:menu")],
        ]
    )
    await cb.message.edit_text("\n".join(lines), reply_markup=kb)


@router.callback_query(F.data == "st:menu")
async def back_to_menu(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🏢 Открыть офис (Web)",
                    web_app=WebAppInfo(url="https://microgreenuzbekistan.com"),
                ),
            ],
            [
                InlineKeyboardButton(
                    text="📊 Отчёт за день", callback_data="st:report_daily"
                ),
                InlineKeyboardButton(text="📋 Все задачи", callback_data="st:tasks"),
            ],
            [
                InlineKeyboardButton(text="💰 Финансы", callback_data="st:finance"),
                InlineKeyboardButton(text="🛒 Заказы", callback_data="st:orders"),
            ],
            [
                InlineKeyboardButton(
                    text="👥 Сотрудники", callback_data="st:employees"
                ),
                InlineKeyboardButton(text="📈 Аналитика", callback_data="st:analytics"),
            ],
            [
                InlineKeyboardButton(
                    text="⚡ Статус системы", callback_data="st:system"
                ),
            ],
        ]
    )

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

    await tasks_repo.set_status(task_id, "done")

    await cb.answer("✅ Задача выполнена!")
    await cb.message.edit_text(
        cb.message.text + "\n\n✅ <b>Статус: ВЫПОЛНЕНО</b>",
    )

    # Публикуем событие
    await event_bus.publish(
        "TASK_COMPLETED",
        {
            "task_id": task_id,
            "completed_by": "admin",
        },
    )


@router.callback_query(F.data.startswith("stp:cancel:"))
async def cancel_task(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    task_id = int(cb.data.split(":")[2])

    await tasks_repo.set_status(task_id, "cancelled")

    await cb.answer("❌ Задача отменена")
    await cb.message.edit_text(
        cb.message.text + "\n\n❌ <b>Статус: ОТМЕНЕНА</b>",
    )


# Удаление — в два шага: строка исчезает безвозвратно, а кнопка стоит вплотную
# к «Выполнено». Отмена (`cancelled`) рядом остаётся: она для задач, которые
# потеряли смысл, а удаление — для мусора вроде четырёх дублей одной фразы.
@router.callback_query(F.data.startswith("stp:del:ask:"))
async def ask_delete_task(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    task_id = int(cb.data.split(":")[3])

    task = await tasks_repo.get(task_id)
    if not task:
        return await cb.answer("Задачи уже нет", show_alert=True)

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🗑 Да, удалить", callback_data=f"stp:del:yes:{task_id}"
                ),
                InlineKeyboardButton(
                    text="◀️ Не надо", callback_data=f"stp:del:no:{task_id}"
                ),
            ],
        ]
    )
    await cb.message.answer(
        f"🗑 <b>Удалить задачу #{task_id} безвозвратно?</b>\n\n"
        f"📝 {task['title'][:200]}\n"
        f"📁 Отдел: {task['department'] or '—'}\n\n"
        f"<i>Восстановить будет нельзя. Если задача просто потеряла "
        f"актуальность — лучше «Отменить».</i>",
        reply_markup=kb,
    )
    await cb.answer()


@router.callback_query(F.data.startswith("stp:del:yes:"))
async def confirm_delete_task(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    task_id = int(cb.data.split(":")[3])

    removed = await tasks_repo.delete(task_id)
    if not removed:
        return await cb.answer("Задачи уже нет", show_alert=True)

    await cb.answer("🗑 Удалено")
    await cb.message.edit_text(
        f"🗑 <b>Задача #{task_id} удалена.</b>\n\n{removed['title'][:200]}"
    )


@router.callback_query(F.data.startswith("stp:del:no:"))
async def decline_delete_task(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer("⛔")
    await cb.answer("Оставили как есть")
    await cb.message.edit_text("◀️ Удаление отменено — задача на месте.")


# ═══════════════════════════════════════════════════════
# 🧠 ГЛАВНЫЙ МОЗГ — обработка ЛЮБОГО текста
# ═══════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════
# 📸 КОНТЕНТ: показать РЕАЛЬНУЮ публикацию / статус
# ═══════════════════════════════════════════════════════

# Просят ПОКАЗАТЬ сам контент (прислать пост), а не рассказать о нём
SHOW_WORDS = [
    "покажи",
    "покаж",
    "показать",
    "показывай",
    "скинь",
    "скинешь",
    "кинь",
    "пришли",
    "прислать",
    "присылай",
    "отправь",
    "дай глянуть",
    "дай посмотреть",
    "глянуть",
    "посмотреть",
    "увидеть",
    "хочу видеть",
    "хочу посмотреть",
    "давай сюда",
    "где он",
    "где она",
    "где пост",
]
# О каком контенте речь.
#
# Сравнение идёт по ЦЕЛЫМ СЛОВАМ (shared.utils.contains_any): «пост» внутри
# «Поставь», «поставки» и «поставщика» уже один раз увело задачу про зарплату
# в отдел контента. «Покажи поставки за неделю» по подстроке тоже читалось как
# «покажи опубликованный пост».
CONTENT_WORDS = [
    "пост",
    "сторис",
    "stories",
    "story",
    "публикац*",
    "контент*",
    "рецепт",
    "инстаграм*",
    "instagram",
    "лента",
    "ленту",
    "ленте",
    "мем",
]
# Вопрос о статусе/расписании (рассказать, а не показать).
# Звёздочка = совпадение по началу слова: «опубликова*» покрывает
# «опубликовали/опубликована», но не находится в середине чужого слова.
STATUS_WORDS = [
    "когда",
    "во сколько",
    "опубликова*",
    "статус",
    "вышел",
    "вышла",
    "вышло",
    "готов*",
    "уже",
    "выложил*",
    "расписани*",
    "график",
]
# Поручение СОЗДАТЬ новый контент (это задача, а не вопрос)
CREATE_WORDS = [
    "сделай",
    "создай",
    "напиши",
    "подготов*",
    "запусти",
    "опубликуй",
    "сгенерир*",
    "придумай",
    "нужен пост",
    "нужна сторис",
    "новый пост",
]


def detect_content_intent(low: str, last_intent: str = None) -> str:
    """
    Что руководитель хочет от контента: 'show' | 'status' | None.

    ⚠️ Порядок важен. «Покажи пост, который опубликовали сегодня» — это ПОКАЗАТЬ
    уже вышедшее, а не поручение публиковать: прошедшее время («опубликовали»,
    «выложили») не должно уводить в создание задачи.
    """
    has_content = contains_any(low, CONTENT_WORDS)
    has_show = contains_any(low, SHOW_WORDS)
    has_status = contains_any(low, STATUS_WORDS)
    has_create = contains_any(low, CREATE_WORDS)

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
        cap = f"📸 <b>{kind}</b>" + (
            f" — {when} (Instagram)" if when else " (Instagram)"
        )
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

        tid = await send_task(
            "stepan_bot", "content_bot", "get_last_post", {"day": day}
        )
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


def _merge_history(
    shared: list, local: list, limit: int = 20
) -> list:
    """Общая нить плюс то, чего в ней ещё нет.

    Раньше здесь стояло присваивание: `history = shared_history`. Всё, что
    легло только в FSM, при этом молча пропадало — а туда и попадали ответы с
    вызовом инструментов, потому что в общую память их никто не писал. Бот
    терял ровно те реплики, в которых он что-то сделал и о чём-то спросил.
    """
    seen = {(m.get("role"), (m.get("content") or "").strip()) for m in shared}
    extra = [
        m
        for m in local
        if (m.get("role"), (m.get("content") or "").strip()) not in seen
    ]
    return (list(shared) + extra)[-limit:]


def memory_scope(message: Message) -> Optional[str]:
    """Комната разговора для общей памяти. None — личная нить владельца.

    Личка и веб-админка — один разговор одного человека. Групповой чат —
    другой: там говорят менеджеры, и его реплики не должны всплывать в ответе
    на личный вопрос владельца.
    """
    if message.chat.type in ("group", "supergroup"):
        return f"chat{message.chat.id}"
    return None


async def _remember(
    state: FSMContext,
    user_text: str,
    assistant_text: str,
    intent: str = None,
    share: bool = True,
    scope: Optional[str] = None,
):
    """
    Записать обмен в общую память владельца и в FSM.

    Вызывать обязан КАЖДЫЙ путь ответа. Пока `_remember` стоял только на
    быстрых перехватах, а главный путь (ответ модели и ответ с вызовом
    инструмента) писал историю лишь в FSM, бот не помнил собственных слов:
    вопрос «Похоже, «Nozi» уже есть — это он?» не сохранялся нигде, и
    следующее «Нет» приходило к модели как реплика ни о чём.

    Общая память — источник истины: тот же разговор виден в веб-админке.
    FSM остаётся для короткого шага диалога (last_intent) и как запасной
    контекст, если витрина недоступна.

    `share=False` — реплика не владельца (сотрудник в рабочей группе). Нить
    в базе ключуется владельцем, и чужие сообщения в ней выглядели бы его
    словами; в FSM чата такая реплика сохраняется как обычно.
    """
    if share:
        try:
            from shared import assistant_memory

            await assistant_memory.append("user", user_text, scope=scope)
            await assistant_memory.append("assistant", assistant_text, scope=scope)
        except Exception as e:
            logger.warning(f"Не удалось записать обмен в общую память: {e}")

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
            await message.answer(
                "😔 Извините, не удалось расшифровать голосовое сообщение."
            )
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@router.message(F.text)
async def brain(message: Message, state: FSMContext = None) -> bool:
    """Степан обрабатывает текстовые сообщения.

    Возвращает False, если сообщение не для него: по этому ответу
    `group_orchestrator` ставит 🤷‍♂️ вместо 👍. Реакция «сделал» под
    выброшенным сообщением — ровно то, из-за чего распоряжение считали
    выполненным, хотя бот его даже не читал.
    """
    if not message.text:
        return False

    user_text = message.text.strip()
    if not user_text:
        return False

    # Посторонний в личке — молчим, как и раньше: бот руководителя не открытая
    # приёмная. А вот в рабочей группе молчать нельзя (см. is_staff_chat).
    if not may_command(message):
        return False

    await _process_brain(message, user_text, state)
    return True


async def _process_brain(message: Message, user_text: str, state: FSMContext = None):
    # Реакция 👀 "Взял в работу"
    await set_reaction(message, "👀")
    await simulate_typing(message, 2)

    low = user_text.lower()

    # Распоряжения отдаёт руководитель; сотруднику в рабочей группе доступны
    # ответы на вопросы бота и работа с клиентами (см. `may_command`).
    owner = is_admin(message.from_user.id)
    # Комната разговора: у группы своя нить памяти, у лички и админки — общая.
    scope = memory_scope(message)

    # Контекст прошлого обмена: last_intent — для коротких продолжений («Покажи»),
    # history — чтобы «Выполняй» знало, КАКОЙ план запускать.
    state_data = {}
    if state:
        try:
            state_data = await state.get_data()
        except Exception:
            state_data = {}
    last_intent = state_data.get("last_intent")

    # Контекст берём из общей памяти: тот же разговор владелец мог начать в
    # веб-админке, и продолжение здесь обязано его помнить. FSM — не запасной
    # вариант, а вторая половина: в нём лежит то, что происходило в этом чате.
    history = state_data.get("history", [])
    memory_ok = True
    try:
        from shared import assistant_memory

        shared_history = await assistant_memory.load_context(scope=scope)
        if shared_history is None:
            memory_ok = False
        elif shared_history:
            history = _merge_history(shared_history, history)
    except Exception as e:
        memory_ok = False
        logger.warning(f"Общая память недоступна, работаю по локальной истории: {e}")

    # ── ОТВЕТ НА СОБСТВЕННЫЙ ВОПРОС БОТА ──
    #
    # Идёт ПЕРВЫМ и доступен не только владельцу: «да»/«нет» — это ответ на
    # то, что бот сам спросил минуту назад, а не новое распоряжение. Отвечает
    # обычно тот менеджер, который клиента и привёл.
    answered = await _answer_open_customer_question(message, user_text)
    if answered:
        await set_reaction(message, "👍")
        await _remember(state, user_text, answered, intent="customer", share=owner, scope=scope)
        return

    # ── Ответ на «Сколько продали?» ──
    #
    # Отдел продаж спросил количество и ждёт. Руководитель отвечает словами —
    # «15 штук», — и это ответ на конкретный вопрос, а не новая мысль. Раньше
    # ответить можно было только кнопкой: токен заявки жил в callback_data, и
    # текст его не находил. Со стороны это выглядело как «бот не помнит, о чём
    # мы говорили минуту назад».
    answered = await _answer_open_sale_question(message, user_text)
    if answered:
        await set_reaction(message, "👍")
        await _remember(state, user_text, answered, intent="sale", share=owner, scope=scope)
        return

    # ── КОНТЕНТ: ПОКАЗАТЬ реальный пост / отдать статус публикаций ──
    # «Покажи пост» → присылаем сам пост (картинка + текст), а не расписание.
    # Ничего не публикуем и не создаём задачу — это просмотр уже вышедшего.
    intent = detect_content_intent(low, last_intent) if owner else None

    if intent == "show":
        day = "yesterday" if "вчера" in low else "today"
        ok = await _show_publications(message, day)
        await set_reaction(message, "👍" if ok else "🤷‍♂️")
        await _remember(
            state,
            user_text,
            "[Показал руководителю опубликованный контент]"
            if ok
            else "[Показывать нечего — публикаций ещё не было]",
            intent="show",
            scope=scope,
        )
        return

    if intent == "status":
        if await _content_status(message):
            await set_reaction(message, "👍")
            await _remember(
                state,
                user_text,
                "[Отдал статус публикаций на сегодня]",
                intent="status",
                scope=scope,
            )
            return
        # контент-бот не ответил — уходим в обычную обработку ниже

    # ── Команда «делайте / запускайте» → ЗАПУСК ПРИНЯТОГО ПЛАНА ──
    # После совещания это НЕ должно перезапускать анализ: если есть готовое
    # решение — запускаем его план в работу, а не создаём новые задачи-анализы.
    from bots.stepan_bot.handlers.team_meeting import (
        is_meeting_request,
        run_team_meeting,
        is_execution_command,
        handle_execution_command,
        is_status_request,
        run_plan_status,
    )

    if owner and is_execution_command(low):
        try:
            # Передаём план, который Степан только что предложил в чате, — это то,
            # что руководитель видит на экране, когда пишет «Делай». Он важнее
            # старого сохранённого решения (иначе воскресает вчерашний план).
            prev_q, prev_plan = _last_plan_from_history(history)
            if await handle_execution_command(
                message.bot,
                message.chat.id,
                fresh_plan=prev_plan,
                fresh_question=prev_q,
            ):
                await set_reaction(message, "👍")
                await _remember(
                    state, user_text, "[Запустил план в работу]", intent="execute",
                    scope=scope,
                )
                return

            # Плана нет — честно спрашиваем. НЕ проваливаемся в общий AI:
            # именно там он выдумывал задачу и публиковал пост в Instagram.
            await message.answer(
                "🤔 Не вижу плана, который нужно выполнить.\n\n"
                "Скажите, что именно запустить — или задайте вопрос, "
                "и я соберу отделы на совещание."
            )
            await set_reaction(message, "🤷‍♂️")
            await _remember(
                state, user_text, "[Плана для запуска нет — попросил уточнение]",
                scope=scope,
            )
            return
        except Exception as e:
            logger.error(f"Ошибка запуска плана: {e}", exc_info=True)
            await message.answer("😔 Не удалось запустить план. Попробуйте ещё раз.")
            await set_reaction(message, "🤷‍♂️")
            return

    # ── Запрос статуса плана ──
    if owner and is_status_request(low):
        try:
            await run_plan_status(message.bot, message.chat.id)
            await set_reaction(message, "👍")
            await _remember(
                state, user_text, "[Отдал статус принятого плана]", intent="plan_status",
                scope=scope,
            )
            return
        except Exception as e:
            logger.error(f"Ошибка статуса плана: {e}", exc_info=True)

    # ── Перекличка: «отозвутся / перекличка / на связи / кто на связи» ──
    # Простой health-check отделов — НЕ совещание. Проверяем ДО is_meeting_request,
    # потому что «все отделы отозвутся» содержит «все отделы» и попадает в MEETING_TRIGGERS.
    _ROLL_CALL_TRIGGERS = [
        "отозв",
        "перекличк",
        "кто на связи",
        "все на связи",
        "на связи ли",
        "отчитайтесь",
        "отчитайся",
        "кто работает",
        "все работают",
        "все ли работают",
        "все ли на связи",
        "проверка связи",
        "чекин",
        "check in",
        "roll call",
    ]
    if owner and any(t in low for t in _ROLL_CALL_TRIGGERS):
        try:
            from shared.event_bus import event_bus

            await event_bus.publish(
                "ROLL_CALL",
                {
                    "chat_id": message.chat.id,
                    "message": user_text,
                },
                source_bot="stepan_bot",
            )
            await message.answer(
                "📢 Я запросил все отделы отозваться в этом чате. Ожидайте подтверждений."
            )
            await set_reaction(message, "👍")
            await _remember(
                state, user_text, "[Запустил перекличку отделов]", intent="roll_call",
                scope=scope,
            )
        except Exception as e:
            logger.error(f"Ошибка переклички: {e}", exc_info=True)
            await message.answer("😔 Не удалось запустить перекличку.")
            await set_reaction(message, "🤷‍♂️")
        return

    # ── Кросс-функциональный вопрос → СОВЕЩАНИЕ ОТДЕЛОВ ──
    # Отделы обсуждают между собой, спорят и сходятся к одному решению,
    # вместо трёх разрозненных задач/ответов.
    if owner and is_meeting_request(low):
        try:
            await run_team_meeting(message.bot, message.chat.id, user_text)
            await set_reaction(message, "👍")
            await _remember(
                state,
                user_text,
                "[Провёл совещание отделов по вопросу]",
                intent="meeting",
                scope=scope,
            )
        except Exception as e:
            logger.error(f"Ошибка совещания отделов: {e}", exc_info=True)
            await message.answer(
                "😔 Не удалось провести совещание отделов. Попробуйте ещё раз."
            )
            await set_reaction(message, "🤷‍♂️")
        return

    # ── Формируем промпт с контекстом из БД ──
    db_context = await _get_db_context()

    from shared.prompts import TEAM_CONTEXT

    prompt = f"{TEAM_CONTEXT}\n\n{STEPAN_PERSONA}"
    prompt += f"\n\n📊 ТЕКУЩИЕ ДАННЫЕ ИЗ БАЗЫ:\n{db_context}"

    # Незакрытый вопрос отдела продаж — фактом в промпт, а не надеждой на то,
    # что модель сама выудит его из истории. Короткий числовой ответ до сюда
    # не доходит (перехвачен выше), но развёрнутый — «пятнадцать лотков, и
    # заодно два редиса» — разбирает модель, и без этого блока она собрала бы
    # вторую продажу с нуля.
    pending_block = await _open_sale_prompt(message.chat.id)
    if pending_block:
        prompt += pending_block

    # То же самое про клиента: развёрнутое «нет, это другой ресторан, у них
    # свой номер» перехватом не ловится, а вопрос всё ещё открыт.
    customer_block = await _open_customer_prompt(message.chat.id)
    if customer_block:
        prompt += customer_block

    # На какое сообщение отвечают свайпом вправо. Без этого блока реплика
    # «Нет» приходила к модели голой: адресат ответа известен Telegram, но
    # никто его не читал.
    prompt += _reply_context(message)

    if not memory_ok:
        prompt += (
            "\n\n⚠️ ОБЩАЯ ПАМЯТЬ РАЗГОВОРА СЕЙЧАС НЕДОСТУПНА. Ты видишь только "
            "последние реплики этого чата. Не делай вид, что помнишь прежние "
            "договорённости: если ответ зависит от них — так и скажи."
        )

    # история уже получена в начале _process_brain (state_data)

    # ── Инструменты из единого реестра (tools.ts → HTTP → кеш) ──
    from shared.stepan_tools import load_registry

    tools = await load_registry("tg")
    if not owner:
        # Сотруднику — только клиенты и каталог. Ограничение живёт в наборе
        # инструментов, а не в тексте промпта: чего нет в списке, того модель
        # не вызовет, как бы её ни просили.
        tools = [
            t
            for t in tools
            if str((t.get("function") or {}).get("name", "")) in STAFF_TOOLS
        ]
        prompt += (
            "\n\n👤 СЕЙЧАС ПИШЕТ СОТРУДНИК, А НЕ РУКОВОДИТЕЛЬ. Ты можешь найти "
            "и завести клиента, посмотреть его заказы, назвать цену из каталога. "
            "Задачи, деньги, цены, рассылки и публикации — только через "
            "руководителя: так и скажи, коротко и без извинений."
        )

    try:
        response_msg = await ai.chat_with_tools(
            system_prompt=prompt,
            user_message=user_text,
            tools=tools,
            conversation_history=history,
        )
    except Exception as e:
        # Раньше здесь было глухое «не смог обработать» — по нему невозможно понять,
        # кончилась ли квота OpenAI, протух ли ключ или отвалилась сеть. Называем причину.
        logger.error(f"AI error: {type(e).__name__}: {e}", exc_info=True)
        await message.answer(
            f"😔 Не смог обработать: {_ai_error_reason(e)}", parse_mode="HTML"
        )
        await set_reaction(message, "🤷‍♂️")
        return

    # Функция для отправки ответа (текст + опционально голос)
    async def send_response(text_resp: str):
        if not text_resp:
            return
        # Защита: если модель вернула JSON-обёртку ({"type":"chat","response":"..."})
        # вместо чистого текста — вытащим человекочитаемую часть.
        stripped = text_resp.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                obj = json.loads(stripped)
                if isinstance(obj, dict):
                    text_resp = (
                        obj.get("response")
                        or obj.get("answer")
                        or obj.get("text")
                        or obj.get("message")
                        or text_resp
                    )
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
        # Пары (инструмент, результат) — запасной ответ, если модель не
        # сформулирует его сама. Держим отдельно от текста для истории: туда
        # идёт сокращённая строка, а человеку нужен сам результат.
        tool_facts: list = []
        intent_after = None
        sale_handled = (
            False  # одно сообщение = одна продажа, сколько бы вызовов ни выдала модель
        )
        # Сказал ли бот руководителю хоть что-то.
        #
        # Инструмент, отработавший молча, неотличим от «бот не понял». В группе
        # «Продажа» на «Клиент <имя>, <номер>, ЗАРЕГИСТРИРУЙ» карточка в CRM
        # завелась, а в чат не ушло ни строчки: ветка офисных инструментов ниже
        # печатала только ключ `message`, которого у CRM-инструментов нет —
        # они возвращают `summary`. Второго прохода к модели здесь не было
        # вовсе, в отличие от отделов (shared/tool_runtime.py), поэтому пустой
        # `content` при function calling означал ровно тишину и реакцию 👍.
        spoke = False

        # Сообщение о СОСТОЯВШЕЙСЯ продаже — это факт, а не поручение. «Продали 10 гороха,
        # доставил Амир» модель норовила превратить ещё и в задачу отделу «организовать
        # доставку» — то есть поручить сделать то, что уже сделано. Регистрируем продажу,
        # задачи по ней не создаём.
        calls = list(response_msg.tool_calls)
        if any(c.function.name == "register_sale" for c in calls):
            dropped = [
                c.function.name for c in calls if c.function.name == "create_task"
            ]
            if dropped:
                logger.info(
                    "Степан: продажа уже состоялась — не создаю задачу %s", dropped
                )
            calls = [c for c in calls if c.function.name != "create_task"]

        # Одно поручение = одна задача. Модель дробит «собери совещание всех
        # отделов» на вызов create_task per-отдел, и в базу ложились четыре
        # подряд идущие строки с одним и тем же текстом — их потом было даже
        # нечем удалить. Защита ровно как у register_sale ниже, только ключом
        # служит пара (заголовок, отдел): разные задачи в одном ответе — норма.
        seen_tasks: set = set()

        for tool_call in calls:
            name = tool_call.function.name
            args = json.loads(tool_call.function.arguments or "{}")

            if name == "create_task":
                key = (
                    " ".join(str(args.get("title", "")).lower().split()),
                    str(args.get("department", "pm")).lower(),
                )
                if key in seen_tasks:
                    logger.warning(
                        "Степан: повторный create_task «%s» в одном сообщении — игнорирую",
                        key[0][:60],
                    )
                    continue
                seen_tasks.add(key)
                # Activate the previously dead _handle_task orchestrator
                await _handle_task(message, args)
                # `_handle_task` отвечает руководителю на каждой ветке — от
                # карточки подтверждения до отказа при ошибке вставки.
                spoke = True
                tool_results_text.append(
                    f"Задача передана в отдел {args.get('department', 'pm')}."
                )

            elif name == "register_sale":
                # Продажу регистрирует ОТДЕЛ ПРОДАЖ (bot_bus), а не Степан своими руками:
                # это его должностная обязанность, и результат — факты из БД, а не текст.
                # Модель иногда дробит одну продажу на вызов per-позицию — это дало бы
                # три заказа и три ответа в чат вместо одного. Берём только первый вызов.
                if sale_handled:
                    logger.warning(
                        "Степан: повторный register_sale в одном сообщении — игнорирую"
                    )
                    continue
                sale_handled = True
                result_text = await _register_sale(message, args, user_text)
                tool_results_text.append(result_text)
                intent_after = "sale"
                spoke = True

            elif name == "add_product":
                # Новый товар заводит отдел продаж — и в магазине, и в CRM.
                # Вызывается только после одобрения руководителя (см. промпт).
                result_text = await _add_product(message, args)
                tool_results_text.append(result_text)
                intent_after = "sale"
                spoke = True

            elif name == "add_customer":
                # Карточка клиента — с тем же вопросом о тёзке и теми же
                # кнопками, что у продажи. Раньше вызов уходил в общий разбор
                # офисных инструментов ниже, и вопрос печатался строкой
                # `error` с припиской «повтори с force_new»: ответить на неё
                # человеку было нечем, и клиент не заводился вовсе.
                from bots.stepan_bot.handlers import customer_ui

                result = await customer_ui.run_add_customer(args)
                logger.info("Степан: add_customer → %s", str(result)[:300])
                result_text = await customer_ui.answer_customer_result(message, result)
                tool_results_text.append(result_text)
                intent_after = "customer"
                spoke = True

            elif name == "roll_call":
                from shared.event_bus import event_bus

                await event_bus.publish(
                    "ROLL_CALL",
                    {
                        "chat_id": message.chat.id,
                        "message": args.get("message", "Перекличка!"),
                    },
                )
                tool_results_text.append("Перекличка запущена.")
                await send_response(
                    "📢 Я запросил все отделы отозваться в этом чате. Ожидайте подтверждений."
                )
                spoke = True

            elif name == "show_published_post":
                # Показываем САМ пост (картинка + текст), а не пересказ расписания
                ok = await _show_publications(message, args.get("day", "today"))
                tool_results_text.append(
                    "Опубликованный контент показан руководителю."
                    if ok
                    else "Показывать нечего — публикаций ещё не было."
                )
                intent_after = "show"
                spoke = True

            elif tool_registry.by_name(name) is not None:
                # Инструмент офиса — исполняем в процессе. Раньше сюда попадали
                # только восемь имён из руками поддерживаемого списка, а всё
                # остальное уходило на витрину, даже если офис умел это сам:
                # так `get_content_status` и `find_product` отвечали по-разному
                # в зависимости от того, кто спросил.
                #
                # Подтверждения у Стёпана нет намеренно: он разговаривает с
                # владельцем, и спрашивать разрешения у того, кто только что
                # отдал распоряжение, — лишний шаг. Карточки остаются для
                # инструментов витрины (ветка ниже).
                result = await tool_registry.call(
                    name, {**args, "chat_id": message.chat.id}
                )
                # По логам нельзя было понять, что бот вообще сделал: имя
                # вызванного инструмента нигде не печаталось, а разбор
                # начинается именно с него.
                logger.info("Степан: инструмент %s → %s", name, str(result)[:300])
                if isinstance(result, dict) and result.get("message"):
                    await message.answer(str(result["message"]))
                    spoke = True
                # Усечение — общее с отделами (6000 символов и пометка
                # «результат сокращён»). Здесь стояло `[:600]` без пометки: полный
                # прайс-лист обрывался на первой категории — `list_active`
                # сортирует по слагу, поэтому `[baby-leaf]` шёл первым, а все
                # 18 позиций микрозелени в историю не попадали вовсе. Ни модель,
                # ни лог не могли узнать, что данные обрезаны.
                tool_results_text.append(f"{name}: {dump_result(result)}")
                tool_facts.append((name, result))

            else:
                # Инструмент витрины — исполняем удалённо: set_setting,
                # change_product_price, toggle_bot_job, deactivate_learning и др.
                from shared.stepan_tools import execute_remote

                result = await execute_remote(name, args)

                if result.get("status") == "confirm":
                    # Изменяющее действие: витрина вернула подписанное
                    # предложение, но ничего не выполнила. Показываем карточку
                    # «было → стало» и ждём нажатия — ровно как в админке.
                    prop = result.get("proposal") or {}
                    await _offer_write_action(message, prop, name)
                    tool_results_text.append(f"Предложено подтвердить: {name}.")
                    spoke = True
                elif result.get("status") == "ok":
                    # Форматируем результат для модели и отправляем в чат
                    res_data = result.get("result")
                    if isinstance(res_data, dict) and res_data.get("message"):
                        await message.answer(str(res_data["message"]))
                        spoke = True
                    elif isinstance(res_data, dict) and res_data.get("ok") is not None:
                        # WriteTool.execute() вернул {ok, message}
                        msg = res_data.get("message", "Готово")
                        await message.answer(
                            f"{'✅' if res_data['ok'] else '❌'} {msg}"
                        )
                        spoke = True
                    tool_results_text.append(f"Инструмент {name} выполнен.")
                    tool_facts.append((name, res_data))
                else:
                    error = result.get("error", "неизвестная ошибка")
                    await message.answer(f"⚠️ Инструмент {name}: {error}")
                    tool_results_text.append(f"Инструмент {name} не выполнен: {error}")
                    spoke = True

        # Запоминаем то, что реально сказали. Раньше эта ветка писала историю
        # ТОЛЬКО в FSM, а общая память её потом перетирала — бот забывал и
        # выполненное действие, и заданный вопрос.
        spoken = " ".join(
            part
            for part in (
                "; ".join(t for t in tool_results_text if t),
                (response_msg.content or "").strip(),
            )
            if part
        ).strip()
        await _remember(
            state,
            user_text,
            spoken or "[Выполнил действие, но сказать было нечего]",
            intent=intent_after,
            share=owner,
            scope=scope,
        )

        # Показ поста, отчёт о продаже и вопрос о клиенте уже сами себя
        # объяснили — не даём модели сверху приписать выдуманный комментарий и
        # противоречить фактам из БД.
        if response_msg.content and intent_after not in ("show", "sale", "customer"):
            await send_response(response_msg.content)
            spoke = True

        # Инструмент отработал, а сказать оказалось нечего. Для руководителя это
        # неотличимо от «бот не понял»: он видит только реакцию 👍 — и повторяет
        # распоряжение, хотя оно уже выполнено. Печатаем результат как есть.
        if not spoke:
            await send_response(_show_tool_results(tool_facts))

        await set_reaction(message, "👍")
        return

    # If no tools called, just send the text
    response_text = (response_msg.content or "").strip()
    if not response_text:
        # Пустой ответ модели выглядел как «бот прочитал и промолчал»: ни
        # текста, ни реакции, ни следа. Отвечаем честно — переспросить дешевле,
        # чем оставить человека гадать, дошло ли сообщение.
        response_text = (
            "🤔 Не понял, что нужно сделать. Скажите чуть конкретнее — "
            "или переспросите, я рядом."
        )
        await set_reaction(message, "🤷‍♂️")
    await send_response(response_text)
    # Молчание модели тоже событие: без строки в истории следующая реплика
    # придёт как первая, и разговор снова начнётся с нуля. `last_intent`
    # переносим прежний — короткое «Покажи» должно оставаться продолжением.
    await _remember(state, user_text, response_text, intent=last_intent, share=owner, scope=scope)


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
                text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM crm_orders "
                    "WHERE DATE(created_at) = CURRENT_DATE"
                )
            )
            cnt, total = res.fetchone()
            lines.append(f"📦 Заказы сегодня: {cnt} на {format_price(total)}")

            # Заказы из Instagram
            res = await session.execute(
                text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM crm_orders "
                    "WHERE DATE(created_at) = CURRENT_DATE AND order_number LIKE 'IG-%'"
                )
            )
            ig_cnt, ig_total = res.fetchone()
            if ig_cnt > 0:
                lines.append(f"  📸 Из Instagram: {ig_cnt} на {format_price(ig_total)}")

            # Все заказы за неделю
            res = await session.execute(
                text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM crm_orders "
                    "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
                )
            )
            week_cnt, week_total = res.fetchone()
            lines.append(
                f"📦 Заказы за неделю: {week_cnt} на {format_price(week_total)}"
            )

            # Новые/необработанные заказы
            res = await session.execute(
                text("SELECT COUNT(*) FROM crm_orders WHERE status = 'new'")
            )
            new_orders = res.scalar()
            if new_orders > 0:
                lines.append(f"⚠️ Необработанных заказов: {new_orders}")

            # ═══ ЗАДАЧИ ПО ОТДЕЛАМ ═══
            res = await session.execute(
                text(
                    "SELECT department, COUNT(*) FROM tasks "
                    "WHERE status IN ('todo','in_progress') "
                    "GROUP BY department ORDER BY COUNT(*) DESC"
                )
            )
            dept_tasks = res.fetchall()
            active_total = sum(r[1] for r in dept_tasks)
            lines.append(f"\n📋 Активных задач: {active_total}")
            for dept, cnt in dept_tasks:
                lines.append(f"  - {dept or 'общие'}: {cnt}")

            # Задачи связанные с Instagram
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM tasks "
                    "WHERE status IN ('todo','in_progress') "
                    "AND (title LIKE '%IG%' OR title LIKE '%Instagram%' OR description LIKE '%Instagram%')"
                )
            )
            ig_tasks = res.scalar()
            if ig_tasks > 0:
                lines.append(f"  📸 Из Instagram: {ig_tasks}")

            # ═══ ФИНАНСЫ ═══
            res = await session.execute(
                text(
                    "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0), "
                    "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) "
                    "FROM finances WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)"
                )
            )
            inc, exp = res.fetchone()
            lines.append(f"\n💰 Доходы за месяц: {format_price(inc)}")
            lines.append(f"💸 Расходы за месяц: {format_price(exp)}")

            # ═══ КЛИЕНТЫ ═══
            res = await session.execute(text("SELECT COUNT(*) FROM customers"))
            cust = res.scalar()
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers WHERE notes LIKE '%instagram%' OR notes LIKE '%Instagram%'"
                )
            )
            ig_cust = res.scalar() or 0
            lines.append(f"\n👥 Всего клиентов: {cust} (из Instagram: {ig_cust})")

            # ═══ ПОСЛЕДНИЕ СОБЫТИЯ ═══
            # Последние 5 задач
            res = await session.execute(
                text(
                    "SELECT title, department, status, created_at FROM tasks "
                    "ORDER BY created_at DESC LIMIT 5"
                )
            )
            recent = res.fetchall()
            if recent:
                lines.append("\n📌 Последние задачи:")
                for t in recent:
                    created = t[3].strftime("%d.%m %H:%M") if t[3] else ""
                    lines.append(f"  - [{t[1] or '?'}] {t[0][:60]} ({t[2]}) {created}")

            # Последние заказы (все за сегодня + последние 5)
            res = await session.execute(
                text(
                    "SELECT order_number, total_amount, status, notes, created_at FROM crm_orders "
                    "WHERE DATE(created_at) = CURRENT_DATE "
                    "ORDER BY created_at DESC LIMIT 10"
                )
            )
            recent_orders = res.fetchall()
            if recent_orders:
                lines.append("\n🛒 Заказы сегодня (детали):")
                for o in recent_orders:
                    created = o[4].strftime("%H:%M") if o[4] else ""
                    notes = (o[3] or "")[:120]
                    lines.append(
                        f"  - {o[0]}: {format_price(o[1])} ({o[2]}) [{created}] {notes}"
                    )

            return "\n".join(lines)
    except Exception as e:
        logger.warning(f"DB context error: {e}")
        return "Данные из БД временно недоступны."


def _ai_error_reason(exc: Exception) -> str:
    """Человеческая причина отказа модели — чтобы не гадать по логам."""
    name = type(exc).__name__
    text_l = str(exc).lower()

    if "insufficient_quota" in text_l or "exceeded your current quota" in text_l:
        return (
            "на счёте OpenAI закончились деньги (insufficient_quota). "
            "Пополните баланс — до этого я думать не могу."
        )
    if name == "RateLimitError" or "rate limit" in text_l or "429" in text_l:
        return (
            "OpenAI ограничил частоту запросов (rate limit). Попробуйте через минуту."
        )
    if name == "AuthenticationError" or "invalid_api_key" in text_l or "401" in text_l:
        return "ключ OpenAI недействителен — проверьте OPENAI_API_KEY на сервере."
    if "timeout" in text_l or name in ("APITimeoutError", "APIConnectionError"):
        return "OpenAI не ответил вовремя (сеть/таймаут). Повторите."
    if name == "BadRequestError" or "400" in text_l:
        return f"OpenAI отклонил запрос: {str(exc)[:200]}"
    return f"{name}: {str(exc)[:200]}"


# Короткий ответ с числом: «15», «15 штук», «15 лотков», «по 15».
# Длиннее — уже не ответ на вопрос, а новое сообщение: там может оказаться
# и «продай 15 гороха ресторану Навруз», которое надо разбирать моделью.
_QUANTITY_REPLY = re.compile(
    r"^\D{0,12}(\d{1,4})(?:[.,]\d+)?\s*"
    r"(шт|штук|штуки|лоток|лотка|лотков|стакан\w*|кг|упаковк\w*|пачк\w*)?\.?$",
    re.IGNORECASE,
)

# Ответ ценой: «15000», «15 000», «15000 сум», «по 15 000 so'm».
# Отдельная регулярка, а не расширение предыдущей: у количества стоит `\d{1,4}`
# намеренно, чтобы «15000» не прочиталось как пятнадцать тысяч лотков. Какую из
# двух применить, решает не длина числа, а вопрос, который задал отдел
# (`needs` открытой заявки), — иначе эти два случая неразличимы.
_PRICE_REPLY = re.compile(
    r"^\D{0,12}(\d{1,3}(?:[\s ]?\d{3})*|\d{3,9})(?:[.,]\d+)?\s*"
    r"(сум|сумов|сўм|so'm|som|uzs|тыс\w*|к)?\.?$",
    re.IGNORECASE,
)


# Ответ «это он» и ответ «это другой» — на трёх языках, которыми пишут в
# группе «Продажа». Ошибиться здесь дороже, чем переспросить: чужая реплика,
# принятая за ответ, привяжет клиента не к той карточке. Поэтому — только
# короткая реплика целиком, без «нет, но вообще…» в продолжении.
_YES_REPLY = re.compile(
    r"^(да|ага|угу|он|она|это он|тот самый|верно|точно|ha|xa|ha'a|shu|shu odam)"
    r"[\s.,!]*$",
    re.IGNORECASE,
)
_NO_REPLY = re.compile(
    r"^(нет|не|не он|другой|новый|это новый|новый клиент|заводи|заведи|"
    r"yo'q|yoq|yangi|boshqa)[\s.,!]*$",
    re.IGNORECASE,
)


def _reply_context(message: Message) -> str:
    """Кого цитируют свайпом вправо — отдельной строкой в промпт.

    В Telegram ответ на сообщение и есть указание адреса: «Нет» под вопросом
    о тёзке клиента и «Нет» в общем потоке — разные реплики. Модель об этом не
    знала ни разу: `reply_to_message` не читался нигде, кроме совещаний.
    """
    quoted = getattr(message, "reply_to_message", None)
    if quoted is None:
        return ""

    body = (quoted.text or quoted.caption or "").strip()
    if not body:
        return ""
    body = body[:600]

    author = getattr(quoted, "from_user", None)
    bot_id = getattr(message.bot, "id", None)
    if author and bot_id and author.id == bot_id:
        return (
            f"\n\n📎 СОБЕСЕДНИК ОТВЕЧАЕТ НА ТВОЁ СООБЩЕНИЕ:\n«{body}»\n"
            f"Его реплика относится именно к нему — не начинай тему заново."
        )
    name = (author.full_name if author else "") or "коллега"
    return f"\n\n📎 СОБЕСЕДНИК ЦИТИРУЕТ СООБЩЕНИЕ ({name}):\n«{body}»"


async def _open_customer_prompt(chat_id: int) -> str:
    """Блок про незакрытый вопрос о клиенте. Пусто — нечего ждать."""
    from bots.stepan_bot.handlers.customer_ui import open_question

    try:
        question = await open_question(chat_id)
    except Exception as exc:
        logger.warning(f"Незакрытый вопрос о клиенте недоступен: {exc}")
        return ""
    if not question:
        return ""

    record = question["pending"]
    params = record.get("params") or {}
    listed = ", ".join(
        f"{c.get('name')} (#{c.get('id')})" for c in (record.get("candidates") or [])
    )
    return (
        f"\n\n❓ НЕЗАКРЫТЫЙ ВОПРОС О КЛИЕНТЕ:\n"
        f"  заводим: {params.get('name') or '—'} "
        f"({params.get('phone') or 'телефон не назван'})\n"
        f"  спросил, не он ли это: {listed or '—'}\n"
        f"Ответ собеседника относится к НЕМУ. «Нет / другой / новый» — вызови "
        f"add_customer с теми же данными и force_new=true. «Да» — карточку не "
        f"заводи, скажи, что клиент уже есть."
    )


async def _answer_open_customer_question(
    message: Message, user_text: str
) -> Optional[str]:
    """Закрыть вопрос о тёзке коротким «да»/«нет». None — это не ответ.

    Ровно тот случай, ради которого всё и делалось: 16.08.2026 менеджер
    ответил на вопрос бота «Нет» реплаем, и ответ пропал — состояния не было,
    а сам он в администраторах не значится. Клиент так и не завёлся.

    Реплай (свайп вправо) считается ответом, даже если слова не короткие:
    когда цитируют именно наш вопрос, сомнений в адресате нет.
    """
    text_body = (user_text or "").strip()

    from bots.stepan_bot.handlers.customer_ui import (
        answer_customer_result,
        confirm_existing,
        confirm_new,
        open_question,
    )

    try:
        question = await open_question(message.chat.id)
    except Exception as exc:
        logger.warning(f"Незакрытый вопрос о клиенте недоступен: {exc}")
        return None
    if not question:
        return None

    reply_to = getattr(message, "reply_to_message", None)
    answers_our_question = bool(
        reply_to
        and question.get("message_id")
        and reply_to.message_id == question["message_id"]
    )
    if not answers_our_question and len(text_body) > 30:
        return None

    if _NO_REPLY.match(text_body):
        result = await confirm_new(message.chat.id)
    elif _YES_REPLY.match(text_body):
        result = await confirm_existing(message.chat.id)
    else:
        return None  # ответили не «да» и не «нет» — пусть разбирает модель

    if result is None:
        return None
    return await answer_customer_result(message, result)


async def _open_sale_prompt(chat_id: int) -> str:
    """Блок про незакрытую продажу для системного промпта. Пусто — нечего ждать."""
    from bots.stepan_bot.handlers.sale_ui import open_question

    try:
        question = await open_question(chat_id)
    except Exception as exc:
        logger.warning(f"Незакрытая продажа недоступна: {exc}")
        return ""
    if not question:
        return ""

    pending = question["pending"]
    items = ", ".join(
        f"{i.get('product')}"
        + ("" if i.get("quantity") in (None, "") else f" ×{i['quantity']:g}")
        for i in pending.get("items", [])
    )
    # Карта знала только два вопроса из пяти, и «цена»/«товар»/«телефон»
    # превращались в бессодержательное «данные»: модель не понимала, что
    # именно означает короткая реплика руководителя.
    missing = {
        "quantity": "количество",
        "customer": "клиент",
        "price": "цена товара",
        "product": "какой именно товар",
        "phone": "телефон клиента",
    }.get(question.get("needs"), "данные")
    return (
        f"\n\n❓ НЕЗАКРЫТАЯ ПРОДАЖА (отдел продаж ждёт ответа):\n"
        f"  клиент: {pending.get('customer_name') or '—'}\n"
        f"  позиции: {items or '—'}\n"
        f"  не хватает: {missing}\n"
        f"Ответ руководителя относится к НЕЙ. Вызови register_sale один раз, "
        f"взяв клиента и позиции отсюда."
    )


async def _answer_open_sale_question(message: Message, user_text: str) -> Optional[str]:
    """Дописать незакрытую продажу числом из ответа. None — это не ответ.

    Какое это число — количество или цена, — решает вопрос, который задал отдел,
    а не вид самого числа: «15000» одинаково похоже и на пятнадцать тысяч сумов,
    и на количество. Раньше разбиралось только количество, поэтому «Назовите
    цену» текстом закрыть было нельзя.

    Реплай (свайп вправо) на сам вопрос считается ответом независимо от длины:
    когда цитируют именно нашу реплику, адресат назван, и гадать по виду текста
    незачем. Без этого «Пятнадцать, но два из них Санго» пролетало мимо заявки.

    Возвращает строку для истории диалога, если продажа дозаписана.
    """
    text_body = (user_text or "").strip()

    from bots.stepan_bot.handlers.sale_ui import (
        answer_sale_result,
        complete_with_price,
        complete_with_quantity,
        open_question,
    )

    try:
        question = await open_question(message.chat.id)
    except Exception as exc:
        logger.warning(f"Незакрытая продажа недоступна: {exc}")
        return None
    if not question:
        return None

    reply_to = getattr(message, "reply_to_message", None)
    answers_our_question = bool(
        reply_to
        and question.get("message_id")
        and reply_to.message_id == question["message_id"]
    )
    if not answers_our_question and len(text_body) > 30:
        return None

    needs = question.get("needs")
    if needs == "quantity":
        pattern, complete = _QUANTITY_REPLY, complete_with_quantity
    elif needs == "price":
        pattern, complete = _PRICE_REPLY, complete_with_price
    else:
        return None  # спрашивали не число — разбирает модель

    match = pattern.match(text_body)
    if not match:
        return None
    value = float(re.sub(r"[\s ]", "", match.group(1)).replace(",", "."))

    try:
        result = await complete(message.chat.id, value)
    except Exception as exc:
        logger.error(f"Дозапись продажи по ответу «{text_body}»: {exc}", exc_info=True)
        return None
    if result is None:
        return None  # открытого вопроса нет — обычное сообщение
    return await answer_sale_result(message, result)


def _show_tool_results(facts: list) -> str:
    """Результаты инструментов — руководителю, ДОСЛОВНО.

    Здесь стоял второй проход к модели («сформулируй ответ по этим данным»), и
    он разменял молчание на неверный ответ: прайс `[baby-leaf]` (100 г, 35 000)
    модель назвала «прайс-листом на микрозелень», хотя микрозелень стоит
    15 000–20 000 за ЛОТОК. Цены при этом были настоящие — переехала категория.
    Вдобавок системный промпт несёт `BRAND_TEXT_STYLE`, то есть просит
    рекламный тон и хэштег в конце: внутренний прайс выходил похожим на пост.

    Цифра, прошедшая через пересказ, — уже не цифра из базы. Формат каждого
    инструмента живёт в `shared/tool_render.py`.
    """
    from shared import tool_render

    parts = [tool_render.render(name, result) for name, result in facts]
    parts = [p for p in parts if p and p.strip()]
    if not parts:
        return "Инструмент отработал, но результата не вернул. Проверьте в админке."
    return "\n\n".join(parts)


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
        await message.answer(
            "😔 Отдел продаж недоступен — продажа НЕ зарегистрирована. Повторите позже."
        )
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
        return f"Товар «{name}» добавлен в каталог" + (
            " и в магазин."
            if result.get("data", {}).get("in_storefront")
            else " (только CRM)."
        )
    return f"Товар не добавлен: {result.get('message', 'нет данных')}"


# Текст карточки подтверждения повторяет формулировки инструментов
# publish_content / publish_story: владелец должен видеть одно и то же, каким
# бы путём действие ни пришло — из задачи отдела или из голосового сообщения.
_PUBLISH_SUMMARY = {
    "publish_story": "Опубликовать сторис в Instagram",
    "publish_post": "Опубликовать сторис в Instagram (пост)",
    "generate_meme": "Сгенерировать и опубликовать мем",
}


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
    #
    # Сравнение по ЦЕЛЫМ СЛОВАМ, а не по подстроке. 10.08.2026 фраза «Поставь
    # этот вопрос на общее заседание» попала сюда дважды: «опрос» ⊂ «вопрос»
    # и «пост» ⊂ «Поставь». Задача про зарплату сотрудника уехала в отдел
    # контента и чуть не вышла постом в Instagram.
    combined_text = f"{title} {description} {dept}"
    if contains_any(
        combined_text,
        [
            "опрос",
            "poll",
            "викторин*",
            "мем",
            "сторис",
            "stories",
            "пост",
            "публикац*",
            "контент*",
        ],
    ):
        dept = "content"
        assignee = "Content Bot"

    # ── Защита от «осиротевших» отделов ──
    # Задачу должен кто-то слушать (event_bus TASK_CREATED). Отделы operations/
    # production/logistics принимает PM (COO). Всё неизвестное (в т.ч. "assistant")
    # тоже отдаём PM, иначе задача создастся в БД, но исполнителя не будет.
    LISTENED_DEPTS = {
        "sales",
        "marketing",
        "support",
        "hr",
        "finance",
        "pm",
        "analytics",
        "content",
        "operations",
        "production",
        "logistics",
        "qa",
        "rnd",
        "devops",
    }
    if dept not in LISTENED_DEPTS:
        dept = "pm"

    # ── Делегирование через Bot Bus для контент-задач ──
    if dept == "content":
        content_actions = {
            "story": "publish_story",
            "сторис": "publish_story",
            "stories": "publish_story",
            "сториз": "publish_story",
            "post": "publish_post",
            "пост": "publish_post",
            "публикуй": "publish_story",
            "опубликуй": "publish_story",
            "meme": "generate_meme",
            "мем": "generate_meme",
        }

        # Целые слова: см. комментарий у safety routing выше. Порядок ключей
        # значим — первое совпадение выигрывает, поэтому «сторис» стоит раньше
        # «пост».
        action = first_match(f"{title} {description}", content_actions)

        if action:
            # ⚠️ ПУБЛИКАЦИЯ ТОЛЬКО ПОСЛЕ ПОДТВЕРЖДЕНИЯ.
            #
            # Раньше отсюда шёл send_task сразу, и content_bot выкладывал в
            # Instagram без единого вопроса. Тот же самый инструмент через
            # реестр объявлен risky=True с карточкой ✅/❌ (shared/tools/content.py):
            # одно действие, две двери, и одна была без охраны. 10.08.2026
            # публикацию остановила только ошибка импорта — иначе в аккаунт
            # компании ушёл бы пост, сочинённый по теме зарплаты сотрудника.
            #
            # Распознавание намерения теперь по целым словам, но это первая
            # преграда, а не единственная: ошибётся снова — карточка удержит.
            topic = description or title
            token = await approvals.request(
                message.bot,
                message.chat.id,
                "content_publish",
                {"action": action, "topic": topic},
                _PUBLISH_SUMMARY.get(action, action),
                bot_name="stepan_bot",
                details=f"📝 Тема: {topic[:300]}",
            )
            if not token:
                await message.answer(
                    "⚠️ Не смог показать карточку подтверждения — ничего не публикую.",
                    parse_mode="HTML",
                )
            return

    # ── Делегирование личному ассистенту (n8n): почта / календарь / контакты ──
    elif dept == "assistant":
        from shared.bot_bus import send_task, get_result

        await message.answer(
            f"📧 <b>Передаю личному ассистенту!</b>\n\n"
            f"📝 Задача: {title}\n\n"
            f"⏳ Ожидайте, n8n обрабатывает (почта / календарь / контакты)...",
            parse_mode="HTML",
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
            },
        )

        result = await get_result(bus_task_id, timeout=120)

        if result and result.get("status") == "done":
            res_data = result.get("result", {})
            await message.answer(
                f"✅ <b>Готово!</b>\n\n📋 {res_data.get('message', 'Выполнено')}",
                parse_mode="HTML",
            )
        elif result and result.get("status") == "error":
            await message.answer(
                f"❌ <b>Ошибка:</b> {result.get('error', 'Неизвестная ошибка')}",
                parse_mode="HTML",
            )
        else:
            await message.answer(
                "⏰ Ассистент ещё обрабатывает. Результат появится в чате.",
                parse_mode="HTML",
            )
        return

    # ── Делегирование через Bot Bus для других отделов ──
    elif dept in ("sales", "finance", "hr", "analytics", "marketing", "support", "pm"):
        dept_to_bot = {
            "sales": "sales_bot",
            "finance": "finance_bot",
            "hr": "hr_bot",
            "analytics": "analytics_bot",
            "marketing": "marketing_bot",
            "support": "support_bot",
            "pm": "stepan_bot",
        }
        dept_actions = {
            "sales": {
                "заказ": "get_orders",
                "заказы": "get_orders",
                "orders": "get_orders",
                "клиент": "get_clients",
                "clients": "get_clients",
            },
            "finance": {
                "баланс": "get_balance",
                "p&l": "get_balance",
                "пнл": "get_balance",
                "расход": "add_expense",
                "expense": "add_expense",
            },
            "hr": {
                "сотрудник": "get_employees",
                "employees": "get_employees",
                "команд": "get_employees",
                "штат": "get_employees",
            },
            "analytics": {
                "отчёт": "get_report",
                "отчет": "get_report",
                "report": "get_report",
                "kpi": "get_report",
                "instagram": "get_instagram_stats",
                "инстаграм": "get_instagram_stats",
            },
            "marketing": {
                "рассылк": "send_broadcast",
                "broadcast": "send_broadcast",
                "кампани": "send_broadcast",
            },
            "support": {
                "жалоб": "handle_complaint",
                "complaint": "handle_complaint",
                "dm": "check_instagram_dm",
                "директ": "check_instagram_dm",
            },
            "pm": {  # pm = Степан (задачи/производство)
                "задач": "get_tasks",
                "tasks": "get_tasks",
                "дедлайн": "get_deadlines",
                "deadline": "get_deadlines",
                "срок": "get_deadlines",
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
                "sales": "🛒",
                "finance": "💰",
                "hr": "👥",
                "analytics": "📊",
                "marketing": "📢",
                "support": "🎧",
                "pm": "🤖",  # pm = Степан
            }
            icon = dept_icons.get(dept, "📌")

            await message.answer(
                f"{icon} <b>Передаю в отдел {dept}!</b>\n\n"
                f"⚡ Действие: {action}\n"
                f"📝 Тема: {title}\n\n"
                f"⏳ Ожидайте, {bot_name} обрабатывает...",
                parse_mode="HTML",
            )

            bus_task_id = await send_task(
                from_bot="stepan_bot",
                to_bot=bot_name,
                action=action,
                params={
                    "topic": description or title,
                    "title": title,
                    "description": description,
                },
            )

            result = await get_result(bus_task_id, timeout=120)

            if result and result.get("status") == "done":
                res_data = result.get("result", {})
                await message.answer(
                    f"✅ <b>{bot_name} выполнил задачу!</b>\n\n"
                    f"📋 {res_data.get('message', 'Готово')}",
                    parse_mode="HTML",
                )
            elif result and result.get("status") == "error":
                await message.answer(
                    f"❌ <b>Ошибка:</b> {result.get('error', 'Неизвестная ошибка')}",
                    parse_mode="HTML",
                )
            else:
                await message.answer(
                    f"⏰ {bot_name} ещё работает. Результат появится в чате.",
                    parse_mode="HTML",
                )
            return

    # Тот же заголовок в тот же отдел час назад — это повтор, а не вторая
    # задача. Владелец переспрашивает голосом по нескольку раз, и каждый
    # переспрос заводил новую строку; разобрать их потом было нечем.
    twin_id = await tasks_repo.find_recent_duplicate(title, dept)
    if twin_id:
        await message.answer(
            f"📋 Такая задача уже есть — <b>#{twin_id}</b> в отделе {dept}. "
            f"Новую не завожу, чтобы не плодить дубли."
        )
        return

    # Сохраняем в БД
    try:
        from datetime import datetime

        parsed_deadline = None
        if (
            deadline
            and isinstance(deadline, str)
            and deadline.lower() not in ("null", "none")
        ):
            try:
                parsed_deadline = datetime.strptime(deadline, "%Y-%m-%d").date()
            except ValueError:
                pass

        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "INSERT INTO tasks (title, assignee, department, status, priority, deadline, description) "
                    "VALUES (:p1, :p2, :p3, 'todo', :p4, :p5, :p6) RETURNING id"
                ),
                {
                    "p1": title,
                    "p2": assignee,
                    "p3": dept,
                    "p4": priority,
                    "p5": parsed_deadline,
                    "p6": description,
                },
            )
            task_id = res.scalar()
            await session.commit()
    except Exception as e:
        logger.error(f"Task creation error: {e}")
        safe_e = str(e).replace("<", "&lt;").replace(">", "&gt;")
        await message.answer(
            f"❌ Ошибка при создании задачи: {safe_e}", parse_mode="HTML"
        )
        return

    # Публикуем событие
    try:
        await event_bus.publish(
            "TASK_CREATED",
            {
                "task_id": task_id,
                "title": title,
                "department": dept,
                "priority": priority,
                "assignee": assignee,
                "description": description,
                "chat_id": message.chat.id,
            },
        )
    except Exception:
        pass

    dept_icons = {
        "sales": "🛒",
        "marketing": "📢",
        "support": "🎧",
        "hr": "👥",
        "finance": "💰",
        "pm": "🤖",  # pm = Степан
        "analytics": "📊",
        "content": "✍️",
        "qa": "🔬",
        "rnd": "🧬",
        "devops": "🛠",
    }
    pri_icons = {"urgent": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Выполнено", callback_data=f"stp:done:{task_id}"
                ),
                InlineKeyboardButton(
                    text="❌ Отменить", callback_data=f"stp:cancel:{task_id}"
                ),
            ],
            [
                InlineKeyboardButton(
                    text="🗑 Удалить", callback_data=f"stp:del:ask:{task_id}"
                ),
            ],
        ]
    )

    await message.answer(
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

    # Здесь была попытка запомнить message_id/chat_id карточки задачи:
    #   UPDATE tasks SET message_id = :mid, chat_id = :cid WHERE id = :tid
    # В таблице `tasks` таких колонок нет (см. database/init.sql), поэтому запрос
    # падал при КАЖДОЙ созданной задаче и уходил в logger.error. Прочитать эти
    # значения всё равно было некому — ни один обработчик к ним не обращался.
    # Если понадобится обновлять карточку по месту (например, вычёркивать
    # выполненную), добавьте обе колонки в схему и вернитесь к этой мысли.


# _query_db и _generate_report удалены. Оба были рукописными SQL-отчётами по
# фиксированному списку видов запроса, и оба дублировали инструменты офиса:
# get_business_summary, get_finance_summary, get_pnl, top_products, get_tasks,
# build_report. Одноимённые объявления на витрине были заглушками, которые
# отвечали «используйте get_business_summary», — теперь их нет и там.

# ── Подтверждение изменяющих действий витрины ────────────────────────────
# Заявка живёт в общем хранилище (shared/approvals, Redis, 15 минут), а не в
# словаре процесса: раньше перезапуск бота между показом карточки и нажатием
# кнопки превращал «Выполнить» в «карточка устарела».
#
# Подписанный токен витрины кладётся в payload заявки: в callback_data он не
# помещается (там 64 байта), да и подпись проверяет всё равно витрина.


async def _confirm_storefront_write(payload: dict, cb: CallbackQuery) -> str:
    """Владелец одобрил — отправляем подписанный токен витрине."""
    from shared.stepan_tools import confirm_remote

    res = await confirm_remote(payload["token"])
    if res.get("ok"):
        return res.get("message") or "Выполнено."
    return f"Не выполнено: {res.get('error', 'витрина отказала')}"


approvals.register_handler("storefront_write", _confirm_storefront_write)


async def _confirm_content_publish(payload: dict, cb: CallbackQuery) -> str:
    """Владелец одобрил — только теперь просим отдел контента опубликовать."""
    from shared.bot_bus import get_result, send_task

    bus_task_id = await send_task(
        from_bot="stepan_bot",
        to_bot="content_bot",
        action=payload["action"],
        params={"topic": payload["topic"]},
    )
    result = await get_result(bus_task_id, timeout=120)

    if result and result.get("status") == "done":
        return (result.get("result") or {}).get("message") or "Опубликовано."
    if result and result.get("status") == "error":
        return f"Не опубликовано: {result.get('error', 'отдел контента отказал')}"
    # Молчание шины — не отказ: задача могла уйти в работу и завершиться позже.
    return "Отдел контента ещё работает — результат придёт в чат."


approvals.register_handler("content_publish", _confirm_content_publish)


async def _offer_write_action(message: Message, proposal: dict, tool_name: str = "") -> None:
    """Показать карточку «было → стало» с кнопками подтверждения.

    `tool_name` кладётся в заявку не ради исполнения (его знает подписанный
    токен витрины), а ради ссылки «Открыть в админке»: без имени инструмента
    заявка не знает, на какой экран вести, и кнопка уводила бы в общую очередь
    вместо цены товара или настройки, о которой спрашивают.
    """
    token = proposal.get("token")
    if not token:
        await message.answer(
            "⚠️ Действие не подготовлено: витрина не прислала подтверждение."
        )
        return

    details = ""
    if proposal.get("before") or proposal.get("after"):
        details = (
            f"<i>было:</i> {proposal.get('before') or '—'}\n"
            f"<i>станет:</i> {proposal.get('after') or '—'}"
        )
    if proposal.get("risky"):
        details += "\n⚠️ Действие затрагивает клиентов или публичный аккаунт."

    created = await approvals.request(
        message.bot,
        message.chat.id,
        "storefront_write",
        {"token": token, "tool": tool_name or proposal.get("tool") or ""},
        proposal.get("summary") or "Действие",
        bot_name="Стёпан",
        details=details,
    )
    if not created:
        await message.answer(
            "⚠️ Не смог показать карточку подтверждения — действие НЕ выполнено."
        )


# Отдельного обработчика отказа здесь нет: кнопки ✅/❌ обслуживает
# approvals_router (shared/approvals.py), общий для всех ботов офиса.
