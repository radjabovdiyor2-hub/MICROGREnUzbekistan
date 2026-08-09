"""
👥 CRM TOOLS — отделы знают клиентов и заказы
==============================================
Инструментов чтения CRM у отделов не было вообще. На вопросы, которые владелец
задаёт каждый день, ответить было нечем:

    «есть ли такой клиент?»        — инструмента не существовало
    «кто взял этот заказ?»         — только у поддержки, точным номером
    «прошлые заказы клиента?»      — только у поддержки, только по телефону
    «сколько сегодня продаж?»      — общая сводка, но с отменёнными заказами

Отдел продаж при этом имел пять инструментов, и все пять — на запись. Читать
бизнес он мог только через восемь общих, среди которых поиска клиента нет.

Поэтому четыре инструмента ниже объявлены общими: клиент нужен и продажам
(кому продаём), и поддержке (кто жалуется), и аналитике (кто сколько берёт),
и Стёпану (ответить владельцу).

Поиск клиента идёт через `shared/customer_repo` — тот же нечёткий, с
транслитерацией, что и при регистрации продажи. Иначе бот отвечал бы «такого
клиента нет» ровно про того, кому вчера продал.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from shared import customer_repo
from shared.database import get_session_ctx
from shared.tools.registry import Tool, register
from shared.utils import format_price

logger = logging.getLogger(__name__)

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

# Заказ, отменённый клиентом, — не продажа. Витрина исключает такие из всех
# своих отчётов; офис этого не делал, и один и тот же день показывал разную
# выручку в зависимости от того, какой экран открыть.
NOT_A_SALE = "('cancelled', 'canceled', 'refunded')"


def _order_number_patterns(raw: str) -> List[str]:
    """
    Номер заказа так, как его мог назвать человек.

    Витрина выдаёт `M-20260804-8E6E40BF`, офис — `MG-000042`. Руководитель же
    диктует «заказ 8E6E40BF», «m-20260804-8e6e40bf» или просто «42». Точное
    сравнение, которое было в `get_order_status`, отвечало на всё это «такого
    заказа не нашёл» — при том, что заказ есть.
    """
    cleaned = re.sub(r"\s+", "", str(raw or "")).upper()
    if not cleaned:
        return []

    # Порядок важен: вызывающий берёт ПЕРВОЕ совпадение и на нём
    # останавливается. Широкий `%42%` стоял раньше точного `MG-000042`,
    # поэтому «заказ 42» возвращал свежайший заказ, в номере которого просто
    # встречались эти цифры (например M-20260804-8E6E4042) — и подавал его
    # как найденный, с чужим клиентом и чужой суммой. Сначала точные формы,
    # подстрока — только последней надеждой.
    if cleaned.isdigit():
        # Голое число — скорее всего офисный номер: «42» → «MG-000042».
        return [f"MG-{int(cleaned):06d}", cleaned, f"%{cleaned}%"]
    return [cleaned, f"%{cleaned}%"]


async def find_customer(query: str) -> Dict[str, Any]:
    """Найти клиента по имени, названию заведения или телефону."""
    found = await customer_repo.find(query, limit=5)
    if not found:
        return {
            "found": False,
            "query": query,
            "summary": f"Клиента «{query}» в CRM нет — это новый контакт.",
        }
    return {
        "found": True,
        "count": len(found),
        "customers": [
            {
                "id": c["id"],
                "name": c["name"],
                "phone": c["phone_display"] or "телефон не записан",
                "type": c["customer_type"],
                "status": c["status"],
                "city": c["city"],
                "orders_count": c["orders_count"],
                "total_spent": c["total_spent"],
                "total_spent_text": format_price(c["total_spent"]),
                "last_order_date": (
                    c["last_order_date"].strftime("%d.%m.%Y")
                    if c["last_order_date"]
                    else None
                ),
            }
            for c in found
        ],
    }


async def get_customer_orders(query: str, limit: int = 10) -> Dict[str, Any]:
    """Прошлые заказы клиента — что и на сколько он брал."""
    match = await customer_repo.resolve(query)
    if "candidates" in match:
        return {
            "found": False,
            "ambiguous": True,
            "candidates": [
                {"id": c["id"], "name": c["name"], "phone": c["phone_display"]}
                for c in match["candidates"]
            ],
            "summary": f"Под «{query}» подходит несколько клиентов — уточните, кто именно.",
        }
    customer = match.get("customer")
    if not customer:
        return {"found": False, "summary": f"Клиента «{query}» в CRM нет."}

    history = await customer_repo.orders(customer["id"], limit=max(1, min(limit, 50)))
    return {
        "found": True,
        "customer": {
            "id": customer["id"],
            "name": customer["name"],
            "phone": customer["phone_display"],
            "type": customer["customer_type"],
            "orders_count": customer["orders_count"],
            "total_spent_text": format_price(customer["total_spent"]),
        },
        "orders": [
            {
                "order_number": o["order_number"],
                "date": o["created_at"].strftime("%d.%m.%Y") if o["created_at"] else None,
                "total_text": format_price(o["total_amount"]),
                "status": o["status"],
                "payment_status": o["payment_status"],
                "items": [
                    f"{i['name']} × {i['quantity']:g}" for i in o["items"]
                ],
            }
            for o in history
        ],
    }


async def get_order(order_number: str) -> Dict[str, Any]:
    """Кто взял этот заказ: клиент, состав, сумма, статус."""
    patterns = _order_number_patterns(order_number)
    if not patterns:
        return {"found": False, "summary": "Назовите номер заказа."}

    async with get_session_ctx() as session:
        row = None
        for pattern in patterns:
            row = (
                await session.execute(
                    text(
                        "SELECT o.id, o.order_number, o.total_amount, o.status, "
                        "       o.payment_status, o.payment_method, o.created_at, "
                        "       o.delivery_address, o.notes, "
                        "       c.id, c.name, c.phone, c.customer_type, c.orders_count "
                        "FROM crm_orders o LEFT JOIN customers c ON c.id = o.customer_id "
                        "WHERE o.order_number = :p OR o.order_number ILIKE :p "
                        "ORDER BY o.id DESC LIMIT 1"
                    ),
                    {"p": pattern},
                )
            ).fetchone()
            if row:
                break
        if not row:
            return {
                "found": False,
                "summary": f"Заказа «{order_number}» в CRM нет.",
            }

        items = (
            await session.execute(
                text(
                    "SELECT COALESCE(p.name_ru, p.name_uz, 'Товар'), i.quantity, "
                    "       i.unit, i.unit_price, i.total_price "
                    "FROM crm_order_items i "
                    "LEFT JOIN crm_products p ON p.id = i.product_id "
                    "WHERE i.order_id = :oid ORDER BY i.id"
                ),
                {"oid": row[0]},
            )
        ).fetchall()

    return {
        "found": True,
        "order_number": row[1],
        "total": float(row[2] or 0),
        "total_text": format_price(float(row[2] or 0)),
        "status": row[3],
        "payment_status": row[4],
        "payment_method": row[5],
        "date": row[6].strftime("%d.%m.%Y %H:%M") if row[6] else None,
        "delivery_address": row[7],
        "customer": {
            "id": row[9],
            "name": row[10] or "клиент не указан",
            "phone": row[11],
            "type": row[12],
            "orders_count": row[13],
        },
        "items": [
            {
                "name": i[0],
                "quantity": float(i[1] or 0),
                "unit": i[2],
                "total_text": format_price(float(i[4] or 0)),
            }
            for i in items
        ],
    }


async def get_sales_today(date: Optional[str] = None) -> Dict[str, Any]:
    """Продажи за день: сколько заказов, на какую сумму и кто покупал."""
    day = str(date or "").strip() or None

    async with get_session_ctx() as session:
        totals = (
            await session.execute(
                text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0), "
                    "       COUNT(*) FILTER (WHERE payment_status = 'paid'), "
                    "       COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) "
                    "FROM crm_orders "
                    "WHERE DATE(created_at) = COALESCE(CAST(:d AS date), CURRENT_DATE) "
                    f"AND LOWER(status) NOT IN {NOT_A_SALE}"
                ),
                {"d": day},
            )
        ).fetchone()

        by_customer = (
            await session.execute(
                text(
                    "SELECT COALESCE(c.name, 'без карточки'), COUNT(*), "
                    "       COALESCE(SUM(o.total_amount), 0) "
                    "FROM crm_orders o LEFT JOIN customers c ON c.id = o.customer_id "
                    "WHERE DATE(o.created_at) = COALESCE(CAST(:d AS date), CURRENT_DATE) "
                    f"AND LOWER(o.status) NOT IN {NOT_A_SALE} "
                    "GROUP BY c.name ORDER BY SUM(o.total_amount) DESC LIMIT 10"
                ),
                {"d": day},
            )
        ).fetchall()

        units = (
            await session.execute(
                text(
                    "SELECT COALESCE(SUM(i.quantity), 0) "
                    "FROM crm_order_items i JOIN crm_orders o ON o.id = i.order_id "
                    "WHERE DATE(o.created_at) = COALESCE(CAST(:d AS date), CURRENT_DATE) "
                    f"AND LOWER(o.status) NOT IN {NOT_A_SALE}"
                ),
                {"d": day},
            )
        ).scalar()

        cancelled = (
            await session.execute(
                text(
                    "SELECT COUNT(*) FROM crm_orders "
                    "WHERE DATE(created_at) = COALESCE(CAST(:d AS date), CURRENT_DATE) "
                    f"AND LOWER(status) IN {NOT_A_SALE}"
                ),
                {"d": day},
            )
        ).scalar()

    orders_count = totals[0] if totals else 0
    revenue = float(totals[1]) if totals else 0.0
    return {
        "date": day or "сегодня",
        "orders": orders_count,
        "revenue": revenue,
        "revenue_text": format_price(revenue),
        "paid_orders": totals[2] if totals else 0,
        "paid_revenue_text": format_price(float(totals[3]) if totals else 0),
        "units": float(units or 0),
        "cancelled_orders": cancelled or 0,
        "average_check_text": format_price(revenue / orders_count)
        if orders_count
        else format_price(0),
        "by_customer": [
            {
                "name": r[0],
                "orders": r[1],
                "total_text": format_price(float(r[2] or 0)),
            }
            for r in by_customer
        ],
    }


register(
    Tool(
        name="find_customer",
        description=(
            "Найти клиента в CRM по имени, названию заведения или телефону. "
            "Вызывай ВСЕГДА перед регистрацией продажи и перед тем, как сказать "
            "«такого клиента нет»: поиск понимает «Жасмин», «ресторан жасмин», "
            "«Jasmina» и номер в любом формате записи."
        ),
        run=find_customer,
        departments=DEPTS,
        params={
            "query": {
                "type": "string",
                "description": "Имя, название заведения или телефон.",
            }
        },
        required=["query"],
    )
)

register(
    Tool(
        name="get_customer_orders",
        description=(
            "Прошлые заказы клиента: что брал, когда, на какую сумму. "
            "Вызывай на вопросы «что он обычно берёт», «когда покупал в прошлый раз», "
            "«история клиента»."
        ),
        run=get_customer_orders,
        departments=DEPTS,
        params={
            "query": {
                "type": "string",
                "description": "Имя, название заведения или телефон клиента.",
            },
            "limit": {
                "type": "integer",
                "description": "Сколько последних заказов показать (по умолчанию 10).",
            },
        },
        required=["query"],
    )
)

register(
    Tool(
        name="get_order",
        description=(
            "Всё про конкретный заказ: КТО его взял, что в нём, сумма, статус, оплата. "
            "Вызывай на «кто взял заказ M-…», «что было в заказе», «оплачен ли заказ». "
            "Номер можно называть неточно — хоть куском, хоть в нижнем регистре."
        ),
        run=get_order,
        departments=DEPTS,
        params={
            "order_number": {
                "type": "string",
                "description": "Номер заказа: M-20260804-8E6E40BF, MG-000042 или его часть.",
            }
        },
        required=["order_number"],
    )
)

register(
    Tool(
        name="get_sales_today",
        description=(
            "Продажи за день: сколько заказов, на какую сумму, средний чек, "
            "сколько единиц товара и кто покупал. Отменённые заказы не считаются. "
            "Вызывай на «сколько сегодня продаж», «какая выручка», «сколько заказов»."
        ),
        run=get_sales_today,
        departments=DEPTS,
        params={
            "date": {
                "type": "string",
                "description": "Дата YYYY-MM-DD. Пусто — сегодня.",
            }
        },
    )
)
