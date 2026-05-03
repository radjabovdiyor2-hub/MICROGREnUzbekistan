from aiogram import Router, F
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
import httpx
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


# ==================== USER ORDER COMMANDS ====================

@router.callback_query(F.data == "my_orders")
async def show_orders(callback: CallbackQuery):
    """Show user's orders"""
    from services.ecosystem_bridge import bridge

    try:
        orders = await bridge.get_orders_by_telegram_id(callback.from_user.id)
    except Exception as e:
        orders = []

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🛒 Сделать заказ", web_app=WebAppInfo(url=WEB_APP_URL))],
        [InlineKeyboardButton(text="« Назад", callback_data="menu:main")],
    ])

    if not orders:
        await callback.message.edit_text(
            "📦 <b>Мои заказы</b>\n\n"
            "У вас пока нет активных заказов.\n"
            "Нажмите кнопку ниже чтобы сделать первый заказ!",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
        await callback.answer()
        return

    # Show last 5 orders
    text = "📦 <b>Мои последние заказы</b>\n\n"
    for order in orders[:5]:
        status_map = {
            "PENDING": "⏳ Ожидает",
            "CONFIRMED": "✅ Подтверждён",
            "PROCESSING": "📦 Собирается",
            "SHIPPED": "🚚 В пути",
            "DELIVERED": "🎉 Доставлен",
            "CANCELLED": "❌ Отменён"
        }
        status = status_map.get(order.get("status"), order.get("status"))
        total = int(order.get("total", 0))
        items_count = len(order.get("items", []))
        
        text += (
            f"<b>Заказ #{order.get('id')[-6:]}</b>\n"
            f"Статус: {status}\n"
            f"Сумма: {total:,.0f} сум ({items_count} поз.)\n"
            f"───────────────\n"
        )

    await callback.message.edit_text(text, reply_markup=keyboard, parse_mode="HTML")
    await callback.answer()





@router.callback_query(F.data == "bonuses")
async def show_bonuses(callback: CallbackQuery):
    """Show user's bonuses"""
    from services.ecosystem_bridge import bridge
    
    bonuses = await bridge.get_user_bonuses(callback.from_user.id)
    bonus_value = f"{bonuses:,}".replace(",", " ")
    discount = f"{(bonuses // 100) * 1000:,}".replace(",", " ")
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎮 Farm Simulator", url="https://t.me/Microgreenuzbekistan_bot/game")],
        [InlineKeyboardButton(text="« Назад", callback_data="menu:main")],
    ])
    
    await callback.message.edit_text(
        "💎 <b>Мои бонусы</b>\n\n"
        f"🎁 Баланс: <b>{bonus_value} баллов</b>\n"
        f"= {discount} сум скидки\n\n"
        "📈 <b>Как заработать:</b>\n"
        "• +10% от суммы заказа\n"
        "• +100 за приглашённого друга\n"
        "• +50 за отзыв с фото\n"
        "• 🎮 Играйте в Farm Simulator!",
        reply_markup=keyboard,
        parse_mode="HTML"
    )
    await callback.answer()
