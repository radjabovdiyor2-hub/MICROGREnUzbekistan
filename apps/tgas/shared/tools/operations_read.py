"""
📖 OPERATIONS READ — отделы умеют ЧИТАТЬ то, что система пишет
================================================================
Пятнадцать таблиц заполнялись каждый день и не читались ни одним инструментом.
Данные есть, а спросить о них было нельзя:

    «сколько мне должны?»              — таблица `debts` пишется, читать нечем
    «кто сегодня в смене?»             — `shifts` пишется, читать нечем
    «почём последний раз брали семена?» — `supplier_prices` пишется, читать нечем
    «что с браком на этой неделе?»     — `quality_controls` пишется, читать нечем
    «кому мы обещали перезвонить?»     — `followups` пишется, читать нечем

Владелец видел их только в админке, вручную. Бот на прямой вопрос отвечал
общими словами или выдумывал — потому что инструмента не было, а модель без
инструмента отвечает всё равно.

Здесь закрыты те пять, что про деньги и ежедневную работу. Остальные
(эксперименты, подписки, маршруты, отзывы, промокоды, журнальные таблицы)
намеренно оставлены: там сначала нужно решить, кто и о чём спрашивает.

ЧТО ВАЖНО ПРИ ПРАВКЕ

Таблицы здесь — витринного семейства (cuid-ключи, camelCase в Prisma →
snake_case в базе), кроме `followups`, которая принадлежит CRM офиса (serial).
Путать семейства — та самая ошибка, из-за которой продажа не регистрировалась.
Проверяйте колонки скриптом: `python scripts/check_schema.py`.
"""

from __future__ import annotations

import logging
from datetime import date as date_type
from typing import Any, Dict, List

from sqlalchemy import text

from shared.database import get_session_ctx
from shared.tools.registry import Tool, register
from shared.utils import format_price

logger = logging.getLogger(__name__)

# Долги и смены нужны и Стёпану (ответить владельцу), и профильным отделам.
DEPTS = [
    "sales",
    "support",
    "analytics",
    "finance",
    "marketing",
    "hr",
    "content",
    "qa",
    "rnd",
    "devops",
]


def _rows(result) -> List[Dict[str, Any]]:
    return [dict(r._mapping) for r in result]


# ── Долги ───────────────────────────────────────────────────────────────

async def get_debts(direction: str = "", only_unpaid: str = "yes") -> Dict[str, Any]:
    """Долги: нам должны и мы должны."""
    where = ["1=1"]
    params: Dict[str, Any] = {}

    kind = (direction or "").strip().lower()
    if kind in ("нам", "us", "who_owes_us", "нам должны"):
        where.append("d.type = 'WHO_OWES_US'")
    elif kind in ("мы", "we", "we_owe", "мы должны"):
        where.append("d.type = 'WE_OWE'")

    if str(only_unpaid).strip().lower() not in ("no", "нет", "false", "0"):
        where.append("d.is_paid = false")

    async with get_session_ctx() as session:
        result = await session.execute(
            text(f"""
                SELECT d.id, d.type, d.person_name, d.phone, d.amount,
                       d.paid_amount, d.due_date, d.is_paid, d.description,
                       s.name AS supplier_name
                FROM debts d
                LEFT JOIN suppliers s ON s.id = d.supplier_id
                WHERE {' AND '.join(where)}
                ORDER BY d.due_date NULLS LAST, d.amount DESC
                LIMIT 40
            """),
            params,
        )
        rows = _rows(result)

    if not rows:
        return {"found": False, "summary": "Непогашенных долгов нет."}

    owed_to_us = sum(
        int(r["amount"]) - int(r["paid_amount"])
        for r in rows if r["type"] == "WHO_OWES_US"
    )
    we_owe = sum(
        int(r["amount"]) - int(r["paid_amount"])
        for r in rows if r["type"] == "WE_OWE"
    )

    return {
        "found": True,
        "count": len(rows),
        "owed_to_us": owed_to_us,
        "we_owe": we_owe,
        "summary": (
            f"Нам должны {format_price(owed_to_us)}, мы должны {format_price(we_owe)}. "
            f"Всего записей: {len(rows)}."
        ),
        "debts": [
            {
                "who": r["person_name"],
                "phone": r["phone"] or "телефон не записан",
                "direction": "нам должны" if r["type"] == "WHO_OWES_US" else "мы должны",
                "remaining": int(r["amount"]) - int(r["paid_amount"]),
                "remaining_text": format_price(int(r["amount"]) - int(r["paid_amount"])),
                "due_date": r["due_date"].strftime("%d.%m.%Y") if r["due_date"] else None,
                "supplier": r["supplier_name"],
                "note": r["description"],
            }
            for r in rows
        ],
    }


# ── Смены ───────────────────────────────────────────────────────────────

async def get_shifts(date: str = "") -> Dict[str, Any]:
    """Кто в смене на дату (по умолчанию — сегодня)."""
    async with get_session_ctx() as session:
        result = await session.execute(
            # e.role, а не e.position: колонки `position` у `employees` нет
            # (см. schema.prisma, модель Employee — там `role`). Запрос падал
            # с UndefinedColumn на КАЖДОМ вызове, ошибка гасилась внешним
            # except, и офис не мог прочитать ни одной смены.
            text("""
                SELECT sh.type, sh.start_time, sh.end_time, sh.note,
                       e.name AS employee_name, e.role
                FROM shifts sh
                JOIN employees e ON e.id = sh.employee_id
                WHERE sh.date = COALESCE(NULLIF(:date, '')::date,
                                         (NOW() AT TIME ZONE 'Asia/Samarkand')::date)
                ORDER BY sh.type, e.name
            """),
            {"date": date or ""},
        )
        rows = _rows(result)

    when = date or "сегодня"
    if not rows:
        return {"found": False, "summary": f"На {when} смен не назначено."}

    working = [r for r in rows if r["type"] == "work"]
    absent = [r for r in rows if r["type"] != "work"]

    def fmt(r: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "name": r["employee_name"],
            "role": r["role"],
            "type": r["type"],
            "from": r["start_time"].strftime("%H:%M") if r["start_time"] else None,
            "to": r["end_time"].strftime("%H:%M") if r["end_time"] else None,
            "note": r["note"],
        }

    return {
        "found": True,
        "date": when,
        "working_count": len(working),
        "summary": (
            f"На {when} работают {len(working)}: "
            + ", ".join(r["employee_name"] for r in working)
            + (f". Отсутствуют {len(absent)}." if absent else ".")
        ),
        "working": [fmt(r) for r in working],
        "absent": [fmt(r) for r in absent],
    }


# ── Поставщики и их цены ────────────────────────────────────────────────

async def get_supplier_prices(material: str = "", supplier: str = "") -> Dict[str, Any]:
    """Актуальные цены поставщиков на сырьё — почём и у кого берём."""
    where = ["sp.is_active = true"]
    params: Dict[str, Any] = {}
    if material.strip():
        where.append("m.name ILIKE :material")
        params["material"] = f"%{material.strip()}%"
    if supplier.strip():
        where.append("s.name ILIKE :supplier")
        params["supplier"] = f"%{supplier.strip()}%"

    async with get_session_ctx() as session:
        result = await session.execute(
            text(f"""
                SELECT s.name AS supplier_name, s.phone,
                       m.name AS material_name, m.kind,
                       sp.price, sp.unit, sp.valid_from, sp.note
                FROM supplier_prices sp
                JOIN suppliers s ON s.id = sp.supplier_id
                JOIN raw_materials m ON m.id = sp.material_id
                WHERE {' AND '.join(where)}
                ORDER BY m.name, sp.price
                LIMIT 50
            """),
            params,
        )
        rows = _rows(result)

    if not rows:
        return {
            "found": False,
            "summary": (
                "Цен поставщиков по такому запросу нет. "
                "Прайс заполняется при оприходовании сырья в админке."
            ),
        }

    return {
        "found": True,
        "count": len(rows),
        "summary": f"Нашёл {len(rows)} действующих цен.",
        "prices": [
            {
                "material": r["material_name"],
                "supplier": r["supplier_name"],
                "supplier_phone": r["phone"],
                "price": float(r["price"]),
                "price_text": f"{format_price(float(r['price']))} за {r['unit']}",
                "since": r["valid_from"].strftime("%d.%m.%Y") if r["valid_from"] else None,
                "note": r["note"],
            }
            for r in rows
        ],
    }


# ── Контроль качества ───────────────────────────────────────────────────

async def get_quality_report(days: str = "7") -> Dict[str, Any]:
    """Проверки качества за N дней: сколько годно, сколько брака и какого."""
    try:
        window = max(1, min(90, int(str(days).strip() or 7)))
    except ValueError:
        window = 7

    async with get_session_ctx() as session:
        result = await session.execute(
            text("""
                SELECT qc.status, qc.defect_type, qc.notes, qc.created_at,
                       b.crop_type, b.trays, e.name AS inspector_name
                FROM quality_controls qc
                JOIN grow_batches b ON b.id = qc.batch_id
                LEFT JOIN employees e ON e.id = qc.inspector_id
                WHERE qc.created_at >= NOW() - make_interval(days => :days)
                ORDER BY qc.created_at DESC
                LIMIT 50
            """),
            {"days": window},
        )
        rows = _rows(result)

    if not rows:
        return {"found": False, "summary": f"Проверок качества за {window} дн. не было."}

    passed = [r for r in rows if r["status"] == "passed"]
    failed = [r for r in rows if r["status"] != "passed"]

    defects: Dict[str, int] = {}
    for r in failed:
        key = r["defect_type"] or "не указан"
        defects[key] = defects.get(key, 0) + 1

    return {
        "found": True,
        "days": window,
        "total": len(rows),
        "passed": len(passed),
        "failed": len(failed),
        "defects": defects,
        "summary": (
            f"За {window} дн. проверок {len(rows)}: годно {len(passed)}, "
            f"брак {len(failed)}."
            + (f" Чаще всего: {max(defects, key=lambda d: defects[d])}." if defects else "")
        ),
        "checks": [
            {
                "crop": r["crop_type"],
                "trays": r["trays"],
                "status": r["status"],
                "defect": r["defect_type"],
                "inspector": r["inspector_name"],
                "notes": r["notes"],
                "date": r["created_at"].strftime("%d.%m.%Y"),
            }
            for r in rows[:20]
        ],
    }


# ── Напоминания перезвонить ─────────────────────────────────────────────

async def get_followups(status: str = "pending") -> Dict[str, Any]:
    """Кому обещали перезвонить и когда."""
    wanted = (status or "pending").strip().lower()

    async with get_session_ctx() as session:
        result = await session.execute(
            text("""
                SELECT f.scheduled_at, f.message, f.status,
                       c.name AS customer_name, c.phone, c.customer_type
                FROM followups f
                JOIN customers c ON c.id = f.customer_id
                WHERE LOWER(f.status) = :status
                ORDER BY f.scheduled_at
                LIMIT 40
            """),
            {"status": wanted},
        )
        rows = _rows(result)

    if not rows:
        return {"found": False, "summary": "Запланированных касаний нет."}

    today = date_type.today()
    overdue = [
        r for r in rows
        if r["scheduled_at"] and r["scheduled_at"].date() < today
    ]

    return {
        "found": True,
        "count": len(rows),
        "overdue_count": len(overdue),
        "summary": (
            f"Запланировано касаний: {len(rows)}"
            + (f", из них просрочено {len(overdue)}." if overdue else ".")
        ),
        "followups": [
            {
                "customer": r["customer_name"],
                "phone": r["phone"] or "телефон не записан",
                "type": r["customer_type"],
                "when": r["scheduled_at"].strftime("%d.%m.%Y %H:%M") if r["scheduled_at"] else None,
                "what": r["message"],
            }
            for r in rows
        ],
    }


# ── Регистрация ─────────────────────────────────────────────────────────

register(
    Tool(
        name="get_debts",
        admin_tab="debts",
        description=(
            "Долги: кто должен нам и кому должны мы, сколько осталось и до какого числа. "
            "Вызывай на «сколько мне должны», «кому мы должны», «какие долги»."
        ),
        run=get_debts,
        departments=DEPTS,
        params={
            "direction": {
                "type": "string",
                "description": "«нам» — нам должны, «мы» — мы должны. Пусто — оба.",
            },
            "only_unpaid": {
                "type": "string",
                "description": "«yes» (по умолчанию) — только непогашенные, «no» — все.",
            },
        },
    )
)

register(
    Tool(
        name="get_shifts",
        admin_tab="shifts",
        description=(
            "Кто сегодня в смене, кто на больничном или в отпуске. "
            "Вызывай на «кто работает», «кто в смене», «кто сегодня на ферме»."
        ),
        run=get_shifts,
        departments=DEPTS,
        params={
            "date": {
                "type": "string",
                "description": "Дата YYYY-MM-DD. Пусто — сегодня.",
            }
        },
    )
)

register(
    Tool(
        name="get_supplier_prices",
        admin_tab="suppliers",
        description=(
            "Почём и у кого закупаем сырьё: семена, субстрат, лотки, упаковку. "
            "Вызывай на «почём семена», «у кого дешевле», «цены поставщиков»."
        ),
        run=get_supplier_prices,
        departments=DEPTS,
        params={
            "material": {
                "type": "string",
                "description": "Название сырья или его часть: «горох», «субстрат».",
            },
            "supplier": {
                "type": "string",
                "description": "Название поставщика или его часть.",
            },
        },
    )
)

register(
    Tool(
        name="get_quality_report",
        admin_tab="qa",
        description=(
            "Контроль качества за период: сколько партий годно, сколько брака и какого. "
            "Вызывай на «что с браком», «качество урожая», «сколько плесени»."
        ),
        run=get_quality_report,
        departments=DEPTS,
        params={
            "days": {
                "type": "string",
                "description": "За сколько дней смотреть. По умолчанию 7.",
            }
        },
    )
)

register(
    Tool(
        name="get_followups",
        admin_tab="customers",
        description=(
            "Кому обещали перезвонить и когда, что просрочено. "
            "Вызывай на «кому перезвонить», «какие касания», «что просрочено»."
        ),
        run=get_followups,
        departments=DEPTS,
        params={
            "status": {
                "type": "string",
                "description": "pending (по умолчанию), done, cancelled.",
            }
        },
    )
)
