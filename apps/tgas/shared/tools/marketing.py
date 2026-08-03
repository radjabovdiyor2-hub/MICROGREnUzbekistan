"""
Инструменты маркетинга: рассылки, B2B-предложения, сбор лидов, воронка.

Все действия «наружу» проходят через shared/capabilities.py — там уже реализована
лестница каналов (Telegram → email → задача человеку) и дневной предел исходящих.
Telegram API не позволяет боту написать первым, поэтому холодный контакт идёт
только email/телефоном — capabilities это учитывает.
"""

from __future__ import annotations

from typing import Any, Dict

from sqlalchemy import text

from shared import capabilities
from shared.database import get_session_ctx
from shared.tools.registry import Tool, from_capability, register

DEPTS = ["marketing"]


async def broadcast(message: str, segment: str = "all") -> Dict[str, Any]:
    """Рассылка по клиентской базе."""
    return from_capability(
        await capabilities.run_capability(
            "broadcast", {"message": message, "segment": segment}
        )
    )


async def b2b_offer(message: str = "") -> Dict[str, Any]:
    """Коммерческие предложения ресторанам: PDF + письмо."""
    return from_capability(await capabilities.run_capability("b2b_offer", {"message": message}))


async def collect_leads(city: str = "") -> Dict[str, Any]:
    """Собрать новых B2B-лидов (рестораны) из внешних справочников."""
    return from_capability(await capabilities.run_capability("collect_leads", {"city": city}))


async def get_funnel() -> Dict[str, Any]:
    """Воронка B2B: сколько лидов, сколько сконтактировано, сколько купили."""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT status, COUNT(*) FROM customers "
                    "WHERE customer_type = 'b2b' GROUP BY status"
                )
            )
        ).fetchall()
        contacted = (
            await session.execute(
                text(
                    "SELECT COUNT(DISTINCT customer_id) FROM interactions "
                    "WHERE interaction_type = 'b2b_offer_sent'"
                )
            )
        ).scalar()
    by_status = {r[0]: r[1] for r in rows}
    return {
        "b2b_by_status": by_status,
        "contacted": contacted or 0,
        "leads": by_status.get("lead", 0),
        "active": by_status.get("active", 0),
    }


register(
    Tool(
        name="broadcast",
        description="Разослать сообщение клиентам (сегмент all/b2b/b2c/vip/leads).",
        run=broadcast,
        departments=DEPTS,
        params={
            "message": {"type": "string", "description": "Текст рассылки"},
            "segment": {
                "type": "string",
                "enum": ["all", "b2b", "b2c", "vip", "leads", "inactive"],
                "description": "Кому",
            },
        },
        required=["message"],
        risky=True,
        confirm=lambda a: (
            f"Разослать сегменту «{a.get('segment') or 'all'}»: "
            f"{str(a.get('message'))[:80]}…"
        ),
    )
)

register(
    Tool(
        name="b2b_offer",
        description="Отправить коммерческие предложения ресторанам (PDF на email).",
        run=b2b_offer,
        departments=DEPTS,
        params={"message": {"type": "string", "description": "Сопроводительный текст"}},
        risky=True,
        confirm=lambda a: "Разослать коммерческие предложения ресторанам",
    )
)

register(
    Tool(
        name="collect_leads",
        description="Собрать новых B2B-лидов (рестораны, кафе) из внешних справочников.",
        run=collect_leads,
        departments=DEPTS,
        params={"city": {"type": "string", "description": "Город, по умолчанию из настроек"}},
    )
)

register(
    Tool(
        name="get_funnel",
        description="Состояние B2B-воронки: лиды, контакты, активные клиенты.",
        run=get_funnel,
        departments=DEPTS,
    )
)
