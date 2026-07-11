"""Степан (Менеджер) — AI Диспетчер задач.

Принимает произвольный текст задачи, анализирует через AI,
определяет отдел и ответственного, создаёт задачу и контролирует выполнение.
"""
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.ai_engine import AIEngine
from shared.event_bus import event_bus, Events
from shared.utils import simulate_typing
import json
import logging

router = Router()
ai = AIEngine()
logger = logging.getLogger(__name__)

# ─── AI классификация задачи ────────────────────────────────

from shared.prompts import TEAM_CONTEXT

CLASSIFIER_PROMPT = f"""{TEAM_CONTEXT}
Ты — Операционный Директор (COO) и главный диспетчер задач.
Проанализируй задачу и верни JSON:
{{
  "department": "production|sales|marketing|finance|hr|support|content|logistics",
  "priority": "urgent|high|medium|low",
  "assignee": "кому назначить (роль)",
  "title": "краткое название задачи (до 100 символов)",
  "steps": ["шаг 1", "шаг 2", "шаг 3"],
  "deadline_days": число_дней_на_выполнение,
  "verification": "как проверить результат"
}}

Отделы (выбери один из существующих ботов/отделов компании):
- production: выращивание, посев, сбор урожая, полив, субстрат
- sales: продажи, клиенты, заказы, B2B, звонки
- marketing: реклама, SMM, Instagram, Telegram, акции, рассылки
- finance: бюджет, расходы, доходы, зарплата, налоги
- hr: сотрудники, найм, обучение, табель, отпуск
- support: жалобы, возвраты, обслуживание клиентов
- content: посты, фото, видео, рецепты, описания
- logistics: доставка, упаковка, склад, курьеры

Верни ТОЛЬКО JSON, без markdown и пояснений."""


VERIFY_PROMPT = """Ты — Операционный Директор в Microgreen Uzbekistan.
Проверь отчёт о выполнении задачи:

Задача: {task_title}
Отдел: {department}
Шаги: {steps}
Критерий проверки: {verification}

Отчёт исполнителя: {report}

Оцени выполнение и верни JSON:
{{
  "status": "approved|rejected|needs_revision",
  "score": число_от_1_до_10,
  "feedback": "подробный комментарий",
  "missing": ["что не сделано или сделано неправильно"]
}}

Верни ТОЛЬКО JSON."""


# ─── Клавиатуры ─────────────────────────────────────────────

def task_actions_kb(task_id: int):
    b = InlineKeyboardBuilder()
    b.row(
        InlineKeyboardButton(text="✅ Выполнено", callback_data=f"dispatch:done:{task_id}"),
        InlineKeyboardButton(text="📝 Отчёт", callback_data=f"dispatch:report:{task_id}")
    )
    b.row(
        InlineKeyboardButton(text="📊 Статус", callback_data=f"dispatch:status:{task_id}"),
        InlineKeyboardButton(text="❌ Отменить", callback_data=f"dispatch:cancel:{task_id}")
    )
    return b.as_markup()


def verify_kb(task_id: int):
    b = InlineKeyboardBuilder()
    b.row(
        InlineKeyboardButton(text="✅ Принять", callback_data=f"dispatch:approve:{task_id}"),
        InlineKeyboardButton(text="🔄 На доработку", callback_data=f"dispatch:revise:{task_id}")
    )
    return b.as_markup()


DEPT_EMOJI = {
    "production": "🌱", "sales": "🛒", "marketing": "📢",
    "finance": "💰", "hr": "👥", "support": "🎧",
    "content": "✍️", "logistics": "🚚"
}

DEPT_NAME = {
    "production": "Производство", "sales": "Продажи", "marketing": "Маркетинг",
    "finance": "Финансы", "hr": "HR", "support": "Поддержка",
    "content": "Контент", "logistics": "Логистика"
}


# ─── Главный обработчик: текст → задача ─────────────────────


# ─── Отчёт о выполнении ────────────────────────────────────

@router.callback_query(F.data.startswith("dispatch:report:"))
async def request_report(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    await cb.message.answer(
        f"📝 <b>Задача #{task_id}</b>\n\n"
        f"Напишите отчёт о выполнении. AI проверит результат.\n\n"
        f"<i>Начните сообщение с: отчёт {task_id}</i>")
    await cb.answer()


@router.message(F.text.lower().startswith("отчёт") | F.text.lower().startswith("отчет"))
async def process_report(msg: Message):
    """Получает отчёт и проверяет через AI."""
    parts = msg.text.split(maxsplit=1)
    if len(parts) < 2:
        await msg.answer("📝 Формат: <code>отчёт [текст отчёта]</code>")
        return

    report_text = parts[1]

    # Находим последнюю незакрытую задачу
    async with get_session_ctx() as session:
        result = await session.execute(text(
            "SELECT id, title, department, description FROM tasks "
            "WHERE status IN ('todo', 'in_progress') "
            "ORDER BY priority = 'urgent' DESC, created_at DESC LIMIT 1"))
        task = result.fetchone()

    if not task:
        await msg.answer("❌ Нет активных задач для отчёта.")
        return

    await simulate_typing(msg, delay=3)

    # Парсим описание задачи
    try:
        desc = json.loads(task.description) if task.description else {}
    except:
        desc = {}

    steps = desc.get("steps", [])
    verification = desc.get("verification", "Проверить результат")

    # AI проверяет отчёт
    verify_prompt = VERIFY_PROMPT.format(
        task_title=task.title,
        department=task.department,
        steps=", ".join(steps),
        verification=verification,
        report=report_text
    )

    try:
        response = await ai.chat_completion(
            "Ты контролёр качества. Оцени выполнение задачи строго но справедливо.",
            verify_prompt
        )
        response = response.strip()
        if response.startswith("```"):
            response = response.split("```")[1]
            if response.startswith("json"):
                response = response[4:]
        result_data = json.loads(response)
    except:
        result_data = {"status": "needs_revision", "score": 5, "feedback": "Не удалось автоматически проверить.", "missing": []}

    status = result_data.get("status", "needs_revision")
    score = result_data.get("score", 5)
    feedback = result_data.get("feedback", "")
    missing = result_data.get("missing", [])

    status_emoji = {"approved": "✅", "rejected": "❌", "needs_revision": "🔄"}.get(status, "❓")
    status_text = {"approved": "ОДОБРЕНО", "rejected": "ОТКЛОНЕНО", "needs_revision": "НА ДОРАБОТКУ"}.get(status, status)

    score_bar = "█" * score + "░" * (10 - score)

    missing_text = ""
    if missing:
        missing_text = "\n\n⚠️ <b>Недоработки:</b>\n" + "\n".join(f"  • {m}" for m in missing)

    response_msg = (
        f"{status_emoji} <b>Проверка задачи #{task.id}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📌 {task.title}\n\n"
        f"📊 Оценка: [{score_bar}] {score}/10\n"
        f"📋 Статус: <b>{status_text}</b>\n\n"
        f"💬 {feedback}"
        f"{missing_text}"
    )

    if status == "approved":
        # Задача выполнена!
        async with get_session_ctx() as session:
            await session.execute(text(
                "UPDATE tasks SET status = 'done' WHERE id = :id"), {"id": task.id})
        await event_bus.publish(Events.TASK_COMPLETED, {
            "task_id": task.id, "title": task.title, "score": score
        }, source_bot="stepan_bot")
        await msg.answer(response_msg)
    else:
        await msg.answer(response_msg, reply_markup=verify_kb(task.id))


# ─── Кнопки управления ─────────────────────────────────────

@router.callback_query(F.data.startswith("dispatch:done:"))
async def mark_done(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    async with get_session_ctx() as session:
        await session.execute(text(
            "UPDATE tasks SET status = 'done' WHERE id = :id"), {"id": task_id})
    await event_bus.publish(Events.TASK_COMPLETED, {
        "task_id": task_id
    }, source_bot="stepan_bot")
    await cb.message.edit_text(
        cb.message.text + "\n\n✅ <b>ВЫПОЛНЕНО</b>", reply_markup=None)
    await cb.answer("✅ Задача закрыта!")


@router.callback_query(F.data.startswith("dispatch:status:"))
async def check_status(cb: CallbackQuery):
    """Показать все активные задачи."""
    async with get_session_ctx() as session:
        result = await session.execute(text(
            "SELECT id, title, department, status, priority, deadline "
            "FROM tasks WHERE status IN ('todo', 'in_progress') "
            "ORDER BY CASE priority "
            "WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
            "WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 10"))
        tasks = result.fetchall()

    if not tasks:
        await cb.message.answer("🎉 Все задачи выполнены!")
        await cb.answer()
        return

    lines = ["📊 <b>Активные задачи</b>\n━━━━━━━━━━━━━━━━━━━━━\n"]
    for t in tasks:
        emoji = DEPT_EMOJI.get(t.department, "📋")
        p_emoji = {"urgent": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}.get(t.priority, "⚪")
        s_emoji = {"todo": "⬜", "in_progress": "🔷"}.get(t.status, "⬜")
        dl = f" (до {t.deadline})" if t.deadline else ""
        lines.append(f"{s_emoji} #{t.id} {p_emoji} {emoji} {t.title}{dl}")

    await cb.message.answer("\n".join(lines))
    await cb.answer()


@router.callback_query(F.data.startswith("dispatch:cancel:"))
async def cancel_task(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    async with get_session_ctx() as session:
        await session.execute(text(
            "UPDATE tasks SET status = 'cancelled' WHERE id = :id"), {"id": task_id})
    await cb.message.edit_text(
        cb.message.text + "\n\n❌ <b>ОТМЕНЕНО</b>", reply_markup=None)
    await cb.answer("❌ Задача отменена")


@router.callback_query(F.data.startswith("dispatch:approve:"))
async def approve_task(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    async with get_session_ctx() as session:
        await session.execute(text(
            "UPDATE tasks SET status = 'done' WHERE id = :id"), {"id": task_id})
    await cb.message.edit_text(
        cb.message.text + "\n\n✅ <b>ПРИНЯТО</b>", reply_markup=None)
    await cb.answer("✅ Задача принята!")


@router.callback_query(F.data.startswith("dispatch:revise:"))
async def revise_task(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    async with get_session_ctx() as session:
        await session.execute(text(
            "UPDATE tasks SET status = 'in_progress' WHERE id = :id"), {"id": task_id})
    await cb.message.edit_text(
        cb.message.text + "\n\n🔄 <b>НА ДОРАБОТКУ</b>", reply_markup=None)
    await cb.answer("🔄 Отправлено на доработку")
