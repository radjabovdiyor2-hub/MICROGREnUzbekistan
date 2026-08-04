"""
Инструменты финансового отдела: проводки, P&L, расход на ИИ.

Отчёты считаются по колонке `date` (деловая дата операции), а не по `created_at`
(момент внесения строки): расход, внесённый задним числом, иначе выпадал из
месячного отчёта и завышал прибыль.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import text

from shared.database import get_session_ctx
from shared.tools.crm import NOT_A_SALE
from shared.tools.registry import Tool, register
from shared.utils import format_price

DEPTS = ["finance"]

ALLOWED_TYPES = {"income", "expense"}


async def add_finance_entry(
    type: str,
    amount: float,
    category: str,
    description: str = "",
    date: Optional[str] = None,
) -> Dict[str, Any]:
    """Записать доход или расход."""
    kind = str(type or "").lower()
    if kind not in ALLOWED_TYPES:
        return {"ok": False, "message": "type должен быть income или expense"}
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return {"ok": False, "message": "Сумма не распознана"}
    if value <= 0:
        return {"ok": False, "message": "Сумма должна быть больше нуля"}

    async with get_session_ctx() as session:
        entry_id = (
            await session.execute(
                text(
                    "INSERT INTO finances (type, amount, category, description, date, created_at) "
                    "VALUES (:t, :a, :c, :d, COALESCE(CAST(:dt AS DATE), CURRENT_DATE), NOW()) "
                    "RETURNING id"
                ),
                {
                    "t": kind,
                    "a": value,
                    "c": category[:100],
                    "d": description,
                    "dt": date,
                },
            )
        ).scalar()
        await session.commit()
    word = "Доход" if kind == "income" else "Расход"
    return {
        "ok": True,
        "entry_id": entry_id,
        "message": f"{word} {format_price(value)} ({category}) записан.",
    }


async def get_finance_summary(days: int = 30) -> Dict[str, Any]:
    """Доходы и расходы по категориям за период."""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT type, category, COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE date >= CURRENT_DATE - CAST(:days || ' days' AS INTERVAL) "
                    "GROUP BY type, category ORDER BY SUM(amount) DESC"
                ),
                {"days": str(int(days))},
            )
        ).fetchall()

    income = sum(float(r[2]) for r in rows if r[0] == "income")
    expense = sum(float(r[2]) for r in rows if r[0] == "expense")
    return {
        "days": int(days),
        "income": income,
        "expense": expense,
        "profit": income - expense,
        "profit_text": format_price(income - expense),
        "by_category": [
            {"type": r[0], "category": r[1], "amount": float(r[2])} for r in rows
        ],
    }


async def get_pnl(
    month: Optional[int] = None, year: Optional[int] = None
) -> Dict[str, Any]:
    """P&L за месяц: доходы, расходы, прибыль, маржа.

    ⚠️ Две ловушки, на которые этот отчёт уже попадался.

    1. **Год обязателен.** Фильтр был только по номеру месяца, поэтому «декабрь»
       складывал декабри всех лет разом.
    2. **`orders_amount` — не доход.** Каждый заказ автоматически пишет строку
       `income`/`sales` в `finances` (`notifications.finance_on_order_created`),
       то есть `income` УЖЕ включает выручку по заказам. Сложить их — удвоить
       доход. Поэтому сумма по заказам возвращается как справочная, с явной
       пометкой, и в прибыль не входит.
    """
    async with get_session_ctx() as session:
        params = {
            "m": int(month) if month else None,
            "y": int(year) if year else None,
        }
        period = (
            "EXTRACT(MONTH FROM {col}) = "
            "COALESCE(CAST(:m AS INTEGER), EXTRACT(MONTH FROM CURRENT_DATE)) "
            "AND EXTRACT(YEAR FROM {col}) = "
            "COALESCE(CAST(:y AS INTEGER), EXTRACT(YEAR FROM CURRENT_DATE))"
        )
        orders = (
            await session.execute(
                text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM crm_orders "
                    "WHERE " + period.format(col="created_at") + " "
                    f"AND LOWER(status) NOT IN {NOT_A_SALE}"
                ),
                params,
            )
        ).fetchone()
        money = (
            await session.execute(
                text(
                    "SELECT type, COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE " + period.format(col="date") + " GROUP BY type"
                ),
                params,
            )
        ).fetchall()

    totals = {r[0]: float(r[1]) for r in money}
    income = totals.get("income", 0.0)
    expense = totals.get("expense", 0.0)
    profit = income - expense
    return {
        "orders": orders[0] if orders else 0,
        "orders_amount": float(orders[1]) if orders else 0.0,
        "orders_amount_note": (
            "справочно: эта выручка уже входит в income — складывать нельзя"
        ),
        "income": income,
        "expense": expense,
        "profit": profit,
        "profit_text": format_price(profit),
        "margin_percent": round(profit / income * 100, 1) if income else 0.0,
    }


async def get_ai_spend() -> Dict[str, Any]:
    """Расход на ИИ по ботам за текущий месяц."""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT bot, COALESCE(SUM(cost_usd), 0), "
                    "COALESCE(SUM(input_tokens + output_tokens), 0) "
                    "FROM ai_usage "
                    "WHERE created_at >= date_trunc('month', CURRENT_DATE) "
                    "GROUP BY bot ORDER BY SUM(cost_usd) DESC"
                )
            )
        ).fetchall()
    return {
        "currency": "USD",
        "total_cost": round(sum(float(r[1]) for r in rows), 4),
        "by_bot": [
            {"bot": r[0], "cost_usd": round(float(r[1]), 4), "tokens": int(r[2])}
            for r in rows
        ],
    }


register(
    Tool(
        name="add_finance_entry",
        description=(
            "Записать доход или расход в учёт. Вызывай, когда сообщают о трате, "
            "закупке, поступлении денег, зарплате."
        ),
        run=add_finance_entry,
        departments=DEPTS,
        params={
            "type": {
                "type": "string",
                "enum": ["income", "expense"],
                "description": "Доход или расход",
            },
            "amount": {"type": "number", "description": "Сумма в сумах"},
            "category": {
                "type": "string",
                "description": "Категория: семена, аренда, зарплата, доставка…",
            },
            "description": {"type": "string", "description": "Комментарий"},
            "date": {
                "type": "string",
                "description": "Деловая дата YYYY-MM-DD, если операция задним числом",
            },
        },
        required=["type", "amount", "category"],
        risky=True,
        confirm=lambda a: (
            f"Записать {'доход' if a.get('type') == 'income' else 'расход'} "
            f"{format_price(float(a.get('amount') or 0))} — {a.get('category')}"
        ),
    )
)

register(
    Tool(
        name="get_finance_summary",
        description="Доходы, расходы и прибыль по категориям за период.",
        run=get_finance_summary,
        departments=DEPTS,
        params={"days": {"type": "number", "description": "За сколько дней (по умолчанию 30)"}},
    )
)

register(
    Tool(
        name="get_pnl",
        description=(
            "P&L за месяц: доходы, расходы, прибыль, маржа. "
            "Выручка по заказам возвращается справочно — она уже входит в income, "
            "складывать их нельзя."
        ),
        run=get_pnl,
        departments=DEPTS,
        params={
            "month": {"type": "number", "description": "Номер месяца, по умолчанию текущий"},
            "year": {"type": "number", "description": "Год, по умолчанию текущий"},
        },
    )
)

register(
    Tool(
        name="get_ai_spend",
        description="Сколько потрачено на ИИ в этом месяце, по ботам.",
        run=get_ai_spend,
        departments=DEPTS,
    )
)
