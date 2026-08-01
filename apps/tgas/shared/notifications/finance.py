import logging
from aiogram import Bot
from sqlalchemy import text
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

async def finance_on_order_created(bot: Bot, payload: dict) -> None:
    data = payload.get("data", {})
    order_number = data.get("order_number", "N/A")
    total = data.get("total_amount", 0)
    order_id = data.get("order_id")

    async with get_session_ctx() as session:
        await session.execute(
            text(
                "INSERT INTO finances (type, amount, category, description, related_order_id, date, created_at) "
                "VALUES ('income', :a, 'sales', :d, :oid, CURRENT_DATE, NOW())"
            ),
            {"a": total, "d": f"Заказ {order_number}", "oid": order_id},
        )
    logger.info(f"Finance: доход {total} от заказа {order_number}")

def register_finance_handlers(event_bus, bot: Bot) -> None:
    from shared.event_bus import Events

    event_bus.on(Events.ORDER_CREATED, lambda p: finance_on_order_created(bot, p))
    logger.info("Finance Bot: подписан на events (order)")
