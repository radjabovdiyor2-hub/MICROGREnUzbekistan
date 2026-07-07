"""
Shared Cross-Bot Notifications — Уведомления между ботами.

Содержит функции-обработчики событий, которые вызываются EventBus.
Каждый бот регистрирует нужные обработчики при старте.
"""
import logging
from aiogram import Bot
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.utils import format_price

logger = logging.getLogger(__name__)


async def notify_admin(bot: Bot, admin_ids: list, text_msg: str):
    """Отправить уведомление всем админам."""
    for admin_id in admin_ids:
        try:
            await bot.send_message(admin_id, text_msg)
        except Exception as e:
            logger.error(f"Не удалось отправить уведомление админу {admin_id}: {e}")


# ─── PM Bot обработчики ────────────────────────────────────

async def pm_on_order_created(bot: Bot, payload: dict):
    """Новый заказ → создать задачу на производство."""
    data = payload.get("data", {})
    order_number = data.get("order_number", "N/A")
    total = data.get("total_amount", 0)
    items = data.get("items_summary", "")

    async with get_session_ctx() as session:
        await session.execute(text(
            "INSERT INTO tasks (title, assignee, department, status, priority, description, created_at) "
            "VALUES (:t, 'Производство', 'production', 'todo', 'high', :d, NOW())"),
            {"t": f"🛒 Заказ {order_number} — подготовить",
             "d": f"Заказ {order_number} на сумму {format_price(total)}.\n{items}"})
    logger.info(f"PM: задача создана для заказа {order_number}")


async def pm_on_complaint(bot: Bot, payload: dict):
    """Жалоба → создать срочную задачу."""
    data = payload.get("data", {})
    summary = data.get("summary", "Нет описания")
    customer = data.get("customer_name", "Клиент")

    async with get_session_ctx() as session:
        await session.execute(text(
            "INSERT INTO tasks (title, assignee, department, status, priority, description, created_at) "
            "VALUES (:t, 'Менеджер', 'support', 'todo', 'urgent', :d, NOW())"),
            {"t": f"🚨 Жалоба от {customer}",
             "d": summary})
    logger.info(f"PM: срочная задача для жалобы от {customer}")


async def pm_on_hr_application(bot: Bot, payload: dict):
    """HR заявка → задача для HR."""
    data = payload.get("data", {})
    name = data.get("name", "Кандидат")
    position = data.get("position", "")

    async with get_session_ctx() as session:
        await session.execute(text(
            "INSERT INTO tasks (title, assignee, department, status, priority, description, created_at) "
            "VALUES (:t, 'HR', 'hr', 'todo', 'medium', :d, NOW())"),
            {"t": f"👤 Кандидат: {name} — {position}",
             "d": f"Рассмотреть заявку от {name} на позицию {position}."})
    logger.info(f"PM: задача HR для {name}")


# ─── Finance Bot обработчики ───────────────────────────────

async def finance_on_order_created(bot: Bot, payload: dict):
    """Новый заказ → записать ожидаемый доход."""
    data = payload.get("data", {})
    order_number = data.get("order_number", "N/A")
    total = data.get("total_amount", 0)
    order_id = data.get("order_id")

    async with get_session_ctx() as session:
        await session.execute(text(
            "INSERT INTO finances (type, amount, category, description, related_order_id, date, created_at) "
            "VALUES ('income', :a, 'sales', :d, :oid, CURRENT_DATE, NOW())"),
            {"a": total, "d": f"Заказ {order_number}", "oid": order_id})
    logger.info(f"Finance: доход {total} от заказа {order_number}")


# ─── Analytics Bot обработчики ─────────────────────────────

async def analytics_on_order_created(bot: Bot, payload: dict):
    """Логируем взаимодействие для аналитики."""
    data = payload.get("data", {})
    customer_id = data.get("customer_id")
    if customer_id:
        async with get_session_ctx() as session:
            await session.execute(text(
                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                "VALUES (:cid, 'telegram', 'order', 'sales_bot', :s, NOW())"),
                {"cid": customer_id, "s": f"Заказ {data.get('order_number', 'N/A')}"})
    logger.info("Analytics: взаимодействие записано")


def register_pm_handlers(event_bus, bot: Bot):
    """Регистрирует все обработчики событий PM бота."""
    from shared.event_bus import Events

    event_bus.on(Events.ORDER_CREATED, lambda p: pm_on_order_created(bot, p))
    event_bus.on(Events.COMPLAINT_RECEIVED, lambda p: pm_on_complaint(bot, p))
    event_bus.on(Events.APPLICATION_RECEIVED, lambda p: pm_on_hr_application(bot, p))
    logger.info("PM Bot: подписан на events (order, complaint, hr)")


def register_finance_handlers(event_bus, bot: Bot):
    """Регистрирует все обработчики событий Finance бота."""
    from shared.event_bus import Events

    event_bus.on(Events.ORDER_CREATED, lambda p: finance_on_order_created(bot, p))
    logger.info("Finance Bot: подписан на events (order)")


def register_analytics_handlers(event_bus, bot: Bot):
    """Регистрирует все обработчики событий Analytics бота."""
    from shared.event_bus import Events

    event_bus.on(Events.ORDER_CREATED, lambda p: analytics_on_order_created(bot, p))
    logger.info("Analytics Bot: подписан на events (order)")


