from aiogram import Router
import os
import logging

router = Router()
logger = logging.getLogger(__name__)

ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "")  # Admin chat for notifications
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://microgreenuzbekistan.com/webapp")

# ==================== ORDER NOTIFICATIONS ====================

async def notify_admin_new_order(order_id: str, customer_name: str, phone: str, total: float, items_count: int):
    """Send notification to admin about new order"""
    from services.ecosystem_bridge import bridge
    
    message = (
        f"🛒 <b>Новый заказ #{order_id[-8:]}</b>\n\n"
        f"👤 {customer_name}\n"
        f"📱 {phone}\n"
        f"📦 Товаров: {items_count}\n"
        f"💰 Сумма: {total:,.0f} сум\n\n"
        f"⏰ Ожидает подтверждения"
    )
    
    try:
        await bridge.notify_admins(message)
    except Exception as e:
        logger.error(f"OrderNotify: Failed to send: {e}")


# Экраны «мои заказы» и «бонусы» отсюда убраны.
#
# Это были НЕДОСТИЖИМЫЕ близнецы: обработчики ждали `my_orders` и
# `bonuses`, а такие кнопки не рисовала ни одна клавиатура — меню шлёт
# `menu:orders` и `menu:bonuses`, и их обслуживает `unified.py`. Два
# экрана про одно и то же расходились текстом и клавиатурой, и правка
# живого всегда обходила мёртвого стороной.
#
# В файле остаётся то, ради чего он и нужен, — уведомление менеджеру
# о новом заказе.
