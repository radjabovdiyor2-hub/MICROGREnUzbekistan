import logging
from typing import Optional
from sqlalchemy import text
from aiogram import Bot

from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

_SEGMENTS = {
    "all": "TRUE",
    "b2b": "customer_type = 'b2b'",
    "b2c": "customer_type = 'b2c'",
    "vip": "status = 'vip'",
    "leads": "status = 'lead'",
    "stale_orders": (
        "id IN (SELECT customer_id FROM orders "
        "WHERE status = 'new' AND created_at < NOW() - INTERVAL '24 hours')"
    ),
    "inactive": (
        "(last_order_date IS NULL OR "
        "last_order_date < CURRENT_DATE - INTERVAL '30 days')"
    ),
}

async def _pick_customers(segment: str, limit: int) -> list:
    where = _SEGMENTS.get(segment, _SEGMENTS["all"])
    async with get_session_ctx() as s:
        res = await s.execute(
            text(
                f"SELECT id, name, telegram_id, email, phone FROM customers "
                f"WHERE {where} ORDER BY COALESCE(total_spent, 0) DESC LIMIT :lim"
            ),
            {"lim": limit},
        )
        return [
            {
                "id": r[0],
                "name": r[1],
                "telegram_id": r[2],
                "email": r[3],
                "phone": r[4],
            }
            for r in res.fetchall()
        ]

async def _log_interaction(customer_id: int, channel: str, summary: str, bot_name: str) -> None:
    try:
        async with get_session_ctx() as s:
            await s.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                    "VALUES (:cid, :ch, 'outreach', :bot, :sum)"
                ),
                {
                    "cid": customer_id,
                    "ch": channel,
                    "bot": bot_name,
                    "sum": summary[:200],
                },
            )
            await s.commit()
    except Exception as e:
        logger.warning(f"не записал interaction: {e}")

async def _sent_today() -> int:
    try:
        async with get_session_ctx() as s:
            res = await s.execute(
                text(
                    "SELECT COUNT(*) FROM interactions "
                    "WHERE interaction_type = 'outreach' AND DATE(created_at) = CURRENT_DATE"
                )
            )
            return int(res.scalar() or 0)
    except Exception:
        return 0

async def _reach(bot: Bot, cust: dict, message: str) -> str:
    if cust.get("telegram_id"):
        try:
            await bot.send_message(cust["telegram_id"], message)
            await _log_interaction(cust["id"], "telegram", message, "sales_bot")
            return "telegram"
        except Exception as e:
            logger.info(f"telegram недоступен для {cust['id']}: {e}")

    if cust.get("email"):
        try:
            from shared.email_sender import send_email
            ok = await send_email(cust["email"], "Microgreen Uzbekistan", message)
            if ok:
                await _log_interaction(cust["id"], "email", message, "sales_bot")
                return "email"
        except Exception as e:
            logger.info(f"email недоступен для {cust['id']}: {e}")

    return "need_call"

async def _create_human_task(title: str, description: str, dept: str = "sales") -> Optional[int]:
    try:
        async with get_session_ctx() as s:
            res = await s.execute(
                text(
                    "INSERT INTO tasks (title, description, department, status, priority) "
                    "VALUES (:t, :d, :dep, 'todo', 'high') RETURNING id"
                ),
                {"t": title[:100], "d": description, "dep": dept},
            )
            tid = res.scalar()
            await s.commit()
            return tid
    except Exception as e:
        logger.warning(f"не создал задачу человеку: {e}")
        return None

async def _bus(to_bot: str, action: str, params: dict, timeout: int = 120) -> Optional[dict]:
    from shared.bot_bus import send_task, get_result
    tid = await send_task("stepan_bot", to_bot, action, params)
    res = await get_result(tid, timeout=timeout)
    if res and res.get("status") == "done":
        return res.get("result") or {}
    if res and res.get("status") == "error":
        logger.warning(f"{to_bot}.{action} ошибка: {res.get('error')}")
    return None
