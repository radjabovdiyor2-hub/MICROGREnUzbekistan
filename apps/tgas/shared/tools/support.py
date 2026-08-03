"""
Инструменты поддержки: статус заказа клиента, follow-up, эскалация, IG Direct.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import text

from shared import capabilities
from shared.database import get_session_ctx
from shared.tools.registry import Tool, from_capability, register
from shared.utils import format_price

DEPTS = ["support"]


async def get_order_status(
    order_number: Optional[str] = None, phone: Optional[str] = None
) -> Dict[str, Any]:
    """Статус заказа по номеру или по телефону клиента."""
    if not order_number and not phone:
        return {"found": False, "message": "Нужен номер заказа или телефон клиента."}

    where = "o.order_number = :onum" if order_number else "c.phone = :phone"
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT o.order_number, o.total_amount, o.status, o.payment_status, "
                    "o.created_at, c.name "
                    "FROM crm_orders o LEFT JOIN customers c ON c.id = o.customer_id "
                    f"WHERE {where} ORDER BY o.id DESC LIMIT 5"
                ),
                {"onum": order_number, "phone": phone},
            )
        ).fetchall()

    if not rows:
        return {"found": False, "message": "Такого заказа не нашёл."}
    return {
        "found": True,
        "orders": [
            {
                "order_number": r[0],
                "total": float(r[1] or 0),
                "total_text": format_price(float(r[1] or 0)),
                "status": r[2],
                "payment_status": r[3],
                "created_at": str(r[4]),
                "customer": r[5],
            }
            for r in rows
        ],
    }


async def create_followup(
    phone: str, message: str, days: int = 2
) -> Dict[str, Any]:
    """Напомнить себе связаться с клиентом через N дней."""
    async with get_session_ctx() as session:
        created = (
            await session.execute(
                text(
                    "INSERT INTO followups (customer_id, scheduled_at, message, status) "
                    "SELECT id, NOW() + CAST(:days || ' days' AS INTERVAL), :msg, 'pending' "
                    "FROM customers WHERE phone = :phone LIMIT 1 RETURNING id"
                ),
                {"days": str(int(days)), "msg": message, "phone": phone},
            )
        ).scalar()
        await session.commit()
    if not created:
        return {"ok": False, "message": f"Клиента с телефоном {phone} нет в CRM."}
    return {"ok": True, "followup_id": created, "in_days": int(days)}


async def escalate(summary: str, department: str = "sales") -> Dict[str, Any]:
    """Передать обращение с высоким приоритетом ответственному отделу."""
    async with get_session_ctx() as session:
        task_id = (
            await session.execute(
                text(
                    "INSERT INTO tasks (title, assignee, department, status, priority, "
                    "description, created_at) "
                    "VALUES (:t, :d, :d, 'todo', 'urgent', :descr, NOW()) RETURNING id"
                ),
                {
                    "t": f"🚨 Эскалация: {summary[:200]}",
                    "d": str(department or "sales").lower(),
                    "descr": summary,
                },
            )
        ).scalar()
        await session.commit()
    return {"ok": True, "task_id": task_id, "department": department}


async def check_dm() -> Dict[str, Any]:
    """Проверить непрочитанные сообщения в Instagram Direct."""
    result = await capabilities.run_capability("check_dm", {})
    return from_capability(result)


register(
    Tool(
        name="get_order_status",
        description="Найти заказ клиента по номеру или телефону и показать его статус.",
        run=get_order_status,
        departments=DEPTS,
        params={
            "order_number": {"type": "string", "description": "Номер заказа"},
            "phone": {"type": "string", "description": "Телефон клиента"},
        },
    )
)

register(
    Tool(
        name="create_followup",
        description="Поставить напоминание связаться с клиентом через N дней.",
        run=create_followup,
        departments=DEPTS,
        params={
            "phone": {"type": "string", "description": "Телефон клиента"},
            "message": {"type": "string", "description": "О чём напомнить"},
            "days": {"type": "number", "description": "Через сколько дней (по умолчанию 2)"},
        },
        required=["phone", "message"],
    )
)

register(
    Tool(
        name="escalate",
        description=(
            "Передать обращение ответственному отделу со срочным приоритетом. "
            "Вызывай при жалобе, браке, срыве сроков."
        ),
        run=escalate,
        departments=DEPTS,
        params={
            "summary": {"type": "string", "description": "Суть проблемы"},
            "department": {"type": "string", "description": "Кому передаём"},
        },
        required=["summary"],
    )
)

register(
    Tool(
        name="check_dm",
        description="Проверить непрочитанные сообщения в Instagram Direct.",
        run=check_dm,
        departments=DEPTS,
    )
)
