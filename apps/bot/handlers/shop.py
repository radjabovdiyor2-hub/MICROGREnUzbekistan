"""
🛒 PREMIUM SHOP HANDLER — World-Class Grid Layout

Features:
- Grid View: 4 items per page with number buttons (1️⃣ 2️⃣ 3️⃣ 4️⃣)
- Detailed View: Multi-photo gallery, full description
- Navigation: Seamless transitions + Home Button everywhere
- Cart & Checkout: Full e-commerce flow
"""

from aiogram import Router, F
from aiogram.types import (
    Message, CallbackQuery, 
    InlineKeyboardMarkup, InlineKeyboardButton,
    InputMediaPhoto,
    ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove,
    ContentType
)
from aiogram.filters import Command
import httpx
import os
import logging
import math

from services.ecosystem_bridge import bridge
from services.cart_storage import cart_storage
from shared.constants import CATEGORY_TUPLES as CATEGORIES, CATEGORY_LABELS, format_price

router = Router()
logger = logging.getLogger(__name__)

WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
WEB_URL = os.getenv("WEB_URL", "https://microgreenuzbekistan.com")
ITEMS_PER_PAGE = 4

# CATEGORIES imported from shared.constants as CATEGORY_TUPLES

# Cart storage — persisted to JSON file (survives bot restarts)
# See services/cart_storage.py for implementation


async def fetch_products(category: str = None) -> list:
    """Fetch products from API"""
    try:
        url = f"{WEB_API_URL}/products"
        if category:
            url += f"?category={category}"
        
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                products = response.json()
                if category:
                    products = [p for p in products if p.get("category") == category]
                return products
    except Exception as e:
        logger.error(f"Failed to fetch products: {e}")
    return []


# format_price imported from shared.constants


def get_product_images(product: dict, category: str) -> list[str]:
    """Return product's actual image(s) only — no stock photos"""
    main_image = product.get("image", "/images/logo.jpg")
    if main_image.startswith("/"):
        main_image = f"{WEB_URL}{main_image}"
    return [main_image]


# ==================== KEYBOARDS & LAYOUTS ====================

def get_grid_keyboard(category: str, page: int, total_pages: int, page_items_count: int) -> InlineKeyboardMarkup:
    buttons = []
    
    # 1. Number Selection Row [1] [2] [3] [4]
    num_row = []
    for i in range(page_items_count):
        # Calculate absolute product index
        abs_index = (page * ITEMS_PER_PAGE) + i
        num_row.append(InlineKeyboardButton(
            text=f"{i+1}️⃣", 
            callback_data=f"shop:product:{category}:{abs_index}:0" # 0 is initial photo_idx
        ))
    buttons.append(num_row)
    
    # 2. Pagination Row [ < ] [ Page ] [ > ]
    nav_row = []
    if page > 0:
        nav_row.append(InlineKeyboardButton(text="⬅️", callback_data=f"shop:grid:{category}:{page - 1}"))
    
    nav_row.append(InlineKeyboardButton(text=f"📄 {page + 1}/{total_pages}", callback_data="noop"))
    
    if page < total_pages - 1:
        nav_row.append(InlineKeyboardButton(text="➡️", callback_data=f"shop:grid:{category}:{page + 1}"))
    buttons.append(nav_row)
    
    # 3. Action Buttons with HOME
    buttons.append([
        InlineKeyboardButton(text="« Категории", callback_data="shop:categories"),
        InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main"),
    ])
    buttons.append([
        InlineKeyboardButton(text="🛒 Корзина", callback_data="cart:view"),
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_product_keyboard(product: dict, idx: int, total: int, category: str, photo_idx: int, photo_total: int) -> InlineKeyboardMarkup:
    product_id = product.get("id", "")
    buttons = []
    
    # 1. Gallery Controls
    if photo_total > 1:
        prev_photo = photo_idx - 1 if photo_idx > 0 else photo_total - 1
        next_photo = photo_idx + 1 if photo_idx < photo_total - 1 else 0
        buttons.append([
            InlineKeyboardButton(text="⬅️ Фото", callback_data=f"shop:product:{category}:{idx}:{prev_photo}"),
            InlineKeyboardButton(text=f"[{photo_idx + 1}/{photo_total}]", callback_data="noop"),
            InlineKeyboardButton(text="Фото ➡️", callback_data=f"shop:product:{category}:{idx}:{next_photo}"),
        ])
    
    # 2. Add to Cart
    buttons.append([
        InlineKeyboardButton(text="🛒 В корзину", callback_data=f"cart:add:{product_id}"),
        InlineKeyboardButton(text="🌐 На сайте", url=f"{WEB_URL}/shop"),
    ])
    
    # 3. Navigation with HOME
    # Calculate which grid page this product belongs to
    grid_page = idx // ITEMS_PER_PAGE
    
    buttons.append([
        InlineKeyboardButton(text="« Назад в каталог", callback_data=f"shop:grid:{category}:{grid_page}"),
        InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main"),
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)


# ==================== HANDLERS ====================

@router.message(Command("shop", "catalog"))
async def cmd_shop(message: Message):
    await show_categories(message)

async def show_categories(message: Message):
    buttons = []
    row = []
    for key, (emoji, name) in CATEGORIES.items():
        row.append(InlineKeyboardButton(text=f"{emoji} {name}", callback_data=f"shop:grid:{key}:0"))
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row: buttons.append(row)
    
    buttons.append([
        InlineKeyboardButton(text="🛒 Корзина", callback_data="cart:view"),
        InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main"),
    ])
    
    await message.answer(
        "🛒 <b>Магазин AgroTech Ecosystem</b>\nКоснитесь категории:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML"
    )

@router.callback_query(F.data == "shop:categories")
async def cb_categories_list(callback: CallbackQuery):
    await callback.message.delete()
    await show_categories(callback.message)


# GRID VIEW HANDLER
@router.callback_query(F.data.startswith("shop:grid:"))
async def cb_grid_view(callback: CallbackQuery):
    parts = callback.data.split(":")
    category = parts[2]
    page = int(parts[3])
    
    products = await fetch_products(category)
    if not products:
        await callback.answer("Нет товаров", show_alert=True)
        return

    # Pagination logic
    total_products = len(products)
    total_pages = math.ceil(total_products / ITEMS_PER_PAGE)
    
    start_idx = page * ITEMS_PER_PAGE
    end_idx = start_idx + ITEMS_PER_PAGE
    page_products = products[start_idx:end_idx]
    
    # Text Generation
    cat_emoji, cat_name = CATEGORIES.get(category, ("📦", category))
    text = f"<b>{cat_emoji} {cat_name}</b> (Стр {page + 1}/{total_pages})\n\n"
    
    for i, p in enumerate(page_products):
        price = format_price(int(p.get("price", 0)))
        title = p.get('title', 'Товар')
        text += f"<b>{i + 1}️⃣ {title}</b>\n💰 {price} сум\n\n"
        
    text += "👇 <i>Нажмите номер для просмотра фото</i>"

    # Image
    cover_image = page_products[0].get("image") if page_products else None
    if cover_image and cover_image.startswith("/"): cover_image = f"{WEB_URL}{cover_image}"
    if not cover_image: cover_image = "https://microgreenuzbekistan.com/images/logo.jpg"

    kb = get_grid_keyboard(category, page, total_pages, len(page_products))
    
    try:
        await callback.message.edit_media(
            media=InputMediaPhoto(media=cover_image, caption=text, parse_mode="HTML"),
            reply_markup=kb
        )
    except Exception as e:
        logger.warning(f"grid_view edit_media failed: {e}")
        await callback.message.delete()
        await callback.message.answer_photo(
            photo=cover_image, caption=text, reply_markup=kb, parse_mode="HTML"
        )
    await callback.answer()


# DETAILED PRODUCT VIEW HANDLER
@router.callback_query(F.data.startswith("shop:product:"))
async def cb_product_view(callback: CallbackQuery):
    parts = callback.data.split(":")
    category = parts[2]
    idx = int(parts[3])
    photo_idx = int(parts[4]) if len(parts) > 4 else 0
    
    products = await fetch_products(category)
    if not products or idx >= len(products):
        await callback.answer("Товар не найден", show_alert=True)
        return

    product = products[idx]
    images = get_product_images(product, category)
    
    # Ensure indices range
    photo_idx = max(0, min(photo_idx, len(images) - 1))
    image_url = images[photo_idx]
    
    # Caption
    title = product.get("title")
    price = format_price(int(product.get("price", 0)))
    desc = product.get("description", "")
    
    caption = (
        f"📦 <b>{title}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"💰 <b>{price} сум</b>\n\n"
        f"{desc}\n\n"
        f"📸 Фото {photo_idx + 1} из {len(images)}"
    )
    
    kb = get_product_keyboard(product, idx, len(products), category, photo_idx, len(images))
    
    try:
        await callback.message.edit_media(
            media=InputMediaPhoto(media=image_url, caption=caption, parse_mode="HTML"),
            reply_markup=kb
        )
    except Exception as e:
        logger.warning(f"product_view edit_media failed: {e}")
        await callback.message.delete()
        await callback.message.answer_photo(
            photo=image_url, caption=caption, reply_markup=kb, parse_mode="HTML"
        )
    await callback.answer()


# CART HANDLERS
@router.callback_query(F.data.startswith("cart:add:"))
async def cb_add_cart(callback: CallbackQuery):
    prod_id = callback.data.split(":")[2]
    user_id = callback.from_user.id
    
    # Fetch single product instead of entire catalog
    try:
        product = await bridge.get_product(prod_id)
    except Exception:
        product = None
    
    if product:
        cart_storage.add_to_cart(user_id, product)
        await callback.answer("✅ Добавлено в корзину!", show_alert=True)
    else:
        await callback.answer("Ошибка — товар не найден", show_alert=True)

@router.callback_query(F.data == "cart:view")
async def cb_view_cart(callback: CallbackQuery):
    user_id = callback.from_user.id
    cart = cart_storage.get_cart(user_id)
    if not cart:
        await callback.answer("Корзина пуста", show_alert=True)
        return
        
    total = sum(int(p.get("price", 0)) for p in cart)
    text = "🛒 <b>Корзина</b>\n\n"
    for i, p in enumerate(cart):
        text += f"{i+1}. {p.get('title')} — {format_price(int(p.get('price')))}\n"
    text += f"\n💰 <b>Итого: {format_price(total)} сум</b>"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Оформить", callback_data="cart:checkout")],
        [InlineKeyboardButton(text="🗑 Очистить", callback_data="cart:clear")],
        [
            InlineKeyboardButton(text="« В магазин", callback_data="shop:categories"),
            InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main")
        ]
    ])
    
    try: await callback.message.delete()
    except Exception: pass
    await callback.message.answer(text, reply_markup=kb, parse_mode="HTML")

@router.callback_query(F.data == "cart:clear")
async def cb_clear_cart(callback: CallbackQuery):
    cart_storage.clear_cart(callback.from_user.id)
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="« В магазин", callback_data="shop:categories"),
            InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main")
        ]
    ])
    try:
        await callback.message.edit_text(
            "🛒 <b>Корзина очищена</b>\n\nДобавьте товары из каталога!",
            reply_markup=kb,
            parse_mode="HTML"
        )
    except Exception:
        await callback.message.delete()
        await callback.message.answer(
            "🛒 <b>Корзина очищена</b>\n\nДобавьте товары из каталога!",
            reply_markup=kb,
            parse_mode="HTML"
        )
    await callback.answer("Очищено")

@router.callback_query(F.data == "cart:checkout")
async def cb_checkout(callback: CallbackQuery):
    """Start checkout — ask for contact method"""
    user_id = callback.from_user.id
    cart = cart_storage.get_cart(user_id)
    
    if not cart:
        await callback.answer("Корзина пуста", show_alert=True)
        return
    
    total = sum(int(p.get("price", 0)) for p in cart)
    items_text = "\n".join([f"• {p.get('title')} — {format_price(int(p.get('price', 0)))}" for p in cart[:5]])
    if len(cart) > 5:
        items_text += f"\n• ... и ещё {len(cart) - 5}"
    
    # Save checkout state
    cart_storage.set_checkout_state(user_id, {"cart": list(cart), "step": "confirm"})
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Подтвердить заказ", callback_data="checkout:quick_confirm")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="cart:view")],
    ])
    
    user = callback.from_user
    contact_info = f"@{user.username}" if user.username else f"Telegram ID: {user_id}"
    
    try:
        await callback.message.edit_text(
            f"📋 <b>Подтвердите заказ</b>\n\n"
            f"<b>Товары:</b>\n{items_text}\n\n"
            f"💰 <b>Итого: {format_price(total)} сум</b>\n\n"
            f"👤 {user.full_name}\n"
            f"📱 {contact_info}\n"
            f"📍 Адрес уточним при звонке\n\n"
            f"🚚 Доставка по Ташкенту — БЕСПЛАТНО\n"
            f"💳 Оплата при получении",
            reply_markup=kb,
            parse_mode="HTML"
        )
    except Exception as e:
        logger.warning(f"checkout edit_text failed: {e}")
        await callback.message.delete()
        await callback.message.answer(
            f"📋 <b>Подтвердите заказ</b>\n\n"
            f"💰 <b>Итого: {format_price(total)} сум</b> ({len(cart)} поз.)\n\n"
            f"Нажмите ✅ для подтверждения",
            reply_markup=kb,
            parse_mode="HTML"
        )
    await callback.answer()


@router.callback_query(F.data == "checkout:quick_confirm")
async def cb_quick_confirm(callback: CallbackQuery):
    """Step 1: Ask for phone number via Telegram contact sharing"""
    user_id = callback.from_user.id
    state = cart_storage.get_checkout_state(user_id)
    cart = state.get("cart") if state else cart_storage.get_cart(user_id)
    
    if not cart:
        await callback.answer("Корзина пуста", show_alert=True)
        return
    
    # Save state for after contact is shared
    cart_storage.set_checkout_state(user_id, {
        "cart": list(cart),
        "step": "awaiting_phone"
    })
    
    # Request phone via contact sharing button
    contact_kb = ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📱 Поделиться номером", request_contact=True)],
            [KeyboardButton(text="❌ Отмена")]
        ],
        resize_keyboard=True,
        one_time_keyboard=True
    )
    
    try:
        await callback.message.edit_text(
            "📱 <b>Для оформления заказа нужен ваш номер телефона</b>\n\n"
            "Нажмите кнопку «📱 Поделиться номером» внизу экрана 👇",
            parse_mode="HTML"
        )
    except Exception:
        pass
    
    await callback.message.answer(
        "👇 Нажмите кнопку ниже:",
        reply_markup=contact_kb
    )
    await callback.answer()


@router.message(F.content_type == ContentType.CONTACT)
async def handle_contact_for_order(message: Message):
    """Step 2: Receive phone from contact, create order"""
    from handlers.admin import send_order_to_group
    import uuid
    
    user_id = message.from_user.id
    state = cart_storage.get_checkout_state(user_id)
    
    if not state or state.get("step") != "awaiting_phone":
        # Not in checkout flow — just acknowledge
        await message.answer(
            "✅ Спасибо! Номер сохранён.",
            reply_markup=ReplyKeyboardRemove()
        )
        return
    
    # Extract real phone number
    phone = message.contact.phone_number
    if phone and not phone.startswith("+"):
        phone = f"+{phone}"
    
    cart = state.get("cart", [])
    if not cart:
        await message.answer("Корзина пуста. Начните заново.", reply_markup=ReplyKeyboardRemove())
        cart_storage.clear_checkout_state(user_id)
        return
    
    total = sum(int(p.get("price", 0)) for p in cart)
    order_id = str(uuid.uuid4())[:8].upper()
    
    user = message.from_user
    customer_name = user.full_name or "Клиент"
    
    # API data with REAL phone number
    api_order_data = {
        "name": customer_name,
        "phone": phone,
        "address": "Доставка по Ташкенту (уточнить)",
        "source": "telegram_bot",
        "telegramId": str(user_id),
        "items": [{"id": p.get("id", f"bot_{i}"), "title": p.get("title"), "price": int(p.get("price", 0)), "quantity": 1} for i, p in enumerate(cart)]
    }
    
    # Save to DB
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(f"{WEB_API_URL}/orders", json=api_order_data)
            if resp.status_code in (200, 201):
                result = resp.json()
                order_id = result.get("orderId", order_id)
                logger.info(f"Order {order_id} saved to database with phone {phone}")
            else:
                logger.warning(f"Order API returned {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.error(f"Failed to save order to API: {e}")
    
    # Notify admin
    order_data = {
        "id": order_id,
        "customerName": customer_name,
        "phone": phone,
        "address": "Доставка по Ташкенту",
        "total": total,
        "items": [{"title": p.get("title"), "price": p.get("price"), "quantity": 1} for p in cart],
        "telegramUserId": user_id,
        "status": "PENDING"
    }
    
    try:
        await send_order_to_group(message.bot, order_data)
    except Exception as e:
        logger.error(f"Failed to send notification: {e}")
    
    # Clear
    cart_storage.clear_cart(user_id)
    cart_storage.clear_checkout_state(user_id)
    
    items_text = "\n".join([f"• {p.get('title')}" for p in cart[:5]])
    if len(cart) > 5:
        items_text += f"\n• ... и ещё {len(cart) - 5}"
    
    await message.answer(
        f"✅ <b>Заказ #{order_id} оформлен!</b>\n\n"
        f"<b>Товары:</b>\n{items_text}\n\n"
        f"💰 <b>Итого: {format_price(total)} сум</b>\n\n"
        f"📱 Номер: {phone}\n"
        f"⏰ Мы свяжемся с вами в течение 30 минут\n\n"
        f"🌱 Спасибо за заказ!",
        parse_mode="HTML",
        reply_markup=ReplyKeyboardRemove()
    )


@router.message(F.text == "❌ Отмена")
async def cancel_phone_request(message: Message):
    """Cancel checkout when user presses cancel instead of sharing phone"""
    user_id = message.from_user.id
    state = cart_storage.get_checkout_state(user_id)
    
    if state and state.get("step") == "awaiting_phone":
        cart_storage.clear_checkout_state(user_id)
        await message.answer(
            "❌ Заказ отменён. Корзина сохранена.",
            reply_markup=ReplyKeyboardRemove()
        )


# Dead checkout:confirm flow removed — current flow uses checkout:quick_confirm → contact sharing


@router.callback_query(F.data == "checkout:cancel")
async def cancel_order(callback: CallbackQuery):
    """Cancel checkout"""
    user_id = callback.from_user.id
    cart_storage.clear_checkout_state(user_id)
    
    await callback.message.edit_text("❌ Заказ отменён")
    await callback.answer()

@router.callback_query(F.data == "noop")
async def cb_noop(c): await c.answer()

