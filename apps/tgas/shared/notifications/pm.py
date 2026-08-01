import logging
from aiogram import Bot
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.utils import format_price
from shared.notifications.core import _admin_chat_id

logger = logging.getLogger(__name__)

async def pm_on_order_created(bot: Bot, payload: dict) -> None:
    data = payload.get("data", {})
    order_number = data.get("order_number", "N/A")
    total = data.get("total_amount", 0)
    items = data.get("items_summary", "")

    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "INSERT INTO tasks (title, assignee, department, status, priority, description, created_at) "
                "VALUES (:t, 'Производство', 'production', 'todo', 'high', :d, NOW()) RETURNING id"
            ),
            {
                "t": f"🛒 Заказ {order_number} — подготовить",
                "d": f"Заказ {order_number} на сумму {format_price(total)}.\n{items}",
            },
        )
        task_id = res.scalar()
        await session.commit()
    logger.info(f"PM: задача создана для заказа {order_number}")

    from shared.event_bus import event_bus

    await event_bus.publish(
        "TASK_CREATED",
        {
            "task_id": task_id,
            "title": f"🛒 Заказ {order_number} — подготовить",
            "department": "production",
            "description": f"Заказ {order_number} на сумму {format_price(total)}.\n{items}",
            "chat_id": _admin_chat_id(),
        },
        "stepan_bot",
    )

async def pm_on_complaint(bot: Bot, payload: dict) -> None:
    data = payload.get("data", {})
    summary = data.get("summary", "Нет описания")
    customer = data.get("customer_name", "Клиент")

    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "INSERT INTO tasks (title, assignee, department, status, priority, description, created_at) "
                "VALUES (:t, 'Менеджер', 'support', 'todo', 'urgent', :d, NOW()) RETURNING id"
            ),
            {"t": f"🚨 Жалоба от {customer}", "d": summary},
        )
        task_id = res.scalar()
        await session.commit()
    logger.info(f"PM: срочная задача для жалобы от {customer}")

    from shared.event_bus import event_bus

    await event_bus.publish(
        "TASK_CREATED",
        {
            "task_id": task_id,
            "title": f"🚨 Жалоба от {customer}",
            "department": "support",
            "description": summary,
            "chat_id": _admin_chat_id(),
        },
        "stepan_bot",
    )

async def pm_on_hr_application(bot: Bot, payload: dict) -> None:
    data = payload.get("data", {})
    name = data.get("name", "Кандидат")
    position = data.get("position", "")

    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "INSERT INTO tasks (title, assignee, department, status, priority, description, created_at) "
                "VALUES (:t, 'HR', 'hr', 'todo', 'medium', :d, NOW()) RETURNING id"
            ),
            {
                "t": f"👤 Кандидат: {name} — {position}",
                "d": f"Рассмотреть заявку от {name} на позицию {position}.",
            },
        )
        task_id = res.scalar()
        await session.commit()
    logger.info(f"PM: задача HR для {name}")

    from shared.event_bus import event_bus

    await event_bus.publish(
        "TASK_CREATED",
        {
            "task_id": task_id,
            "title": f"👤 Кандидат: {name} — {position}",
            "department": "hr",
            "description": f"Рассмотреть заявку от {name} на позицию {position}.",
            "chat_id": _admin_chat_id(),
        },
        "stepan_bot",
    )

def register_pm_handlers(event_bus, bot: Bot) -> None:
    from shared.event_bus import Events

    event_bus.on(Events.ORDER_CREATED, lambda p: pm_on_order_created(bot, p))
    event_bus.on(Events.COMPLAINT_RECEIVED, lambda p: pm_on_complaint(bot, p))
    event_bus.on(Events.APPLICATION_RECEIVED, lambda p: pm_on_hr_application(bot, p))
    logger.info("Степан (Менеджер): подписан на events (order, complaint, hr)")
