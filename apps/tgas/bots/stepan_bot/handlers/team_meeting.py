import typing
"""
🧠 СОВЕЩАНИЕ ОТДЕЛОВ — Multi-agent «круглый стол»
===================================================
Когда руководитель задаёт стратегический / кросс-функциональный вопрос
(«почему нет продаж, дай решение»), Менеджер (Степан) НЕ раздаёт 3 отдельные
задачи, а собирает совещание:

  1. AI-роутер выбирает, каким отделам поручить разбор (по их компетенциям).
  2. Раунд 1 — каждый отдел высказывает позицию по своей зоне, видя реплики коллег.
  3. Раунд 2 (дебаты) — отделы находят слабые места в аргументах друг друга и
     двигаются к ЕДИНОМУ решению.
  4. Менеджер сводит всё в одно решение (или задаёт руководителю уточняющие вопросы).

Каждая реплика отдела публикуется в группе ПОД ИМЕНЕМ ЭТОГО ОТДЕЛА — Менеджер
отправляет её через токен соответствующего бота (sales_bot, analytics_bot и т.д.),
поэтому в чате она выглядит как сообщение «Microgreen | Аналитика» и пр., но вся
оркестрация идёт в одном надёжном процессе.
"""

import asyncio
import html
import json
import logging
import re
import uuid

from aiogram import Bot, Router, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from sqlalchemy import text

from shared.config import settings
from shared.database import get_session_ctx
from shared.ai_engine import AIEngine
from shared.prompts import TEAM_CONTEXT
from shared.utils import format_price, collapsible

logger = logging.getLogger(__name__)
ai = AIEngine()

# Роутер для кнопок/реплаев совещания (подключается в handlers/__init__.py)
meeting_router = Router()

# Незакрытые совещания, ожидающие участия владельца:
#   token -> {"question": str, "transcript": str, "msg_id": int, "chat_id": int}
PENDING: dict = {}

# Последнее принятое решение по чату (кэш поверх БД):
#   chat_id -> {"question": str, "plan": str, "executed": bool, "tasks": [...]}
LAST_DECISION: dict = {}
_STATE_TABLE_READY = False


# ── Персист решений в БД (переживает рестарт/деплой Менеджера) ──────────────
async def _ensure_state_table() -> None:
    # Таблица meeting_state управляется Prisma (schema.prisma).
    # CREATE TABLE IF NOT EXISTS больше не нужен.
    global _STATE_TABLE_READY
    _STATE_TABLE_READY = True


async def save_decision(chat_id: int, decision: dict) -> None:
    LAST_DECISION[chat_id] = decision
    await _ensure_state_table()
    try:
        async with get_session_ctx() as s:
            await s.execute(
                text(
                    "INSERT INTO meeting_state (chat_id, payload, updated_at) "
                    "VALUES (:cid, CAST(:pl AS JSONB), NOW()) "
                    "ON CONFLICT (chat_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()"
                ),
                {"cid": chat_id, "pl": json.dumps(decision, ensure_ascii=False)},
            )
            await s.commit()
    except Exception as e:
        logger.warning(f"save_decision: {e}")


async def load_decision(chat_id: int) -> dict:
    if chat_id in LAST_DECISION:
        return LAST_DECISION[chat_id]
    await _ensure_state_table()
    try:
        async with get_session_ctx() as s:
            res = await s.execute(
                text("SELECT payload FROM meeting_state WHERE chat_id = :cid"),
                {"cid": chat_id},
            )
            row = res.fetchone()
        if row and row[0]:
            payload = row[0] if isinstance(row[0]) else json.loads(row[0])
            LAST_DECISION[chat_id] = payload
            return payload
    except Exception as e:
        logger.warning(f"load_decision: {e}")
    return None


async def clear_decision(chat_id: int) -> None:
    LAST_DECISION.pop(chat_id, None)
    try:
        async with get_session_ctx() as s:
            await s.execute(
                text("DELETE FROM meeting_state WHERE chat_id = :cid"), {"cid": chat_id}
            )
            await s.commit()
    except Exception as e:
        logger.warning(f"clear_decision: {e}")


# Запрос статуса плана: «статус / что по плану / прогресс»
_STATUS_TRIGGERS = [
    "статус план",
    "что по план",
    "прогресс",
    "как дела с план",
    "статус задач",
    "что с планом",
    "статус по план",
    "как план",
]


def is_status_request(low_text: str) -> bool:
    t = low_text.strip()
    if len(t) > 60:
        return False
    return any(w in t for w in _STATUS_TRIGGERS)


# ─────────────────────────────────────────────────────────────────────────────
# Реестр отделов-участников. token — имя поля в settings с токеном бота отдела.
# ─────────────────────────────────────────────────────────────────────────────
DEPARTMENTS = {
    "sales": {
        "name": "Отдел продаж",
        "emoji": "🛒",
        "token": "sales_bot_token",
        "role": (
            "Ты — Коммерческий директор Microgreen Uzbekistan. Твоя зона: продажи, "
            "конверсия лидов, воронка, работа с возражениями, B2B/B2C, дожим сделок, "
            "средний чек, повторные продажи, складской учёт готовой продукции."
        ),
    },
    "marketing": {
        "name": "Отдел маркетинга",
        "emoji": "📢",
        "token": "marketing_bot_token",
        "role": (
            "Ты — Директор по маркетингу (CMO). Твоя зона: трафик и лидогенерация, "
            "рекламные каналы, LTV/CAC, окупаемость кампаний, возврат ушедших клиентов, "
            "позиционирование, акции."
        ),
    },
    "finance": {
        "name": "Финансовый отдел",
        "emoji": "💰",
        "token": "finance_bot_token",
        "role": (
            "Ты — Финансовый директор (CFO). Твоя зона: P&L, cash flow, маржа, "
            "себестоимость, дебиторка, бюджет, окупаемость маркетинга (ROI/CAC), "
            "кассовые разрывы, приоритизация расходов."
        ),
    },
    "analytics": {
        "name": "Отдел аналитики",
        "emoji": "📊",
        "token": "analytics_bot_token",
        "role": (
            "Ты — Data Scientist. Твоя зона: воронка продаж, когортный анализ, тренды, "
            "гипотезы, поиск скрытых инсайтов в данных, метрики и их интерпретация."
        ),
    },
    "support": {
        "name": "Отдел поддержки",
        "emoji": "🎧",
        "token": "support_bot_token",
        "role": (
            "Ты — Руководитель клиентского сервиса. Твоя зона: жалобы и возражения, "
            "удержание, причины оттока, NPS, лояльность, обратная связь клиентов."
        ),
    },
    "hr": {
        "name": "Отдел кадров (HR)",
        "emoji": "👥",
        "token": "hr_bot_token",
        "role": (
            "Ты — HR-директор. Твоя зона: достаточно ли людей под задачу, мотивация и "
            "KPI сотрудников, найм, нагрузка команды, компетенции."
        ),
    },
    "content": {
        "name": "Отдел контента",
        "emoji": "✍️",
        "token": "content_bot_token",
        "role": (
            "Ты — Главный редактор / бренд-менеджер. Твоя зона: SMM, tone of voice, "
            "органический охват и вовлечённость, экспертный контент о микрозелени."
        ),
    },
    "pm": {
        "name": "Степан (Менеджер)",
        "emoji": "🤖",
        "token": "stepan_bot_token",
        "role": (
            "Ты — Степан, Генеральный Управляющий и Операционный директор (COO). Твоя зона: производственные циклы сити-фермы, "
            "урожайность, себестоимость выращивания, свежесть и скоропорт, логистика, дедлайны."
        ),
    },
}

DEFAULT_PARTICIPANTS = ["sales", "marketing", "analytics", "finance"]

# Слова-триггеры: вопрос требует совещания (кросс-функциональный разбор / решение).
MEETING_TRIGGERS = [
    "совещан",
    "обсуд",
    "между собой",
    "все отделы",
    "всех отдел",
    "командой",
    "дай решение",
    "дайте решение",
    "дай нам решение",
    "дайте нам решение",
    "как выйти",
    "проанализир",
    "проведите анализ",
    "проведи анализ",
    "почему нет прода",
    "почему нету прода",
    "почему мало прода",
    "почему упал",
    "почему падают",
    "почему падает",
    "что делать",
    "что нам делать",
    "выявите",
    "найдите причин",
    "разбери",
    "устройте",
    "соберите",
    "план действий",
    "выработайте",
]


# Бизнес-темы: «почему <тема>?» — тоже повод собрать совещание.
_WHY_TOPICS = [
    "прода",
    "продаж",
    "клиент",
    "заказ",
    "выручк",
    "доход",
    "прибыл",
    "конверс",
    "трафик",
]


def is_meeting_request(low_text: str) -> bool:
    """low_text — уже приведённый к нижнему регистру текст сообщения."""
    if any(t in low_text for t in MEETING_TRIGGERS):
        return True
    # «почему нет заказов», «продажи упали» и т.п.
    if "почему" in low_text and any(w in low_text for w in _WHY_TOPICS):
        return True
    return False


# Команды-исполнения: «делайте / запускайте / утверждаю» — НЕ повод для нового
# анализа. Если есть принятое решение — запускаем его план в работу.
_EXEC_TRIGGERS = [
    # ⚠️ Проверка идёт по ПОДСТРОКЕ, поэтому нужны корни, а не только точные формы:
    # «выполни» ⊄ «выполняй» — из-за этого «Выполняй» раньше не распознавалось вовсе
    # и уходило в общий AI, который выдумывал задачу (вплоть до реальной публикации).
    "делайте",
    "делай",
    "сделайте",
    "выполня",
    "выполни",
    "выполните",
    "исполняй",
    "исполни",
    "запускай",
    "запускайте",
    "запусти",
    "приступай",
    "приступайте",
    "действуй",
    "действуйте",
    "в работу",
    "начинай",
    "начни",
    "поехали",
    "погнали",
    "утверждаю",
    "одобряю план",
    "одобряю",
    "принято",
    "работаем",
    "го делаем",
    "давайте делать",
    "давай делать",
    "делаем",
]


def is_execution_command(low_text: str) -> bool:
    """Короткая команда «выполнять уже принятое решение», а не новый вопрос."""
    t = low_text.strip()
    # Не перехватываем длинные содержательные сообщения — только короткие команды.
    if len(t) > 60:
        return False
    return any(w in t for w in _EXEC_TRIGGERS)


# ── Настройки совещания (из shared.config, с безопасными значениями по умолчанию) ──
def _cfg_rounds() -> int:
    return max(1, int(getattr(settings, "meeting_rounds", 2) or 2))


def _cfg_max_participants() -> int:
    return max(2, int(getattr(settings, "meeting_max_participants", 5) or 5))


def _cfg_min_participants() -> int:
    return max(1, int(getattr(settings, "meeting_min_participants", 2) or 2))


def _participant_pool() -> list:
    """Разрешённый пул отделов (meeting_departments в .env, пусто = все)."""
    raw = (getattr(settings, "meeting_departments", "") or "").strip()
    if not raw:
        return list(DEPARTMENTS.keys())
    pool = [k.strip() for k in raw.split(",") if k.strip() in DEPARTMENTS]
    return pool or list(DEPARTMENTS.keys())


def _cfg_vote_rounds() -> int:
    return max(1, int(getattr(settings, "meeting_max_vote_rounds", 3) or 3))


async def _route_additional(question: str, transcript: str, current: list) -> list:
    """По ходу совещания решает, каких ещё отделов не хватает (затронуты их обязанности)."""
    pool = [k for k in _participant_pool() if k not in current]
    if not pool:
        return []
    max_p = _cfg_max_participants()
    room = max_p - len(current)
    if room <= 0:
        return []
    keys = ", ".join(pool)
    system = (
        f"{TEAM_CONTEXT}\n\nТы — Генеральный управляющий на совещании. По ходу обсуждения реши, "
        f"нужно ли ПОДКЛЮЧИТЬ ещё отделы, чьи обязанности реально затронуты. "
        f"Доступные для подключения: {keys}. Верни ТОЛЬКО JSON-массив ключей (пустой [] — если не нужно). "
        "Добавляй лишь по-настоящему релевантных."
    )
    user = f"Вопрос: {question}\n\nСтенограмма совещания:\n{transcript}"
    try:
        raw = (
            await ai.chat_completion(system, user, temperature=0.2, max_tokens=80)
        ).strip()
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if not m:
            return []
        picked = [k for k in json.loads(m.group(0)) if k in pool]
        seen, out = set(), []
        for k in picked:
            if k not in seen:
                seen.add(k)
                out.append(k)
        return out[:room]
    except Exception as e:
        logger.warning(f"route_additional error: {e}")
        return []


def _is_admin(user_id: int) -> bool:
    return user_id in getattr(settings, "admin_telegram_ids", [])


# ─────────────────────────────────────────────────────────────────────────────
# Сбор реальных данных из БД (общий контекст для всех участников)
# ─────────────────────────────────────────────────────────────────────────────
async def _collect_data() -> str:
    lines = []
    async with get_session_ctx() as session:

        async def q(sql, params=None) -> dict:
            res = await session.execute(text(sql), params or {})
            return res

        # ── Заказы ──
        try:
            r = await q(
                "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders WHERE DATE(created_at)=CURRENT_DATE"
            )
            c, s = r.fetchone()
            lines.append(f"📦 Заказы сегодня: {c} на {format_price(s)}")
            r = await q(
                "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
            )
            c, s = r.fetchone()
            lines.append(f"📦 Заказы за неделю: {c} на {format_price(s)}")
            r = await q(
                "SELECT COUNT(*), COALESCE(SUM(total_amount),0), COALESCE(AVG(total_amount),0) FROM orders WHERE EXTRACT(MONTH FROM created_at)=EXTRACT(MONTH FROM CURRENT_DATE)"
            )
            c, s, a = r.fetchone()
            lines.append(
                f"📦 Заказы за месяц: {c} на {format_price(s)}, средний чек {format_price(a)}"
            )
            r = await q("SELECT COUNT(*) FROM orders WHERE status='new'")
            lines.append(f"⚠️ Необработанных заказов (new): {r.scalar() or 0}")
        except Exception as e:
            logger.warning(f"meeting data (orders): {e}")

        # ── Тренд неделя к неделе ──
        try:
            r = await q(
                "SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
            )
            this_w = r.scalar() or 0
            r = await q(
                "SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '14 days' AND created_at < CURRENT_DATE - INTERVAL '7 days'"
            )
            prev_w = r.scalar() or 0
            trend = "→ без изменений"
            if this_w > prev_w:
                trend = "↑ рост"
            elif this_w < prev_w:
                trend = "↓ падение"
            lines.append(
                f"📈 Динамика заказов: эта неделя {this_w} vs прошлая {prev_w} ({trend})"
            )
        except Exception as e:
            logger.warning(f"meeting data (trend): {e}")

        # ── Клиенты / лиды ──
        try:
            r = await q(
                "SELECT COUNT(*), "
                "SUM(CASE WHEN customer_type='b2b' THEN 1 ELSE 0 END), "
                "SUM(CASE WHEN status='lead' THEN 1 ELSE 0 END) FROM customers"
            )
            total, b2b, leads = r.fetchone()
            r = await q(
                "SELECT COUNT(*) FROM customers WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
            )
            new_c = r.scalar() or 0
            lines.append(
                f"👥 Клиентов всего: {total} (B2B: {b2b or 0}, лидов: {leads or 0}, новых за неделю: {new_c})"
            )
        except Exception as e:
            logger.warning(f"meeting data (customers): {e}")

        # ── Финансы ──
        try:
            r = await q(
                "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0), "
                "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) "
                "FROM finances WHERE EXTRACT(MONTH FROM date)=EXTRACT(MONTH FROM CURRENT_DATE)"
            )
            inc, exp = r.fetchone()
            profit = (inc or 0) - (exp or 0)
            margin = (profit / inc * 100) if inc else 0
            lines.append(
                f"💰 Финансы за месяц: доход {format_price(inc)}, расход {format_price(exp)}, "
                f"прибыль {format_price(profit)} (маржа {margin:.0f}%)"
            )
            r = await q(
                "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders WHERE payment_status='pending'"
            )
            dc, ds = r.fetchone()
            lines.append(
                f"💳 Дебиторка (неоплачено): {dc} заказов на {format_price(ds)}"
            )
        except Exception as e:
            logger.warning(f"meeting data (finance): {e}")

        # ── Топ категорий за месяц ──
        try:
            r = await q(
                "SELECT p.category, COUNT(oi.id), COALESCE(SUM(oi.total_price),0) "
                "FROM order_items oi JOIN products p ON oi.product_id=p.id "
                "JOIN orders o ON oi.order_id=o.id "
                "WHERE EXTRACT(MONTH FROM o.created_at)=EXTRACT(MONTH FROM CURRENT_DATE) "
                "GROUP BY p.category ORDER BY SUM(oi.total_price) DESC LIMIT 3"
            )
            cats = r.fetchall()
            if cats:
                cat_str = "; ".join(f"{c[0]}: {format_price(c[2] or 0)}" for c in cats)
                lines.append(f"📊 Топ категорий (месяц): {cat_str}")
        except Exception as e:
            logger.warning(f"meeting data (categories): {e}")

        # ── Маркетинговая активность ──
        try:
            r = await q(
                "SELECT COUNT(*) FROM interactions WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
            )
            inter = r.scalar() or 0
            lines.append(f"📣 Касаний с клиентами за неделю (interactions): {inter}")
        except Exception as e:
            logger.warning(f"meeting data (interactions): {e}")

        # ── Активные выводы петель обучения (bot_learnings) ──
        try:
            r = await q(
                "SELECT bot, metric, observation, inference FROM bot_learnings WHERE is_active = TRUE ORDER BY applied_at DESC LIMIT 5"
            )
            learn_rows = r.fetchall()
            if learn_rows:
                lines.append(
                    "\n🧠 <b>Активные выводы петель обучения отделов (Feedback Loops):</b>"
                )
                for lr in learn_rows:
                    lines.append(f"  • [{lr[0]} / {lr[1]}]: {lr[2]} → <i>{lr[3]}</i>")
        except Exception as e:
            logger.warning(f"meeting data (learnings): {e}")

        # ── Активные задачи по отделам ──
        try:
            r = await q(
                "SELECT department, COUNT(*) FROM tasks WHERE status IN ('todo','in_progress') "
                "GROUP BY department ORDER BY COUNT(*) DESC"
            )
            rows = r.fetchall()
            if rows:
                t_str = ", ".join(f"{row[0] or 'общие'}: {row[1]}" for row in rows)
                lines.append(f"📋 Активные задачи по отделам: {t_str}")
        except Exception as e:
            logger.warning(f"meeting data (tasks): {e}")

    return "\n".join(lines) if lines else "Данные из базы временно недоступны."


# ─────────────────────────────────────────────────────────────────────────────
# AI-роутер: какие отделы участвуют
# ─────────────────────────────────────────────────────────────────────────────
async def _route_departments(question: str, data: str) -> list:
    pool = _participant_pool()
    max_p = _cfg_max_participants()
    min_p = min(_cfg_min_participants(), len(pool))
    keys = ", ".join(pool)
    system = (
        f"{TEAM_CONTEXT}\n\nТы — Генеральный управляющий. По вопросу руководителя реши, "
        f"каким отделам поручить разбор. Доступные ключи отделов: {keys}. "
        f"Выбирай только реально релевантные ({min_p}–{max_p} отделов), самый профильный первым. "
        'Верни ТОЛЬКО JSON-массив ключей, например: ["sales","marketing","analytics"].'
    )
    user = f"Вопрос руководителя: {question}\n\nКраткие данные компании:\n{data}"
    try:
        raw = await ai.chat_completion(system, user, temperature=0.2, max_tokens=100)
        raw = raw.strip()
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            picked = json.loads(m.group(0))
            # только из разрешённого пула, без дубликатов, с ограничением по максимуму
            seen, result = set(), []
            for k in picked:
                if k in pool and k not in seen:
                    seen.add(k)
                    result.append(k)
            if len(result) >= min_p:
                return result[:max_p]
    except Exception as e:
        logger.warning(f"meeting router error: {e}")
    # запасной вариант — пересечение дефолта с пулом
    fallback = [k for k in DEFAULT_PARTICIPANTS if k in pool] or pool
    return fallback[:max_p]


# ─────────────────────────────────────────────────────────────────────────────
# Реплика одного отдела
# ─────────────────────────────────────────────────────────────────────────────
async def _agent_statement(
    dept_key: str, question: str, data: str, transcript: str, round_no: int
) -> str:
    dept = DEPARTMENTS[dept_key]
    system = (
        f"{TEAM_CONTEXT}\n\n{dept['role']}\n\n"
        "Ты на совещании отделов компании. Говори живо, от первого лица, как реальный "
        "руководитель отдела на планёрке. Опирайся на конкретные цифры из данных. "
        "2–4 предложения, без markdown, без JSON, без приветствий."
    )
    if round_no == 1:
        user = (
            f"Вопрос руководителя: {question}\n\n"
            f"Данные компании:\n{data}\n\n"
            f"Что уже сказали коллеги на совещании:\n{transcript or '— ты выступаешь первым —'}\n\n"
            "Выскажи свою позицию по своей зоне ответственности. Если видишь, что коллега "
            "упускает важное или ошибается — тактично возрази по существу."
        )
    else:
        user = (
            f"Вопрос руководителя: {question}\n\n"
            f"Стенограмма совещания:\n{transcript}\n\n"
            "РАУНД ДЕБАТОВ. Сделай три вещи кратко: (1) укажи слабое место или пробел в "
            "аргументах хотя бы одного коллеги — назови отдел; (2) добавь, что все упустили; "
            "(3) предложи свою часть ЕДИНОГО решения. 2–4 предложения."
        )
    try:
        return (
            await ai.chat_completion(system, user, temperature=0.7, max_tokens=320)
        ).strip()
    except Exception as e:
        logger.warning(f"agent {dept_key} statement error: {e}")
        return "(нет связи с отделом)"


# ─────────────────────────────────────────────────────────────────────────────
# Финальный синтез от Менеджера
# ─────────────────────────────────────────────────────────────────────────────
async def _manager_synthesis(
    question: str, transcript: str, force_decision: bool = False
) -> tuple:
    """Возвращает (needs_owner: bool, text: str)."""
    system = (
        f"{TEAM_CONTEXT}\n\nТы — Степан, Генеральный управляющий Microgreen Uzbekistan. "
        "Ты собрал директоров на совещание и должен принести владельцу ГОТОВОЕ решение."
    )
    if force_decision:
        owner_rule = (
            "Владелец доверил команде решить самостоятельно. Прими лучшее решение при разумных "
            "допущениях (явно назови допущения). Начни ответ ровно со слова DECISION на первой строке."
        )
    else:
        owner_rule = (
            "На первой строке ответа поставь ровно одно слово-маркер: "
            "NEEDS_OWNER — если для честного вывода критически не хватает данных ИЛИ нужно "
            "управленческое решение владельца (бюджет, приоритеты, риски); "
            "DECISION — если команда готова дать решение сама.\n"
            "Если NEEDS_OWNER — со следующих строк задай владельцу 2–3 конкретных вопроса "
            "(начни блок с '❓ Нужно ваше участие:') и кратко поясни, почему без этого нельзя."
        )
    user = (
        f'Вопрос руководителя: "{question}"\n\n'
        f"Полная стенограмма совещания директоров:\n{transcript}\n\n"
        f"{owner_rule}\n\n"
        "Когда даёшь решение (DECISION), используй формат:\n"
        "🎯 Корень проблемы\n"
        "📌 План действий (3–5 пунктов, каждый: отдел — конкретное действие — срок)\n"
        "📈 Ожидаемый результат\n\n"
        "Пиши уверенно и по делу, без markdown-заголовков решёткой, без JSON."
    )
    try:
        raw = (
            await ai.chat_completion(system, user, temperature=0.5, max_tokens=700)
        ).strip()
    except Exception as e:
        logger.warning(f"manager synthesis error: {e}")
        return (
            False,
            "Не удалось свести совещание в решение. Попробуйте переформулировать вопрос.",
        )

    needs_owner = False
    # снимаем маркер с первой строки
    first, _, rest = raw.partition("\n")
    marker = first.strip().upper().strip(":*")
    if marker.startswith("NEEDS_OWNER"):
        needs_owner = True
        raw = (
            rest.strip()
            or "❓ Нужно ваше участие: уточните детали, чтобы команда завершила решение."
        )
    elif marker.startswith("DECISION"):
        raw = rest.strip() or raw
    return (needs_owner and not force_decision), raw


# ─────────────────────────────────────────────────────────────────────────────
# Голос отдела по предложенному решению (ЗА / ПРОТИВ / ВОЗДЕРЖУСЬ)
# ─────────────────────────────────────────────────────────────────────────────
async def _agent_vote(dept_key: str, question: str, proposal: str) -> tuple:
    dept = DEPARTMENTS[dept_key]
    system = (
        f"{TEAM_CONTEXT}\n\n{dept['role']}\n\n"
        "Идёт открытое голосование по предложенному решению. Голосуй СТРОГО со своей позиции и "
        "имей НЕЗАВИСИМОЕ мнение — не подстраивайся под других, оценивай пользу для своей зоны и "
        "компании. Если решение вредит твоей зоне или не проработано — голосуй ПРОТИВ. "
        "Ответь СТРОГО так: первое слово — ЗА, ПРОТИВ или ВОЗДЕРЖУСЬ; затем одно короткое "
        "предложение-обоснование. Без markdown."
    )
    user = f"Вопрос: {question}\n\nПредложенное решение:\n{proposal}\n\nТвой голос?"
    try:
        raw = (
            await ai.chat_completion(system, user, temperature=0.4, max_tokens=120)
        ).strip()
    except Exception:
        raw = "ВОЗДЕРЖУСЬ — нет данных для оценки."
    up = raw.upper()
    if up.startswith("ПРОТИВ"):
        v = "ПРОТИВ"
    elif up.startswith("ВОЗДЕРЖ"):
        v = "ВОЗДЕРЖ"
    elif up.startswith("ЗА"):
        v = "ЗА"
    else:
        v = (
            "ПРОТИВ"
            if "ПРОТИВ" in up[:12]
            else ("ВОЗДЕРЖ" if "ВОЗДЕРЖ" in up[:12] else "ЗА")
        )
    parts = raw.split(maxsplit=1)
    reason = parts[1].strip(" -—:") if len(parts) > 1 else raw
    return v, reason


# ─────────────────────────────────────────────────────────────────────────────
# Отправка с fallback (если HTML не парсится — шлём как обычный текст)
# ─────────────────────────────────────────────────────────────────────────────
async def _safe_send(bot: Bot, chat_id: int, msg: str) -> None:
    try:
        await bot.send_message(chat_id, msg, parse_mode="HTML")
        return
    except Exception:
        try:
            plain = re.sub(r"</?[^>]+>", "", msg)
            await bot.send_message(chat_id, plain)
        except Exception as e:
            logger.warning(f"meeting _safe_send failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Главная функция — провести совещание
# ─────────────────────────────────────────────────────────────────────────────
async def run_team_meeting(
    manager_bot: Bot, chat_id: int, question: str, participants: list = None
) -> None:
    """
    manager_bot — экземпляр бота Степана (Менеджера).
    chat_id — чат (группа), где идёт совещание.
    question — вопрос руководителя.
    participants — если задан, созываем именно эти отделы (иначе AI сам выбирает).
    """
    data = await _collect_data()
    if participants:
        dept_keys = [k for k in participants if k in DEPARTMENTS]
        if not dept_keys:
            dept_keys = await _route_departments(question, data)
    else:
        dept_keys = await _route_departments(question, data)

    # Поднимаем экземпляры ботов-отделов (по одному на участника) для их «голоса».
    dept_bots = {}
    for k in dept_keys:
        token = getattr(settings, DEPARTMENTS[k]["token"], None)
        if not token:
            continue
        try:
            dept_bots[k] = Bot(
                token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML)
            )
        except Exception as e:
            logger.warning(f"meeting: не удалось поднять бота {k}: {e}")

    if not dept_bots:
        await _safe_send(
            manager_bot,
            chat_id,
            "😔 Не удалось собрать отделы на совещание (нет доступных ботов).",
        )
        return

    try:
        participants = ", ".join(
            f"{DEPARTMENTS[k]['emoji']} {DEPARTMENTS[k]['name']}" for k in dept_bots
        )
        await _safe_send(
            manager_bot,
            chat_id,
            f"🧠 <b>Совещание отделов</b>\n"
            f"❓ Вопрос: {html.escape(question)}\n\n"
            f"👥 Участники: {participants}\n"
            f"<i>Обсуждаем, разбираем аргументы друг друга и приходим к общему решению…</i>",
        )

        # Публикация реплики отдела: пробуем от имени самого бота-отдела,
        # а если он не может писать в этот чат (не участник / приватка) —
        # Менеджер озвучивает реплику с подписью отдела.
        async def speak(dept_key: str, stmt: str) -> None:
            dept = DEPARTMENTS[dept_key]
            b = dept_bots.get(dept_key)
            if b is not None:
                try:
                    await b.send_message(
                        chat_id,
                        f"{dept['emoji']} {html.escape(stmt)}",
                        parse_mode="HTML",
                    )
                    return
                except Exception as e:
                    logger.info(
                        f"meeting: отдел {dept_key} не смог написать сам ({e}); озвучит Менеджер"
                    )
            await _safe_send(
                manager_bot,
                chat_id,
                f"{dept['emoji']} <b>{html.escape(dept['name'])}:</b>\n{html.escape(stmt)}",
            )

        transcript = []
        rounds = _cfg_rounds()

        # ── Раунд 1: позиции отделов ──
        for k in list(dept_bots):
            stmt = await _agent_statement(k, question, data, "\n".join(transcript), 1)
            transcript.append(f"{DEPARTMENTS[k]['name']}: {stmt}")
            await speak(k, stmt)
            await asyncio.sleep(1.5)

        # ── Динамический созыв: если затронуты обязанности других отделов — зовём их ──
        extra = await _route_additional(
            question, "\n".join(transcript), list(dept_bots.keys())
        )
        for k in extra:
            token = getattr(settings, DEPARTMENTS[k]["token"], None)
            if not token or k in dept_bots:
                continue
            try:
                dept_bots[k] = Bot(
                    token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML)
                )
            except Exception:
                continue
            await _safe_send(
                manager_bot,
                chat_id,
                f"➕ Степан приглашает в дискуссию: {DEPARTMENTS[k]['emoji']} "
                f"<b>{html.escape(DEPARTMENTS[k]['name'])}</b> — затронуты их обязанности.",
            )
            stmt = await _agent_statement(k, question, data, "\n".join(transcript), 1)
            transcript.append(f"{DEPARTMENTS[k]['name']}: {stmt}")
            await speak(k, stmt)
            await asyncio.sleep(1.2)

        # ── Раунды 2..N: дебаты (если участников больше одного) ──
        for r in range(2, rounds + 1):
            if len(dept_bots) < 2:
                break
            await _safe_send(
                manager_bot,
                chat_id,
                f"💬 <b>Раунд обсуждения {r - 1}</b> — отделы разбирают аргументы друг друга…",
            )
            for k in list(dept_bots):
                stmt = await _agent_statement(
                    k, question, data, "\n".join(transcript), 2
                )
                transcript.append(f"{DEPARTMENTS[k]['name']} (дебаты): {stmt}")
                await speak(k, stmt)
                await asyncio.sleep(1.5)

        # ── Цикл «предложение → голосование»; если нет большинства — новая дискуссия ──
        max_vote_rounds = _cfg_vote_rounds()
        adopted = False
        proposal = ""
        vote_info = {}
        for attempt in range(1, max_vote_rounds + 1):
            _, proposal = await _manager_synthesis(
                question, "\n".join(transcript), force_decision=True
            )
            label = (
                "Предложение на голосование"
                if attempt == 1
                else f"Новое предложение (попытка {attempt})"
            )
            await _safe_send(
                manager_bot, chat_id, f"🗳 <b>{label}:</b>\n\n{collapsible(proposal)}"
            )
            await asyncio.sleep(1.0)

            vfor = vagainst = vabstain = 0
            for k in list(dept_bots):
                v, reason = await _agent_vote(k, question, proposal)
                transcript.append(f"{DEPARTMENTS[k]['name']} голосует {v}: {reason}")
                emoji_v = {"ЗА": "✅", "ПРОТИВ": "❌", "ВОЗДЕРЖ": "➖"}.get(v, "➖")
                await speak(k, f"{emoji_v} <b>{v}</b> — {reason}")
                if v == "ЗА":
                    vfor += 1
                elif v == "ПРОТИВ":
                    vagainst += 1
                else:
                    vabstain += 1
                await asyncio.sleep(1.1)

            tally = f"🗳 <b>Итог:</b> ✅ ЗА {vfor} · ❌ ПРОТИВ {vagainst} · ➖ ВОЗДЕРЖ {vabstain}"
            vote_info = {"for": vfor, "against": vagainst, "abstain": vabstain}

            if vfor > vagainst:
                adopted = True
                await _safe_send(
                    manager_bot,
                    chat_id,
                    f"✅ <b>Решение ПРИНЯТО голосованием</b>\n{tally}",
                )
                break

            # Большинства нет → новая дискуссия и новое предложение
            if attempt < max_vote_rounds:
                await _safe_send(
                    manager_bot,
                    chat_id,
                    f"{tally}\n🔁 <b>Большинства нет — новая дискуссия</b>, дорабатываем решение…",
                )
                for k in list(dept_bots):
                    stmt = await _agent_statement(
                        k, question, data, "\n".join(transcript), 2
                    )
                    transcript.append(f"{DEPARTMENTS[k]['name']} (доработка): {stmt}")
                    await speak(k, stmt)
                    await asyncio.sleep(1.3)
            else:
                await _safe_send(manager_bot, chat_id, tally)

        # ── Сохранение решения и финал ──
        await save_decision(
            chat_id,
            {
                "question": question,
                "plan": proposal,
                "executed": False,
                "vote": vote_info,
            },
        )
        if adopted:
            await _safe_send(
                manager_bot,
                chat_id,
                "<i>Напишите «делайте» — и отделы автономно исполнят план.</i>",
            )
        else:
            await _safe_send(
                manager_bot,
                chat_id,
                f"⚖️ <b>За {max_vote_rounds} раунда(ов) решение не набрало большинства.</b>\n"
                f"Нужно ваше слово: «делайте» — принять последнее предложение, или задайте направление.",
            )

    finally:
        for b in dept_bots.values():
            try:
                await b.session.close()
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# Завершение совещания: готовое решение ИЛИ запрос участия владельца (с кнопкой)
# ─────────────────────────────────────────────────────────────────────────────
async def _finish_meeting(
    manager_bot: Bot,
    chat_id: int,
    question: str,
    transcript: str,
    needs_owner: bool,
    final: str,
) -> None:
    if not needs_owner:
        await save_decision(
            chat_id, {"question": question, "plan": final, "executed": False}
        )
        await _safe_send(
            manager_bot,
            chat_id,
            f"🤖 <b>Итог совещания — решение от Менеджера:</b>\n\n{final}",
        )
        await _safe_send(
            manager_bot,
            chat_id,
            "<i>Напишите «делайте» — и я запущу план в работу.</i>",
        )
        return

    token = uuid.uuid4().hex[:8]
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🤝 Доверяю, решайте сами",
                    callback_data=f"meet:decide:{token}",
                )
            ]
        ]
    )
    body = (
        f"🙋 <b>Команде нужно ваше участие</b>\n\n{final}\n\n"
        f"<i>Ответьте реплаем на это сообщение — команда учтёт ваш ответ и завершит решение. "
        f"Либо нажмите кнопку, чтобы команда решила сама.</i>"
    )
    try:
        sent = await manager_bot.send_message(
            chat_id, body, parse_mode="HTML", reply_markup=kb
        )
    except Exception:
        plain = re.sub(r"</?[^>]+>", "", body)
        sent = await manager_bot.send_message(chat_id, plain, reply_markup=kb)

    PENDING[token] = {
        "question": question,
        "transcript": transcript,
        "msg_id": sent.message_id,
        "chat_id": chat_id,
    }
    # Защита от разрастания памяти: держим только последние 30 ожиданий.
    if len(PENDING) > 30:
        for old in list(PENDING.keys())[:-30]:
            PENDING.pop(old, None)


def _pending_by_msg(msg_id: int) -> dict:
    for tok, ctx in PENDING.items():
        if ctx.get("msg_id") == msg_id:
            return tok, ctx
    return None, None


# ── Кнопка «Доверяю, решайте сами» ──
@meeting_router.callback_query(F.data.startswith("meet:decide:"))
async def _on_decide_yourself(cb: CallbackQuery) -> None:
    if not _is_admin(cb.from_user.id):
        await cb.answer("⛔ Только для руководителя")
        return
    token = cb.data.split(":")[-1]
    ctx = PENDING.pop(token, None)
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass
    if not ctx:
        await cb.answer("Совещание уже завершено")
        return
    await cb.answer("Принял — команда решает сама…")
    _, final = await _manager_synthesis(
        ctx["question"], ctx["transcript"], force_decision=True
    )
    await save_decision(
        ctx["chat_id"], {"question": ctx["question"], "plan": final, "executed": False}
    )
    await _safe_send(
        cb.bot,
        ctx["chat_id"],
        f"🤖 <b>Решение команды (без участия владельца):</b>\n\n{final}",
    )
    await _safe_send(
        cb.bot, ctx["chat_id"], "<i>Напишите «делайте» — и я запущу план в работу.</i>"
    )


# ── Ответ владельца реплаем на запрос участия ──
async def _pending_reply_filter(message: Message) -> bool:
    r = message.reply_to_message
    if not r:
        return False
    _, ctx = _pending_by_msg(r.message_id)
    return ctx is not None


@meeting_router.message(F.reply_to_message, _pending_reply_filter)
async def _on_owner_reply(message: Message) -> None:
    if not _is_admin(message.from_user.id):
        return
    tok, ctx = _pending_by_msg(message.reply_to_message.message_id)
    if not ctx:
        return
    PENDING.pop(tok, None)
    owner_answer = (message.text or "").strip()
    augmented = (
        ctx["transcript"] + f"\n\n[Ответ владельца на уточнение]: {owner_answer}"
    )
    await _safe_send(
        message.bot, ctx["chat_id"], "✅ Принял ваш ответ, команда завершает решение…"
    )
    _, final = await _manager_synthesis(ctx["question"], augmented, force_decision=True)
    await save_decision(
        ctx["chat_id"], {"question": ctx["question"], "plan": final, "executed": False}
    )
    await _safe_send(
        message.bot,
        ctx["chat_id"],
        f"🤖 <b>Итог с учётом вашего ответа:</b>\n\n{final}",
    )
    await _safe_send(
        message.bot,
        ctx["chat_id"],
        "<i>Напишите «делайте» — и я запущу план в работу.</i>",
    )


# ─────────────────────────────────────────────────────────────────────────────
# ИСПОЛНЕНИЕ ПЛАНА — «делайте» запускает принятое решение в работу
# ─────────────────────────────────────────────────────────────────────────────
def _parse_deadline(deadline_text: str) -> dict:
    """Грубый разбор срока в дату: 'N недел' / 'N дн' / 'N месяц'. Иначе None."""
    if not deadline_text:
        return None
    from datetime import date, timedelta

    t = deadline_text.lower()
    m = re.search(r"(\d+)", t)
    n = int(m.group(1)) if m else 1
    if "недел" in t:
        return date.today() + timedelta(weeks=n)
    if "мес" in t:
        return date.today() + timedelta(days=30 * n)
    if "дн" in t or "день" in t or "дня" in t:
        return date.today() + timedelta(days=n)
    return None


async def _parse_plan_tasks(plan: str) -> list:
    """
    Разбирает план на задачи: отдел + РЕАЛЬНОЕ действие из реестра возможностей.

    Раньше здесь выбирался только отдел, а «исполнение» сводилось к строке в БД
    и сочинённому отчёту. Теперь каждый пункт привязывается к тому, что бот
    ДЕЙСТВИТЕЛЬНО может сделать (написать клиентам, разослать, опубликовать,
    собрать лидов), а недоступное честно уходит человеку через human_task.
    """
    from shared.capabilities import CAPABILITIES, catalog_for_ai

    keys = ", ".join(DEPARTMENTS.keys())
    system = (
        "Разбери план действий на конкретные задачи. Для каждой выбери отдел И "
        "РЕАЛЬНОЕ действие из каталога возможностей — то, что бот действительно умеет.\n\n"
        f"Ключи отделов: {keys}\n\n"
        f"КАТАЛОГ ВОЗМОЖНОСТЕЙ:\n{catalog_for_ai()}\n\n"
        "⚠️ ПРАВИЛА:\n"
        "- «обзвонить / связаться / дожать / вернуть / уведомить клиентов» → notify_customers. "
        "Бот не звонит, но напишет в Telegram, затем на email, а тех, до кого не достучаться, "
        "передаст человеку. Это НЕ повод отказываться от пункта.\n"
        "- Если действие боту недоступно (встреча, переговоры, производство, закупка, найм) → "
        "human_task. НЕ выдумывай возможность, которой нет в каталоге.\n"
        "- В params клади то, что нужно действию: segment, message, target, topic, limit.\n"
        "- Для сообщений клиентам ОБЯЗАТЕЛЬНО напиши готовый текст в params.message — "
        "живой, вежливый, на русском, от лица Microgreen Uzbekistan, 1-3 предложения.\n\n"
        "Верни ТОЛЬКО JSON-массив:\n"
        '[{"dept":"<ключ>","action":"что сделать","capability":"<ключ из каталога>",'
        '"params":{...},"deadline":"срок как в тексте или пусто"}]'
    )
    try:
        raw = (
            await ai.chat_completion(system, plan, temperature=0.2, max_tokens=900)
        ).strip()
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if not m:
            return []
        items = json.loads(m.group(0))
        result = []
        for it in items:
            dept = str(it.get("dept", "")).strip()
            action = str(it.get("action", "")).strip()
            if not action or dept not in DEPARTMENTS:
                continue
            cap = str(it.get("capability", "")).strip()
            if cap not in CAPABILITIES:
                # модель предложила несуществующее действие — не выдумываем исполнение
                cap = "human_task"
            params = it.get("params") if isinstance(it.get("params")) else {}
            result.append(
                {
                    "dept": dept,
                    "action": action,
                    "capability": cap,
                    "params": params,
                    "deadline": str(it.get("deadline", "")).strip(),
                }
            )
        return result
    except Exception as e:
        logger.warning(f"parse plan tasks error: {e}")
        return []


# Планы, ждущие подтверждения на действия НАРУЖУ: token -> {chat_id, decision, tasks}
PENDING_EXEC: dict = {}


def _plan_preview(tasks: list) -> str:
    """Что именно будет сделано — до того, как это уйдёт клиентам."""
    from shared.capabilities import CAPABILITIES

    lines = []
    for t in tasks:
        d = DEPARTMENTS[t["dept"]]
        cap = CAPABILITIES.get(t.get("capability") or "")
        what = cap.title if cap else "передать человеку"
        mark = "⚠️" if (cap and cap.outward) else "•"
        lines.append(
            f"{mark} {d['emoji']} <b>{d['name']}</b> — {html.escape(t['action'])}\n"
            f"      └ {what}"
        )
    return "\n".join(lines)


async def run_execution(
    manager_bot: Bot, chat_id: int, decision: dict, tasks: list = None
) -> None:
    """
    Запускает план в работу — ПО-НАСТОЯЩЕМУ.

    Каждый пункт привязан к реальной возможности (написать клиентам, разослать,
    опубликовать, собрать лидов). Действия НАРУЖУ (сообщения клиентам, публикация)
    сначала показываются владельцу и уходят только после подтверждения — правило,
    уже принятое в проекте для B2B-рассылки.
    """
    from shared.capabilities import is_outward

    question = decision.get("question", "")
    plan = decision.get("plan", "")
    if tasks is None:
        tasks = await _parse_plan_tasks(plan)

    if not tasks:
        decision["executed"] = True
        await save_decision(chat_id, decision)
        await _safe_send(
            manager_bot,
            chat_id,
            "🤔 В плане нет пунктов, которые я могу выполнить. "
            "Сформулируйте конкретнее — что именно сделать?",
        )
        return

    # 1. Создаём задачи в БД (аудит). Без TASK_CREATED — отделы не должны
    #    запускать новый анализ, они будут ИСПОЛНЯТЬ.
    created = []
    try:
        async with get_session_ctx() as session:
            for t in tasks:
                dl = _parse_deadline(t.get("deadline"))
                try:
                    res = await session.execute(
                        text(
                            "INSERT INTO tasks (title, assignee, department, status, priority, deadline, description) "
                            "VALUES (:ti, :asg, :dep, 'in_progress', 'high', :dl, :ds) RETURNING id"
                        ),
                        {
                            "ti": t["action"][:100],
                            "asg": DEPARTMENTS[t["dept"]]["name"],
                            "dep": t["dept"],
                            "dl": dl,
                            "ds": f"Из плана. Вопрос руководителя: {question}",
                        },
                    )
                    t["task_id"] = res.scalar()
                    created.append(t)
                except Exception as e:
                    logger.warning(f"exec: не создал задачу для {t['dept']}: {e}")
            await session.commit()
    except Exception as e:
        logger.warning(f"exec: ошибка создания задач: {e}")
        created = tasks

    decision["executed"] = True
    decision["tasks"] = created
    decision.setdefault("fp", plan_fingerprint(plan))
    await save_decision(chat_id, decision)

    # 2. Если есть действия НАРУЖУ — спрашиваем разрешение ОДНОЙ кнопкой.
    outward = [t for t in created if is_outward(t.get("capability"))]
    if outward and getattr(settings, "execution_require_confirm", True):
        token = uuid.uuid4().hex[:8]
        PENDING_EXEC[token] = {
            "chat_id": chat_id,
            "decision": decision,
            "tasks": created,
        }
        if len(PENDING_EXEC) > 20:
            for old in list(PENDING_EXEC.keys())[:-20]:
                PENDING_EXEC.pop(old, None)

        kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🚀 Выполнять", callback_data=f"exec:go:{token}"
                    ),
                    InlineKeyboardButton(
                        text="❌ Отмена", callback_data=f"exec:no:{token}"
                    ),
                ]
            ]
        )
        body = (
            f"🚀 <b>Готов выполнить план:</b>\n\n{_plan_preview(created)}\n\n"
            f"⚠️ Пункты со значком уйдут <b>реальным клиентам</b> / в аккаунт. "
            f"Подтвердите запуск."
        )
        try:
            await manager_bot.send_message(
                chat_id, body, parse_mode="HTML", reply_markup=kb
            )
        except Exception:
            await manager_bot.send_message(
                chat_id, re.sub(r"</?[^>]+>", "", body), reply_markup=kb
            )
        return

    await _perform(manager_bot, chat_id, created)


async def _perform(manager_bot: Bot, chat_id: int, tasks: list) -> None:
    """Выполняет возможности и отчитывается ФАКТАМИ, а не сочинением."""
    from shared.capabilities import run_capability

    await _safe_send(manager_bot, chat_id, "⚙️ <b>Выполняю…</b>")

    dept_keys = list(dict.fromkeys(t["dept"] for t in tasks))
    dept_bots = {}
    for k in dept_keys:
        tok = getattr(settings, DEPARTMENTS[k]["token"], None)
        if tok:
            try:
                dept_bots[k] = Bot(
                    token=tok, default=DefaultBotProperties(parse_mode=ParseMode.HTML)
                )
            except Exception:
                pass

    done, failed, to_human = 0, 0, 0
    try:
        for t in tasks:
            k = t["dept"]
            cap_key = t.get("capability") or "human_task"
            params = dict(t.get("params") or {})
            params.setdefault("action", t["action"])
            params.setdefault("dept", k)

            res = await run_capability(cap_key, params)

            icon = "✅" if res.ok else "⚠️"
            body = f"{DEPARTMENTS[k]['emoji']} {icon} {html.escape(res.summary)}"
            for e in res.evidence:
                body += f"\n      {html.escape(e)}"

            b = dept_bots.get(k)
            sent = False
            if b is not None:
                try:
                    await b.send_message(chat_id, body, parse_mode="HTML")
                    sent = True
                except Exception:
                    pass
            if not sent:
                await _safe_send(
                    manager_bot,
                    chat_id,
                    f"{DEPARTMENTS[k]['emoji']} {icon} "
                    f"<b>{DEPARTMENTS[k]['name']}:</b> {html.escape(res.summary)}",
                )

            # Задачу закрываем ТОЛЬКО если действие реально отработало.
            # human_task — это эскалация, работа ещё впереди: не закрываем.
            tid = t.get("task_id")
            if res.ok and cap_key != "human_task":
                done += 1
                if tid:
                    try:
                        async with get_session_ctx() as s:
                            await s.execute(
                                text("UPDATE tasks SET status='done' WHERE id=:id"),
                                {"id": tid},
                            )
                            await s.commit()
                    except Exception as e:
                        logger.warning(f"exec: не закрыл задачу {tid}: {e}")
            elif cap_key == "human_task":
                to_human += 1
            else:
                failed += 1

            await asyncio.sleep(1.0)
    finally:
        for b in dept_bots.values():
            try:
                await b.session.close()
            except Exception:
                pass

    parts = [f"✅ выполнено: {done}"]
    if to_human:
        parts.append(f"🙋 передано людям: {to_human}")
    if failed:
        parts.append(f"⚠️ не удалось: {failed}")
    await _safe_send(
        manager_bot,
        chat_id,
        f"🤖 <b>Итог:</b> {' · '.join(parts)} (из {len(tasks)})\n"
        f"<i>Напишите «статус» — покажу, что осталось.</i>",
    )


@meeting_router.callback_query(F.data.startswith("exec:"))
async def _on_exec_confirm(cb: CallbackQuery) -> None:
    """Подтверждение действий, которые уйдут наружу (клиентам / в аккаунт)."""
    if not _is_admin(cb.from_user.id):
        await cb.answer("⛔ Только для руководителя")
        return
    _, verb, token = cb.data.split(":", 2)
    ctx = PENDING_EXEC.pop(token, None)
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    if not ctx:
        await cb.answer("Этот план уже неактуален")
        return

    if verb == "no":
        await cb.answer("Отменено")
        # план отменён — снимаем «исполнен», чтобы не мешал следующему
        await clear_decision(ctx["chat_id"])
        await _safe_send(
            cb.bot, ctx["chat_id"], "❌ Выполнение отменено. Ничего не отправлено."
        )
        return

    await cb.answer("Запускаю…")
    await _perform(cb.bot, ctx["chat_id"], ctx["tasks"])


def plan_fingerprint(text: str) -> str:
    """Отпечаток плана — чтобы отличать «тот же самый план» от нового."""
    import hashlib

    norm = re.sub(r"\s+", " ", (text or "").strip()).lower()
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()[:12]


async def handle_execution_command(
    manager_bot: Bot, chat_id: int, fresh_plan: str = "", fresh_question: str = ""
) -> bool:
    """
    «Делайте / выполняй» — запустить план в работу.

    fresh_plan — последний план, который Менеджер предложил в чате (то, что
    руководитель ВИДИТ НА ЭКРАНЕ, когда пишет «Делай»).

    ⚠️ Порядок проверок критичен. Раньше сохранённое решение проверялось раньше
    свежего плана: лежащее со вчера решение с executed=True перехватывало команду
    и Степан уходил отчитываться по ВЧЕРАШНЕМУ плану, а свежий Action Plan не
    исполнялся вовсе. Свежий план должен побеждать протухшее решение.

    Возвращает True, если команда обработана.
    """
    # 1) Совещание ждало участия владельца → «делайте» = решайте сами и запускайте.
    tok = next((t for t, c in PENDING.items() if c.get("chat_id") == chat_id), None)
    if tok:
        ctx = PENDING.pop(tok)
        _, final = await _manager_synthesis(
            ctx["question"], ctx["transcript"], force_decision=True
        )
        decision = {"question": ctx["question"], "plan": final, "executed": False}
        await _safe_send(manager_bot, chat_id, f"🤖 <b>Решение команды:</b>\n\n{final}")
        await run_execution(manager_bot, chat_id, decision)
        return True

    decision = await load_decision(chat_id)

    # 2) Совещание только что приняло решение, но оно ещё не запущено — запускаем его.
    if decision and not decision.get("executed"):
        await run_execution(manager_bot, chat_id, decision)
        return True

    # 3) Свежий план из чата («Что по KPI» → Action Plan → «Делай»).
    if fresh_plan and len(fresh_plan.strip()) >= 40:
        fp = plan_fingerprint(fresh_plan)
        if decision and decision.get("executed") and decision.get("fp") == fp:
            # ИМЕННО ЭТОТ план уже запущен — показываем статус, а не дублируем задачи
            await run_plan_status(manager_bot, chat_id)
            return True
        tasks = await _parse_plan_tasks(fresh_plan)
        if tasks:
            await run_execution(
                manager_bot,
                chat_id,
                {
                    "question": fresh_question,
                    "plan": fresh_plan,
                    "executed": False,
                    "source": "chat",
                    "fp": fp,
                },
                tasks=tasks,
            )
            return True

    # 4) Свежего плана нет, но есть запущенный ранее — показываем его статус.
    if decision and decision.get("executed"):
        await run_plan_status(manager_bot, chat_id)
        return True

    return False


# ─────────────────────────────────────────────────────────────────────────────
# СТАТУС ПЛАНА — «статус / прогресс»: отделы отчитываются, Менеджер сводит
# ─────────────────────────────────────────────────────────────────────────────
async def _exec_status(dept_key: str, task: dict) -> tuple:
    """
    Отчёт отдела по задаче. Возвращает (текст, done: bool).

    ⚠️ ФАКТ ВЫПОЛНЕНИЯ БЕРЁТСЯ ИЗ БАЗЫ, А НЕ У МОДЕЛИ.
    Раньше здесь у AI спрашивали «что уже сделано?», он сочинял правдоподобный
    текст («проведён дожим клиентов по 80% заказов»), и если тот начинался с
    [ГОТОВО] — задача закрывалась в БД. Реальной работы за этим не стояло: так
    пять задач получили статус done без единого действия, а руководителю
    отрапортовали «выполнено 5 из 5». Отделы — чат-боты, они физически не могут
    обзванивать клиентов; врать об этом система не должна.

    Теперь: done — только то, что реально помечено выполненным в БД (кнопкой
    «✅ Выполнено» или событием TASK_COMPLETED). AI лишь формулирует, чем отдел
    занят, и ему ЗАПРЕЩЕНО утверждать, что задача сделана.
    """
    dept = DEPARTMENTS[dept_key]
    action = task.get("action", "")
    task_id = task.get("task_id")

    status = None
    if task_id:
        try:
            async with get_session_ctx() as s:
                res = await s.execute(
                    text("SELECT status FROM tasks WHERE id = :id"), {"id": task_id}
                )
                row = res.fetchone()
                status = row[0] if row else None
        except Exception as e:
            logger.warning(f"status: не прочитал задачу {task_id}: {e}")

    if status == "done":
        return f"Задача закрыта: {action}", True
    if status == "cancelled":
        return f"Задача отменена: {action}", False

    system = (
        f"{dept['role']}\n\nТебя спрашивают, как идёт твоя задача. Она ЕЩЁ НЕ ВЫПОЛНЕНА. "
        "Ответь ОДНОЙ короткой фразой: над чем работаешь и какой ближайший шаг. "
        "⚠️ КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО утверждать, что задача сделана, что-то уже "
        "достигнуто или называть проценты выполнения — этого не было. "
        "Без markdown, без списков."
    )
    try:
        txt = (
            await ai.chat_completion(
                system, f"Задача: {action}", temperature=0.5, max_tokens=90
            )
        ).strip()
    except Exception:
        txt = f"В работе: {action}"
    return txt, False


async def run_plan_status(manager_bot: Bot, chat_id: int) -> None:
    decision = await load_decision(chat_id)
    if not decision or not decision.get("executed"):
        await _safe_send(
            manager_bot,
            chat_id,
            "📋 Активного плана пока нет. Задайте вопрос — соберём совещание.",
        )
        return

    tasks = decision.get("tasks", [])
    if not tasks:
        await _safe_send(
            manager_bot, chat_id, "📋 План запущен, но задачи не зафиксированы."
        )
        return

    await _safe_send(
        manager_bot, chat_id, "📊 <b>Статус плана</b> — собираю отчёты отделов…"
    )

    dept_keys = list(dict.fromkeys(t["dept"] for t in tasks))
    dept_bots = {}
    for k in dept_keys:
        tok = getattr(settings, DEPARTMENTS[k]["token"], None)
        if tok:
            try:
                dept_bots[k] = Bot(
                    token=tok, default=DefaultBotProperties(parse_mode=ParseMode.HTML)
                )
            except Exception:
                pass

    done_count = 0
    try:
        for t in tasks:
            k = t["dept"]
            # done приходит ИЗ БД. Задачу закрывает человек (кнопка «✅ Выполнено»)
            # или событие TASK_COMPLETED — но не сам себе отчитывающийся бот.
            report, done = await _exec_status(k, t)
            mark = "✅" if done else "🔄"
            if done:
                done_count += 1
            body = f"{DEPARTMENTS[k]['emoji']} {mark} {html.escape(report)}"
            b = dept_bots.get(k)
            sent = False
            if b is not None:
                try:
                    await b.send_message(chat_id, body, parse_mode="HTML")
                    sent = True
                except Exception:
                    pass
            if not sent:
                await _safe_send(
                    manager_bot,
                    chat_id,
                    f"{DEPARTMENTS[k]['emoji']} {mark} <b>{DEPARTMENTS[k]['name']}:</b> {html.escape(report)}",
                )
            await asyncio.sleep(1.0)
    finally:
        for b in dept_bots.values():
            try:
                await b.session.close()
            except Exception:
                pass

    total = len(tasks)
    summary = f"🤖 <b>Итог по плану:</b> закрыто {done_count} из {total}."
    if done_count < total:
        # Честно: отделы — чат-боты, сами задачу не закрывают. Закрывает человек.
        summary += (
            "\n<i>Остальные — в работе. Задача закрывается кнопкой "
            "«✅ Выполнено» в её карточке, когда работа реально сделана.</i>"
        )
    await _safe_send(manager_bot, chat_id, summary)
    if done_count >= total:
        await clear_decision(chat_id)
        await _safe_send(manager_bot, chat_id, "🎉 План выполнен полностью!")


# ─────────────────────────────────────────────────────────────────────────────
# KPI-WATCHDOG — авто-разбор при падении показателей (проактивный автопилот)
# ─────────────────────────────────────────────────────────────────────────────
def _kpi_drop_ratio() -> float:
    try:
        return max(1, int(getattr(settings, "kpi_watchdog_drop_pct", 20) or 20)) / 100.0
    except Exception:
        return 0.2


async def _collect_kpi_drops() -> dict:
    """Сравнивает ключевые KPI неделя-к-неделе. Возвращает (drops: list[str], details: str)."""
    thr = _kpi_drop_ratio()
    drops, details = [], []

    def check(name: str, cur: float, prev: float, unit: str = "") -> None:
        details.append(f"• {name}: {cur}{unit} (неделю назад {prev}{unit})")
        if prev and prev > 0 and cur < prev * (1 - thr):
            pct = round((1 - cur / prev) * 100)
            drops.append(f"{name} −{pct}%")

    try:
        async with get_session_ctx() as s:
            r1 = (
                await s.execute(
                    text(
                        "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders "
                        "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
                    )
                )
            ).fetchone()
            r2 = (
                await s.execute(
                    text(
                        "SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders "
                        "WHERE created_at >= CURRENT_DATE - INTERVAL '14 days' "
                        "AND created_at < CURRENT_DATE - INTERVAL '7 days'"
                    )
                )
            ).fetchone()
            check("Заказы/нед", int(r1[0] or 0), int(r2[0] or 0))
            check("Выручка/нед", int(float(r1[1] or 0)), int(float(r2[1] or 0)))
            c1 = (
                await s.execute(
                    text(
                        "SELECT COUNT(*) FROM customers "
                        "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
                    )
                )
            ).scalar() or 0
            c2 = (
                await s.execute(
                    text(
                        "SELECT COUNT(*) FROM customers "
                        "WHERE created_at >= CURRENT_DATE - INTERVAL '14 days' "
                        "AND created_at < CURRENT_DATE - INTERVAL '7 days'"
                    )
                )
            ).scalar() or 0
            check("Новые клиенты/нед", int(c1), int(c2))
    except Exception as e:
        logger.warning(f"kpi db error: {e}")

    # Instagram: средняя вовлечённость постов за 7 дней vs предыдущие 7
    try:
        from shared.instagram_analytics import get_recent_media_stats
        from datetime import datetime, timezone

        media = await get_recent_media_stats(limit=40)
        now = datetime.now(timezone.utc)

        def avg_eng(lo: float, hi: float) -> dict:
            vals = []
            for m in media:
                ts = (m.get("timestamp") or "").replace("Z", "+00:00")
                try:
                    d = datetime.fromisoformat(ts)
                except Exception:
                    continue
                age = (now - d).days
                if lo <= age < hi:
                    vals.append(m.get("engagement", 0))
            return round(sum(vals) / len(vals), 1) if vals else 0

        cur, prev = avg_eng(0, 7), avg_eng(7, 14)
        if cur or prev:
            check("Вовлечённость IG (ср/пост)", cur, prev)
    except Exception as e:
        logger.warning(f"kpi ig error: {e}")

    # Кого созывать — по тому, какой KPI просел
    resp = set()
    joined = " ".join(drops)
    if "Заказ" in joined or "Выручк" in joined:
        resp.update(["sales", "marketing"])
    if "клиент" in joined:
        resp.update(["marketing", "sales"])
    if "IG" in joined or "Вовлечённост" in joined:
        resp.update(["content", "marketing", "analytics"])
    return drops, "\n".join(details), list(resp)


async def run_kpi_watchdog(manager_bot: Bot, chat_id: int) -> bool:
    """Проверяет KPI; при падении — созывает совещание отделов на разбор. True если созвал."""
    if not getattr(settings, "kpi_watchdog_enabled", True):
        return False
    drops, details, resp_depts = await _collect_kpi_drops()
    if not drops:
        logger.info("KPI watchdog: показатели стабильны — совещание не требуется")
        return False

    problem = "; ".join(drops)
    depts_names = (
        ", ".join(DEPARTMENTS[k]["name"] for k in resp_depts if k in DEPARTMENTS)
        or "профильные отделы"
    )
    await _safe_send(
        manager_bot,
        chat_id,
        f"📉 <b>KPI-алерт</b>: {html.escape(problem)}\n"
        f"🧑‍💼 Ответственные: {html.escape(depts_names)}\n"
        f"<i>Степан созывает их на совещание…</i>",
    )
    question = (
        f"KPI-алерт: за последнюю неделю просели показатели — {problem}.\n\n"
        f"Динамика:\n{details}\n\n"
        "Проанализируйте причины (сезонность, качество трафика, воронка) и обязательно учтите "
        "АКТУАЛЬНЫЕ МИРОВЫЕ ТРЕНДЫ (HoReCa, ЗОЖ, соцсети). Дайте конкретный план, как вернуть и "
        "УДЕРЖИВАТЬ высокие показатели — что менять в контенте, маркетинге и продажах."
    )
    await run_team_meeting(
        manager_bot, chat_id, question, participants=resp_depts or None
    )

    # Авто-исполнение плана (если включено в настройках)
    if getattr(settings, "kpi_watchdog_autoexecute", False):
        dec = await load_decision(chat_id)
        if dec and not dec.get("executed"):
            await _safe_send(
                manager_bot, chat_id, "⚙️ Авто-режим: запускаю план в работу…"
            )
            await run_execution(manager_bot, chat_id, dec)
    return True
