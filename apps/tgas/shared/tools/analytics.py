"""
Инструменты аналитики: топ товаров, ABC-анализ, динамика, Instagram.

Считаем по CRM-зеркалу (`crm_orders` / `crm_order_items`): через него проходит
каждый заказ — и с сайта, и зарегистрированный офисом, — и только там позиции
хранятся с суммой строки (`total_price`).

⚠️ Отменённые заказы исключаются везде. Витрина так делала всегда, офис — нет,
и один и тот же период показывал разную выручку в зависимости от того, чей
экран открыть. Фильтр один на модуль — `NOT_A_SALE` из shared/tools/crm.
"""

from __future__ import annotations

from typing import Any, Dict

from sqlalchemy import text

from shared import capabilities
from shared.database import get_session_ctx
from shared.tools.crm import NOT_A_SALE
from shared.tools.registry import Tool, from_capability, register
from shared.utils import format_price

DEPTS = ["analytics"]


async def top_products(days: int = 30, limit: int = 10) -> Dict[str, Any]:
    """Топ товаров по выручке за период."""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT p.name_ru, SUM(oi.quantity), SUM(oi.total_price) "
                    "FROM crm_order_items oi "
                    "JOIN crm_products p ON p.id = oi.product_id "
                    "JOIN crm_orders o ON o.id = oi.order_id "
                    "WHERE o.created_at >= CURRENT_DATE - CAST(:days || ' days' AS INTERVAL) "
                    f"AND LOWER(o.status) NOT IN {NOT_A_SALE} "
                    "GROUP BY p.name_ru ORDER BY SUM(oi.total_price) DESC LIMIT :lim"
                ),
                {"days": str(int(days)), "lim": int(limit)},
            )
        ).fetchall()
    return {
        "days": int(days),
        "products": [
            {
                "name": r[0],
                "quantity": float(r[1] or 0),
                "revenue": float(r[2] or 0),
                "revenue_text": format_price(float(r[2] or 0)),
            }
            for r in rows
        ],
    }


async def abc_analysis(days: int = 90) -> Dict[str, Any]:
    """ABC-анализ: какие товары дают 80% выручки (A), 15% (B), 5% (C)."""
    data = await top_products(days=days, limit=200)
    products = data["products"]
    total = sum(p["revenue"] for p in products)
    if not total:
        return {"days": int(days), "message": "Продаж за период нет.", "groups": {}}

    groups: Dict[str, list] = {"A": [], "B": [], "C": []}
    cumulative = 0.0
    for product in products:
        cumulative += product["revenue"]
        share = cumulative / total
        group = "A" if share <= 0.8 else ("B" if share <= 0.95 else "C")
        groups[group].append(product["name"])
    return {
        "days": int(days),
        "revenue_total": total,
        "groups": groups,
        "note": "A — держать в наличии всегда, C — кандидаты на вывод из ассортимента.",
    }


async def get_sales_trend(days: int = 14) -> Dict[str, Any]:
    """Динамика заказов и выручки по дням."""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT DATE(created_at), COUNT(*), COALESCE(SUM(total_amount), 0) "
                    "FROM crm_orders "
                    "WHERE created_at >= CURRENT_DATE - CAST(:days || ' days' AS INTERVAL) "
                    f"AND LOWER(status) NOT IN {NOT_A_SALE} "
                    "GROUP BY DATE(created_at) ORDER BY DATE(created_at)"
                ),
                {"days": str(int(days))},
            )
        ).fetchall()
    return {
        "days": int(days),
        "series": [
            {"date": str(r[0]), "orders": r[1], "revenue": float(r[2])} for r in rows
        ],
    }


async def build_report(kind: str = "daily") -> Dict[str, Any]:
    """Сводный отчёт от аналитики."""
    result = await capabilities.run_capability("build_report", {"kind": kind})
    return from_capability(result)


async def instagram_stats() -> Dict[str, Any]:
    """Статистика Instagram: охваты, вовлечённость."""
    result = await capabilities.run_capability("instagram_stats", {})
    return from_capability(result)


register(
    Tool(
        name="top_products",
        description="Топ товаров по выручке за период: что продаётся лучше всего.",
        run=top_products,
        departments=DEPTS,
        params={
            "days": {"type": "number", "description": "Период в днях (по умолчанию 30)"},
            "limit": {"type": "number", "description": "Сколько позиций (по умолчанию 10)"},
        },
    )
)

register(
    Tool(
        name="abc_analysis",
        description="ABC-анализ ассортимента: какие товары дают основную выручку.",
        run=abc_analysis,
        departments=DEPTS,
        params={"days": {"type": "number", "description": "Период в днях (по умолчанию 90)"}},
    )
)

register(
    Tool(
        name="get_sales_trend",
        description="Динамика заказов и выручки по дням за период.",
        run=get_sales_trend,
        departments=DEPTS,
        params={"days": {"type": "number", "description": "Период в днях (по умолчанию 14)"}},
    )
)

register(
    Tool(
        name="build_report",
        description="Сформировать сводный отчёт (daily, finance, sales, tasks).",
        run=build_report,
        departments=DEPTS,
        params={"kind": {"type": "string", "description": "Тип отчёта"}},
    )
)

register(
    Tool(
        name="instagram_stats",
        description="Статистика Instagram: охваты, вовлечённость, рост подписчиков.",
        run=instagram_stats,
        departments=DEPTS,
    )
)
