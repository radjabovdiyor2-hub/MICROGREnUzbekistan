"""
Инструменты поддержки: статус заказа клиента, follow-up, эскалация, IG Direct.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import text

from shared import capabilities
from shared import phone as phone_utils
from shared import tasks_repo
from shared.database import get_session_ctx
from shared.tools.registry import Tool, from_capability, register
from shared.utils import format_price

# Остаётся поддержкой: «что с моим заказом» от клиента — её работа.
# Остальным отделам заказ и история клиента доступны через общие инструменты
# `get_order` / `get_customer_orders` (shared/tools/crm.py) — раньше их не
# существовало, и отдел продаж на вопрос о собственном заказе ответить не мог.
DEPTS = ["support"]


async def get_order_status(
    order_number: Optional[str] = None, phone: Optional[str] = None
) -> Dict[str, Any]:
    """Статус заказа по номеру или по телефону клиента.

    Номер сравнивается и точно, и вхождением: руководитель диктует «заказ
    8E6E40BF», а не полный `M-20260804-8E6E40BF`. Телефон — по последним девяти
    цифрам, потому что в базе он записан в нескольких форматах.
    """
    if not order_number and not phone:
        return {"found": False, "message": "Нужен номер заказа или телефон клиента."}

    if order_number:
        where = "(o.order_number = :onum OR o.order_number ILIKE :onum_like)"
    else:
        where = f"c.phone IS NOT NULL AND {phone_utils.SQL_PHONE_TAIL} = :tail"
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT o.order_number, o.total_amount, o.status, o.payment_status, "
                    "o.created_at, c.name "
                    # видим-удалённых-намеренно: ищут статус ЗАКАЗА, и он
                    # существует независимо от карточки покупателя.
                    "FROM crm_orders o LEFT JOIN customers c ON c.id = o.customer_id "
                    f"WHERE {where} ORDER BY o.id DESC LIMIT 5"
                ),
                {
                    "onum": (order_number or "").strip().upper(),
                    "onum_like": f"%{(order_number or '').strip().upper()}%",
                    "tail": phone_utils.match_tail(phone),
                },
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
    """Напомнить себе связаться с клиентом через N дней.

    Поиск по последним девяти цифрам (`SQL_PHONE_TAIL`), а не точным
    сравнением строки. В базе телефоны лежат в четырёх исторических форматах —
    ровно поэтому `phone.match_tail` и существует, и `get_order_status` выше
    в этом же файле им пользуется. Точное сравнение не находило клиента почти
    никогда, и инструмент уверенно отвечал «такого клиента нет в CRM».
    """
    async with get_session_ctx() as session:
        created = (
            await session.execute(
                text(
                    "INSERT INTO followups (customer_id, scheduled_at, message, status) "
                    "SELECT id, NOW() + (INTERVAL '1 day' * :days), :msg, 'pending' "
                    "FROM customers "
                    "WHERE deleted_at IS NULL AND phone IS NOT NULL AND "
                    + phone_utils.SQL_PHONE_TAIL
                    + " = :tail LIMIT 1 RETURNING id"
                ),
                {
                    "days": int(days),
                    "msg": message,
                    "tail": phone_utils.match_tail(phone),
                },
            )
        ).scalar()
        await session.commit()
    if not created:
        return {"ok": False, "message": f"Клиента с телефоном {phone} нет в CRM."}
    return {"ok": True, "followup_id": created, "in_days": int(days)}


async def escalate(summary: str, department: str = "sales") -> Dict[str, Any]:
    """Передать обращение с высоким приоритетом ответственному отделу.

    Через `tasks_repo.create`, а не своим INSERT: раньше строка появлялась,
    события не было, отдел о срочной эскалации не узнавал никогда — а
    инструмент отвечал «ok» и исполнитель закрывал обращение как решённое.
    `_route` нужен по той же причине: отдел из фантазии модели («продажи»,
    «Sales») попадал в базу как есть, и слушателя у него не было.
    """
    from shared.tools.common import _route

    return await tasks_repo.create(
        title=f"🚨 Эскалация: {summary[:200]}",
        department=_route(department or "sales"),
        description=summary,
        priority="urgent",
        # Срочное без срока не попадает в дайджест просрочки — сегодня же.
        deadline_days=0,
    )


async def check_dm() -> Dict[str, Any]:
    """Проверить непрочитанные сообщения в Instagram Direct."""
    result = await capabilities.run_capability("check_dm", {})
    return from_capability(result)


register(
    Tool(
        name="get_order_status",
        admin_tab="orders",
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
        admin_tab="customers",
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
        admin_tab="tasks",
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
        admin_tab="dept_support",
        description="Проверить непрочитанные сообщения в Instagram Direct.",
        run=check_dm,
        departments=DEPTS,
    )
)
