"""Степан (Менеджер) — AI Диспетчер задач.

Принимает произвольный текст задачи, анализирует через AI,
определяет отдел и ответственного, создаёт задачу и контролирует выполнение.
"""

from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton
from sqlalchemy import text
from shared import tasks_repo
from shared.database import get_session_ctx
from shared.ai_engine import AIEngine
from shared.event_bus import event_bus, Events
from shared.utils import simulate_typing
import json
import logging

from shared.prompts import role_prompt

router = Router()
ai = AIEngine()
logger = logging.getLogger(__name__)

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
        InlineKeyboardButton(
            text="✅ Выполнено", callback_data=f"dispatch:done:{task_id}"
        ),
        InlineKeyboardButton(
            text="📝 Отчёт", callback_data=f"dispatch:report:{task_id}"
        ),
    )
    b.row(
        InlineKeyboardButton(
            text="📊 Статус", callback_data=f"dispatch:status:{task_id}"
        ),
        InlineKeyboardButton(
            text="❌ Отменить", callback_data=f"dispatch:cancel:{task_id}"
        ),
    )
    return b.as_markup()


def verify_kb(task_id: int):
    b = InlineKeyboardBuilder()
    b.row(
        InlineKeyboardButton(
            text="✅ Принять", callback_data=f"dispatch:approve:{task_id}"
        ),
        InlineKeyboardButton(
            text="🔄 На доработку", callback_data=f"dispatch:revise:{task_id}"
        ),
    )
    return b.as_markup()


DEPT_EMOJI = {
    "production": "🌱",
    "sales": "🛒",
    "marketing": "📢",
    "finance": "💰",
    "hr": "👥",
    "support": "🎧",
    "content": "✍️",
    "logistics": "🚚",
}

DEPT_NAME = {
    "production": "Производство",
    "sales": "Продажи",
    "marketing": "Маркетинг",
    "finance": "Финансы",
    "hr": "HR",
    "support": "Поддержка",
    "content": "Контент",
    "logistics": "Логистика",
}


# ─── Главный обработчик: текст → задача ─────────────────────


# ─── Отчёт о выполнении ────────────────────────────────────


@router.callback_query(F.data.startswith("dispatch:report:"))
async def request_report(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    await cb.message.answer(
        f"📝 <b>Задача #{task_id}</b>\n\n"
        f"Напишите отчёт о выполнении. AI проверит результат.\n\n"
        f"<i>Начните сообщение с: отчёт {task_id}</i>"
    )
    await cb.answer()


@router.message(F.text.regexp(r"(?i)^отч[её]т\s+\d+\b"))
async def process_report(msg: Message):
    """Получает отчёт по КОНКРЕТНОЙ задаче и показывает мнение модели.

    Здесь было две ошибки сразу, и обе тихие.

    Первая: номер задачи не разбирался вовсе. Кнопка «📝 Отчёт» просит начать
    сообщение с «отчёт {id}», а обработчик брал `LIMIT 1` по «самая срочная,
    самая свежая» — то есть отчёт всегда приписывался чужой задаче. Фильтр при
    этом ловил ЛЮБОЕ сообщение на «отчёт», а роутер диспетчера стоит первым:
    «отчет по продажам за неделю» уходило сюда же. Теперь номер обязателен и
    разбирается регуляркой в самом фильтре — сообщения без номера сюда не
    попадают и достаются обычному ассистенту.

    Вторая: вердикт модели писался в базу как факт. `status == "approved"`
    закрывал задачу и рассылал `TASK_COMPLETED` — при том, что критериев у
    модели почти никогда нет: описания задач хранятся плоским текстом, а не
    JSON, поэтому `steps` пусто, а `verification` — строка по умолчанию.
    Оценка «8/10» выставлялась ни по чему. Теперь это рекомендация с кнопками
    «Принять» / «На доработку», а закрывает задачу человек.
    """
    parts = msg.text.split(maxsplit=2)
    if len(parts) < 3:
        await msg.answer(
            "📝 Формат: <code>отчёт [номер задачи] [текст отчёта]</code>\n"
            "Например: <code>отчёт 42 закупил субстрат, накладная у Азиза</code>"
        )
        return

    task_id = int(parts[1])
    report_text = parts[2]

    async with get_session_ctx() as session:
        result = await session.execute(
            text(
                "SELECT id, title, department, description, status FROM tasks "
                "WHERE id = :tid"
            ),
            {"tid": task_id},
        )
        task = result.fetchone()

    if not task:
        await msg.answer(f"❌ Задачи #{task_id} нет.")
        return
    if task.status in ("done", "cancelled"):
        await msg.answer(
            f"ℹ️ Задача #{task_id} уже закрыта со статусом «{task.status}» — "
            f"отчёт по ней не нужен."
        )
        return

    await simulate_typing(msg, delay=3)

    # Парсим описание задачи
    try:
        desc = json.loads(task.description) if task.description else {}
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("Failed to parse task description JSON: %s", exc)
        desc = {}

    steps = desc.get("steps", [])
    verification = desc.get("verification", "Проверить результат")

    # AI проверяет отчёт
    verify_prompt = VERIFY_PROMPT.format(
        task_title=task.title,
        department=task.department,
        steps=", ".join(steps),
        verification=verification,
        report=report_text,
    )

    try:
        response = await ai.chat_completion(
            role_prompt("Ты контролёр качества. Оцени выполнение задачи строго но справедливо."),
            verify_prompt,
            effort="high",
        )
        response = response.strip()
        if response.startswith("```"):
            response = response.split("```")[1]
            if response.startswith("json"):
                response = response[4:]
        result_data = json.loads(response)
    except Exception as exc:
        logger.warning("Failed to verify task report via AI: %s", exc)
        result_data = {
            "status": "needs_revision",
            "score": 5,
            "feedback": "Не удалось автоматически проверить.",
            "missing": [],
        }

    status = result_data.get("status", "needs_revision")
    score = result_data.get("score", 5)
    feedback = result_data.get("feedback", "")
    missing = result_data.get("missing", [])

    status_emoji = {"approved": "✅", "rejected": "❌", "needs_revision": "🔄"}.get(
        status, "❓"
    )
    status_text = {
        "approved": "ОДОБРЕНО",
        "rejected": "ОТКЛОНЕНО",
        "needs_revision": "НА ДОРАБОТКУ",
    }.get(status, status)

    score_bar = "█" * score + "░" * (10 - score)

    missing_text = ""
    if missing:
        missing_text = "\n\n⚠️ <b>Недоработки:</b>\n" + "\n".join(
            f"  • {m}" for m in missing
        )

    response_msg = (
        f"{status_emoji} <b>Проверка задачи #{task.id}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📌 {task.title}\n\n"
        f"📊 Оценка модели: [{score_bar}] {score}/10\n"
        f"📋 Мнение: <b>{status_text}</b>\n\n"
        f"💬 {feedback}"
        f"{missing_text}\n\n"
        f"<i>Это рекомендация. Задачу закрываете вы.</i>"
    )

    # Кнопки в обоих случаях: «одобрено» моделью — тоже лишь мнение, и
    # закрывает задачу нажатие человека (dispatch:approve → status done).
    await msg.answer(response_msg, reply_markup=verify_kb(task.id))


# ─── Кнопки управления ─────────────────────────────────────


@router.callback_query(F.data.startswith("dispatch:done:"))
async def mark_done(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    await tasks_repo.set_status(task_id, "done")
    await event_bus.publish(
        Events.TASK_COMPLETED, {"task_id": task_id}, source_bot="stepan_bot"
    )
    await cb.message.edit_text(
        cb.message.text + "\n\n✅ <b>ВЫПОЛНЕНО</b>", reply_markup=None
    )
    await cb.answer("✅ Задача закрыта!")


@router.callback_query(F.data.startswith("dispatch:status:"))
async def check_status(cb: CallbackQuery):
    """Показать все активные задачи."""
    async with get_session_ctx() as session:
        result = await session.execute(
            text(
                "SELECT id, title, department, status, priority, deadline "
                "FROM tasks WHERE status IN ('todo', 'in_progress') "
                "ORDER BY CASE priority "
                "WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
                "WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 10"
            )
        )
        tasks = result.fetchall()

    if not tasks:
        await cb.message.answer("🎉 Все задачи выполнены!")
        await cb.answer()
        return

    lines = ["📊 <b>Активные задачи</b>\n━━━━━━━━━━━━━━━━━━━━━\n"]
    for t in tasks:
        emoji = DEPT_EMOJI.get(t.department, "📋")
        p_emoji = {"urgent": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}.get(
            t.priority, "⚪"
        )
        s_emoji = {"todo": "⬜", "in_progress": "🔷"}.get(t.status, "⬜")
        dl = f" (до {t.deadline})" if t.deadline else ""
        lines.append(f"{s_emoji} #{t.id} {p_emoji} {emoji} {t.title}{dl}")

    await cb.message.answer("\n".join(lines))
    await cb.answer()


@router.callback_query(F.data.startswith("dispatch:cancel:"))
async def cancel_task(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    await tasks_repo.set_status(task_id, "cancelled")
    await cb.message.edit_text(
        cb.message.text + "\n\n❌ <b>ОТМЕНЕНО</b>", reply_markup=None
    )
    await cb.answer("❌ Задача отменена")


@router.callback_query(F.data.startswith("dispatch:approve:"))
async def approve_task(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    await tasks_repo.set_status(task_id, "done")
    # Событие уходит отсюда: раньше его публиковал автоматический вердикт
    # модели, а теперь задачу закрывает человек — и подписчики должны узнать
    # именно об этом моменте.
    await event_bus.publish(
        Events.TASK_COMPLETED,
        {"task_id": task_id},
        source_bot="stepan_bot",
    )
    await cb.message.edit_text(
        cb.message.text + "\n\n✅ <b>ПРИНЯТО</b>", reply_markup=None
    )
    await cb.answer("✅ Задача принята!")


@router.callback_query(F.data.startswith("dispatch:revise:"))
async def revise_task(cb: CallbackQuery):
    task_id = int(cb.data.split(":")[-1])
    await tasks_repo.set_status(task_id, "in_progress")
    await cb.message.edit_text(
        cb.message.text + "\n\n🔄 <b>НА ДОРАБОТКУ</b>", reply_markup=None
    )
    await cb.answer("🔄 Отправлено на доработку")
