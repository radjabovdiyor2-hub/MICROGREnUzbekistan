"""
🌱 MICROGREEN UZBEKISTAN — ADMIN PANEL

Админ-панель с полным контролем:
- Управление заказами
- Рассылка сообщений
- Статистика
- Настройки
"""

from aiogram import Router, F, Bot
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.filters import Command
import os
import httpx
import logging
from datetime import datetime

from services.ecosystem_bridge import bridge

router = Router()
logger = logging.getLogger(__name__)

# Admin User IDs — from .env (comma-separated)
ADMIN_IDS = [int(x.strip()) for x in os.getenv("ADMIN_CHAT_ID", "847872669").split(",") if x.strip()]
ORDER_GROUP_ID = os.getenv("ORDER_GROUP_ID", "@mcgprdj")
WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")

def _api_headers() -> dict:
    """Auth headers for Web API calls"""
    headers = {}
    if BOT_SECRET:
        headers["Authorization"] = f"Bearer {BOT_SECRET}"
    return headers


def is_admin(user_id: int) -> bool:
    """Check if user is admin"""
    return user_id in ADMIN_IDS


def get_admin_keyboard() -> InlineKeyboardMarkup:
    """Main admin menu keyboard"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📦 Заказы", callback_data="admin:orders"),
            InlineKeyboardButton(text="📊 Статистика", callback_data="admin:stats"),
        ],
        [
            InlineKeyboardButton(text="📣 Рассылка", callback_data="admin:broadcast"),
            InlineKeyboardButton(text="🛍️ Товары", callback_data="admin:products"),
        ],
        [
            InlineKeyboardButton(text="⚙️ Настройки", callback_data="admin:settings"),
            InlineKeyboardButton(text="👥 Пользователи", callback_data="admin:users"),
        ],
        [
            InlineKeyboardButton(text="🔄 Обновить", callback_data="admin:refresh"),
        ],
    ])


@router.message(Command("admin"))
async def cmd_admin(message: Message):
    """Admin panel entry point"""
    if not is_admin(message.from_user.id):
        await message.answer("⛔ У вас нет доступа к админ-панели.")
        return
    
    now = datetime.now().strftime("%d.%m.%Y %H:%M")
    
    await message.answer(
        f"🔐 <b>Админ-панель Microgreen Uzbekistan</b>\n\n"
        f"👤 ID: <code>{message.from_user.id}</code>\n"
        f"🕐 {now}\n\n"
        f"Выберите раздел:",
        reply_markup=get_admin_keyboard()
    )


@router.callback_query(F.data == "admin:orders")
async def admin_orders(callback: CallbackQuery):
    """View recent orders"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return
    
    # Fetch orders from Web API
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{WEB_API_URL}/admin/orders?limit=5",
                headers=_api_headers()
            )
            if resp.status_code == 200:
                data = resp.json()
                orders = data.get("orders", [])
            else:
                logger.error(f"Admin orders API returned {resp.status_code}: {resp.text[:200]}")
                orders = []
    except Exception as e:
        logger.error(f"Admin orders fetch error: {e}")
        orders = []
    
    if orders:
        text = "📦 <b>Последние заказы:</b>\n\n"
        for order in orders[:5]:
            status_emoji = {"PENDING": "🟡", "CONFIRMED": "🟢", "DELIVERED": "✅", "CANCELLED": "🔴"}.get(order.get("status"), "⚪")
            text += f"{status_emoji} #{order['id'][-6:]} — {order.get('total', 0):,.0f} сум\n"
    else:
        text = "📦 <b>Заказы</b>\n\nПока нет заказов."
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔄 Обновить", callback_data="admin:orders")],
        [InlineKeyboardButton(text="« Назад", callback_data="admin:back")],
    ])
    
    try:
        await callback.message.edit_text(text, reply_markup=keyboard, parse_mode="HTML")
    except Exception:
        pass  # Message not modified
    await callback.answer()


@router.callback_query(F.data == "admin:stats")
async def admin_stats(callback: CallbackQuery):
    """View statistics"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return
    
    # Fetch stats from Web API
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{WEB_API_URL}/admin/stats",
                headers=_api_headers()
            )
            if resp.status_code == 200:
                stats = resp.json()
            else:
                logger.error(f"Admin stats API returned {resp.status_code}: {resp.text[:200]}")
                stats = {}
    except Exception as e:
        logger.error(f"Admin stats fetch error: {e}")
        stats = {}
    
    text = (
        "📊 <b>Статистика</b>\n\n"
        f"👥 Пользователей: <b>{stats.get('users', 0)}</b>\n"
        f"📦 Заказов: <b>{stats.get('orders', 0)}</b>\n"
        f"🛍️ Товаров: <b>{stats.get('products', 158)}</b>\n"
        f"💰 Выручка: <b>{stats.get('revenue', 0):,.0f}</b> сум\n\n"
        f"📈 Сегодня: +{stats.get('todayOrders', 0)} заказов"
    )
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔄 Обновить", callback_data="admin:stats")],
        [InlineKeyboardButton(text="« Назад", callback_data="admin:back")],
    ])
    
    await callback.message.edit_text(text, reply_markup=keyboard)
    await callback.answer()


@router.callback_query(F.data == "admin:broadcast")
async def admin_broadcast(callback: CallbackQuery):
    """Broadcast message setup"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📢 В канал", callback_data="broadcast:channel")],
        [InlineKeyboardButton(text="👥 В группу", callback_data="broadcast:group")],
        [InlineKeyboardButton(text="📱 Всем пользователям", callback_data="broadcast:users")],
        [InlineKeyboardButton(text="« Назад", callback_data="admin:back")],
    ])
    
    await callback.message.edit_text(
        "📣 <b>Рассылка</b>\n\n"
        "Выберите куда отправить сообщение:",
        reply_markup=keyboard
    )
    await callback.answer()


@router.callback_query(F.data == "admin:products")
async def admin_products(callback: CallbackQuery):
    """Products management"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➕ Добавить товар", callback_data="products:add")],
        [InlineKeyboardButton(text="📋 Список товаров", url="https://microgreenuzbekistan.com/admin")],
        [InlineKeyboardButton(text="« Назад", callback_data="admin:back")],
    ])
    
    await callback.message.edit_text(
        "🛍️ <b>Управление товарами</b>\n\n"
        "• 158 товаров в каталоге\n"
        "• Управляйте через веб-админку\n\n"
        "🌐 microgreenuzbekistan.com/admin",
        reply_markup=keyboard
    )
    await callback.answer()


@router.callback_query(F.data.startswith("broadcast:") & ~F.data.in_({"broadcast:confirm", "broadcast:abort"}))
async def handle_broadcast_target(callback: CallbackQuery):
    """Select broadcast target and enter text input mode"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return
    
    target = callback.data.split(":")[1]
    labels = {"channel": "канал", "group": "группу", "users": "пользователям"}
    
    # Store broadcast state
    _broadcast_state[callback.from_user.id] = {"target": target, "step": "awaiting_text"}
    
    await callback.message.edit_text(
        f"📣 <b>Рассылка в {labels.get(target, target)}</b>\n\n"
        f"Отправьте текст сообщения для рассылки.\n\n"
        f"⚠️ Поддерживается HTML-разметка:\n"
        f"<code>&lt;b&gt;жирный&lt;/b&gt;</code>\n"
        f"<code>&lt;i&gt;курсив&lt;/i&gt;</code>\n\n"
        f"Или отправьте /cancel для отмены.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="❌ Отмена", callback_data="admin:broadcast")],
        ]),
        parse_mode="HTML"
    )
    await callback.answer()


# Broadcast state storage (in-memory, admin-only)
_broadcast_state: dict = {}


@router.message(Command("broadcast"))
async def cmd_broadcast(message: Message):
    """Admin broadcast command: /broadcast <text>"""
    if not is_admin(message.from_user.id):
        return
    
    text = message.text.replace("/broadcast", "", 1).strip()
    if not text:
        await message.answer(
            "📣 <b>Рассылка</b>\n\n"
            "Используйте: <code>/broadcast Текст сообщения</code>\n\n"
            "Или нажмите кнопку ниже для выбора канала:",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="📢 В канал", callback_data="broadcast:channel")],
                [InlineKeyboardButton(text="👥 В группу", callback_data="broadcast:group")],
            ]),
            parse_mode="HTML"
        )
        return
    
    # Quick broadcast to channel
    from services.crosspost_service import crosspost, CrossPost, Platform
    
    post = CrossPost(
        title="📢 Объявление",
        body=text,
        platforms=[Platform.CHANNEL]
    )
    
    result = await crosspost.publish(post)
    
    if result.get("channel", {}).get("success"):
        await message.answer("✅ Сообщение отправлено в канал!")
    else:
        error = result.get("channel", {}).get("error", "Неизвестная ошибка")
        await message.answer(f"❌ Ошибка: {error}")


@router.message(F.text, lambda msg: msg.from_user.id in _broadcast_state)
async def handle_broadcast_text(message: Message):
    """Receive broadcast text from admin in FSM mode"""
    user_id = message.from_user.id
    
    if not is_admin(user_id):
        return  # Not an admin
    
    state = _broadcast_state[user_id]
    
    if state.get("step") == "awaiting_text":
        text = message.text.strip()
        target = state["target"]
        
        # Store and ask for confirmation
        _broadcast_state[user_id] = {
            "target": target,
            "text": text,
            "step": "confirm"
        }
        
        labels = {"channel": "📢 канал @MicrogreenUzbekistan", "group": "👥 группу", "users": "📱 всем пользователям"}
        
        await message.answer(
            f"📋 <b>Подтвердите рассылку</b>\n\n"
            f"📌 Куда: <b>{labels.get(target, target)}</b>\n\n"
            f"📝 Текст:\n{text}\n\n"
            f"Отправить?",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="✅ Отправить", callback_data="broadcast:confirm"),
                    InlineKeyboardButton(text="❌ Отмена", callback_data="broadcast:abort"),
                ],
            ]),
            parse_mode="HTML"
        )
        return


@router.callback_query(F.data == "broadcast:confirm")
async def confirm_broadcast(callback: CallbackQuery):
    """Confirm and execute broadcast"""
    user_id = callback.from_user.id
    if not is_admin(user_id) or user_id not in _broadcast_state:
        await callback.answer("⛔ Нет активной рассылки", show_alert=True)
        return
    
    state = _broadcast_state.pop(user_id)
    target = state.get("target", "channel")
    text = state.get("text", "")
    
    if not text:
        await callback.answer("❌ Пустое сообщение", show_alert=True)
        return
    
    from services.crosspost_service import crosspost, CrossPost, Platform

    platform_map = {
        "channel": [Platform.CHANNEL],
        "group": [Platform.GROUP],
        "users": [Platform.CHANNEL, Platform.GROUP],
    }
    
    post = CrossPost(
        title="",
        body=text,
        platforms=platform_map.get(target, [Platform.CHANNEL])
    )
    
    result = await crosspost.publish(post)
    
    success_count = sum(1 for r in result.values() if r.get("success"))
    
    try:
        await callback.message.edit_text(
            f"✅ <b>Рассылка завершена!</b>\n\n"
            f"📤 Отправлено: {success_count}/{len(result)} платформ",
            parse_mode="HTML"
        )
    except Exception:
        pass
    await callback.answer("✅ Отправлено!")


@router.callback_query(F.data == "broadcast:abort")
async def abort_broadcast(callback: CallbackQuery):
    """Cancel broadcast"""
    _broadcast_state.pop(callback.from_user.id, None)
    try:
        await callback.message.edit_text("❌ Рассылка отменена.")
    except Exception:
        pass
    await callback.answer()


@router.callback_query(F.data == "products:add")
async def handle_products_add(callback: CallbackQuery):
    """Products add placeholder"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return
    
    await callback.message.edit_text(
        "➕ <b>Добавить товар</b>\n\n"
        "Добавление товаров через веб-админку:\n"
        "🌐 microgreenuzbekistan.com/admin\n\n"
        "⚠️ Добавление через бота в разработке.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🌐 Веб-админка", url="https://microgreenuzbekistan.com/admin")],
            [InlineKeyboardButton(text="« Назад", callback_data="admin:products")],
        ]),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "admin:settings")
async def admin_settings(callback: CallbackQuery):
    """Bot settings"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🌐 Веб-админка", url="https://microgreenuzbekistan.com/admin")],
        [InlineKeyboardButton(text="« Назад", callback_data="admin:back")],
    ])
    
    await callback.message.edit_text(
        "⚙️ <b>Настройки</b>\n\n"
        f"👤 Admin ID: <code>847872669</code>\n"
        f"📢 Группа заказов: <code>{ORDER_GROUP_ID}</code>\n\n"
        "Основные настройки в веб-админке.",
        reply_markup=keyboard
    )
    await callback.answer()


@router.callback_query(F.data == "admin:users")
async def admin_users(callback: CallbackQuery):
    """Users management"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🌐 Все пользователи", url="https://microgreenuzbekistan.com/admin")],
        [InlineKeyboardButton(text="« Назад", callback_data="admin:back")],
    ])
    
    await callback.message.edit_text(
        "👥 <b>Пользователи</b>\n\n"
        "Управление пользователями через веб-админку.\n\n"
        "🌐 microgreenuzbekistan.com/admin",
        reply_markup=keyboard
    )
    await callback.answer()


@router.callback_query(F.data == "admin:back")
async def admin_back(callback: CallbackQuery):
    """Back to admin menu"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return
    
    try:
        await callback.message.edit_text(
            "🔐 <b>Админ-панель</b>\n\nВыберите раздел:",
            reply_markup=get_admin_keyboard()
        )
    except Exception:
        pass  # Message already shows admin menu
    await callback.answer()


@router.callback_query(F.data == "admin:refresh")
async def admin_refresh(callback: CallbackQuery):
    """Refresh admin panel"""
    await callback.answer("✅ Обновлено")
    await admin_back(callback)


# ==================== ORDER NOTIFICATION SYSTEM ====================

async def send_order_to_group(bot: Bot, order_data: dict):
    """Send new order notification to admin group"""
    full_order_id = order_data.get("id", "N/A")
    short_id = full_order_id[-8:]  # For display only
    customer = order_data.get("customerName", "Клиент")
    phone = order_data.get("phone", "Не указан")
    total = order_data.get("total", 0)
    items = order_data.get("items", [])
    address = order_data.get("address", "Не указан")
    
    items_text = "\n".join([f"  • {item.get('title', 'Товар')} x{item.get('quantity', 1)}" for item in items[:5]])
    if len(items) > 5:
        items_text += f"\n  ... и ещё {len(items) - 5} позиций"
    
    text = (
        f"🛒 <b>НОВЫЙ ЗАКАЗ #{short_id}</b>\n\n"
        f"👤 {customer}\n"
        f"📱 {phone}\n"
        f"📍 {address}\n\n"
        f"<b>Товары:</b>\n{items_text}\n\n"
        f"💰 <b>Итого: {total:,.0f} сум</b>\n\n"
        f"⏰ {datetime.now().strftime('%d.%m.%Y %H:%M')}"
    )
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Подтвердить", callback_data=f"order:confirm:{full_order_id}"),
            InlineKeyboardButton(text="❌ Отменить", callback_data=f"order:cancel:{full_order_id}"),
        ],
    ])
    
    # Send to order group
    if ORDER_GROUP_ID:
        try:
            await bot.send_message(ORDER_GROUP_ID, text, reply_markup=keyboard, parse_mode="HTML")
        except Exception as e:
            logger.error(f"Failed to send to group: {e}")
    
    # Send to admin
    for admin_id in ADMIN_IDS:
        try:
            await bot.send_message(admin_id, text, reply_markup=keyboard, parse_mode="HTML")
        except Exception as e:
            logger.error(f"Failed to send to admin {admin_id}: {e}")


@router.callback_query(F.data.startswith("order:confirm:"))
async def confirm_order(callback: CallbackQuery):
    """Confirm order"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Только для админов", show_alert=True)
        return
    
    order_id = callback.data.split(":")[-1]
    
    # Update order status via API (PUT, not PATCH!)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.put(
                f"{WEB_API_URL}/admin/orders/{order_id}",
                json={"status": "CONFIRMED"},
                headers=_api_headers()
            )
            if resp.status_code != 200:
                logger.error(f"Confirm order {order_id} failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Confirm order error: {e}")
    
    # Уведомить Степана-менеджера
    try:
        await bridge.notify_stepan(
            f"✅ <b>Заказ подтверждён!</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"🆔 Заказ: <code>{order_id[-8:]}</code>\n"
            f"👤 Подтвердил: {callback.from_user.full_name}\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"📋 Статус: CONFIRMED → Готовить к отправке"
        )
    except Exception as e:
        logger.error(f"Failed to notify Stepan on confirm: {e}")
    
    try:
        await callback.message.edit_text(
            callback.message.text + "\n\n✅ <b>ПОДТВЕРЖДЁН</b>",
            reply_markup=None,
            parse_mode="HTML"
        )
    except Exception:
        pass
    await callback.answer("✅ Заказ подтверждён!")


@router.callback_query(F.data.startswith("order:cancel:"))
async def cancel_order(callback: CallbackQuery):
    """Cancel order"""
    if not is_admin(callback.from_user.id):
        await callback.answer("⛔ Только для админов", show_alert=True)
        return
    
    order_id = callback.data.split(":")[-1]
    
    # Update order status via API (PUT, not PATCH!)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.put(
                f"{WEB_API_URL}/admin/orders/{order_id}",
                json={"status": "CANCELLED"},
                headers=_api_headers()
            )
            if resp.status_code != 200:
                logger.error(f"Cancel order {order_id} failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Cancel order error: {e}")
    
    # Уведомить Степана-менеджера
    try:
        await bridge.notify_stepan(
            f"❌ <b>Заказ отменён!</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"🆔 Заказ: <code>{order_id[-8:]}</code>\n"
            f"👤 Отменил: {callback.from_user.full_name}\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"📋 Статус: CANCELLED"
        )
    except Exception as e:
        logger.error(f"Failed to notify Stepan on cancel: {e}")
    
    try:
        await callback.message.edit_text(
            callback.message.text + "\n\n❌ <b>ОТМЕНЁН</b>",
            reply_markup=None,
            parse_mode="HTML"
        )
    except Exception:
        pass
    await callback.answer("❌ Заказ отменён")
