import logging
from aiogram import Bot
from sqlalchemy import text
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

async def analytics_on_order_created(bot: Bot, payload: dict) -> None:
    data = payload.get("data", {})
    customer_id = data.get("customer_id")
    if customer_id:
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                    "VALUES (:cid, 'telegram', 'order', 'sales_bot', :s, NOW())"
                ),
                {"cid": customer_id, "s": f"Заказ {data.get('order_number', 'N/A')}"},
            )
    logger.info("Analytics: взаимодействие записано")

def register_analytics_handlers(event_bus, bot: Bot) -> None:
    from shared.event_bus import Events

    event_bus.on(Events.ORDER_CREATED, lambda p: analytics_on_order_created(bot, p))
    logger.info("Analytics Bot: подписан на events (order)")
