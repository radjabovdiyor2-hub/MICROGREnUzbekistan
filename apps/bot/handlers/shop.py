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
from services.config_service import fetch_site_config
from shared.constants import CATEGORY_TUPLES as CATEGORIES, format_price
from shared.api import api_headers as _api_headers

router = Router()
logger = logging.getLogger(__name__)

WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
WEB_URL = os.getenv("WEB_URL", "https://microgreenuzbekistan.com")
ITEMS_PER_PAGE = 4

# CATEGORIES imported from shared.constants as CATEGORY_TUPLES

# Cart storage — persisted to JSON file (survives bot restarts)
# See services/cart_storage.py for implementation


async def fetch_products(category: str = None) -> list:
    """Товары каталога через общий слой `services.catalog`.

    Здесь была вторая реализация разбора ответа. Конверт `{items, …}` она
    понимала верно, но следом фильтровала список ещё раз, уже на клиенте:
    `p.get("category") == category`, где `category` в ответе витрины —
    вложенный объект, а не строка. Сравнение объекта со строкой ложно всегда,
    поэтому любая кнопка категории отвечала «Нет товаров» — при том, что
    витрина по слагу отдавала товары исправно.
    """
    from services.catalog import fetch_products as _fetch

    return await _fetch(category=category)


# format_price imported from shared.constants


# ──────────────────────────────────────────────────────────────
# Количество в корзине.
#
# `cart_storage.add_to_cart` честно увеличивает `quantity`, когда тот же товар
# добавляют повторно, — и это значение не читал НИКТО: ни витрина корзины, ни
# сумма, ни payload заказа (там стояло `"quantity": 1` литералом), ни
# уведомление менеджеру. Клиент трижды нажимал «Добавить в корзину», трижды
# получал «✅ Добавлено», а заказ уходил на одну единицу. Расхождение было
# самосогласованным — сумма занижалась ровно так же, — поэтому ни одна
# проверка его не замечала.
# ──────────────────────────────────────────────────────────────


def cart_quantity(item: dict) -> int:
    """Количество в позиции корзины, не меньше одного."""
    try:
        return max(1, int(item.get("quantity", 1) or 1))
    except (TypeError, ValueError):
        return 1


def cart_total(cart: list) -> int:
    """Сумма корзины с учётом количества."""
    return sum(int(p.get("price", 0) or 0) * cart_quantity(p) for p in cart)


def cart_item_text(item: dict) -> str:
    """Позиция без нумерации: «Руккола × 3 = 45 000» или «Руккола — 15 000»."""
    qty = cart_quantity(item)
    price = int(item.get("price", 0) or 0)
    if qty > 1:
        return f"{item.get('title')} × {qty} = {format_price(price * qty)}"
    return f"{item.get('title')} — {format_price(price)}"


def cart_line(index: int, item: dict) -> str:
    """Строка позиции для витрины корзины: «2. Руккола × 3 = 45 000»."""
    return f"{index}. {cart_item_text(item)}"


def get_product_images(product: dict, category: str) -> list[str]:
    """Return product's actual image(s) only — no stock photos.

    `normalize_product` уже отдаёт абсолютную ссылку или None, поэтому
    достраивать путь второй раз не нужно — нужен только запасной вариант.
    """
    return [product.get("image") or f"{WEB_URL}/images/logo.jpg"]


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
        InlineKeyboardButton(text="🌐 На сайте", url=f"{WEB_URL}/catalog"),
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
        "🛒 <b>Магазин Microgreen Uzbekistan</b>\nКоснитесь категории:",
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
        
    total = cart_total(cart)
    text = "🛒 <b>Корзина</b>\n\n"
    for i, p in enumerate(cart):
        text += cart_line(i + 1, p) + "\n"
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
    
    total = cart_total(cart)
    items_text = "\n".join([f"• {cart_item_text(p)}" for p in cart[:5]])
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
            f"🚚 Доставка: Самарканд — в день заказа, Ташкент — на следующий день\n"
            f"💳 Оплата: {(await fetch_site_config()).payment_text}",
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
    
    total = cart_total(cart)
    order_id = None

    user = message.from_user
    customer_name = user.full_name or "Клиент"
    
    # Адрес бот не спрашивает — и не выдумывает. Раньше в каждый заказ
    # подставлялся Ташкент, хотя возим и в Самарканд, и адрес всё равно
    # уточняет менеджер: курьера это отправляло не в тот город.
    ADDRESS_TO_CLARIFY = "Уточнить по телефону"

    # API data with REAL phone number
    api_order_data = {
        "name": customer_name,
        "phone": phone,
        "address": ADDRESS_TO_CLARIFY,
        "source": "telegram_bot",
        "telegramId": str(user_id),
        "items": [
            {
                "id": p.get("id", f"bot_{i}"),
                "title": p.get("title"),
                "price": int(p.get("price", 0)),
                "quantity": cart_quantity(p),
            }
            for i, p in enumerate(cart)
        ],
    }

    # Save to DB.
    #
    # `saved` решает, что клиент увидит дальше. Раньше исход POST на текст не
    # влиял: витрина могла отказать, а клиент всё равно получал «✅ Заказ #…
    # оформлен» с номером, которого нет ни в одной таблице.
    saved = False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{WEB_API_URL}/orders", json=api_order_data, headers=_api_headers()
            )
            if resp.status_code in (200, 201):
                result = resp.json()
                # Номер заказа — тот, что выдала витрина, и никакой другой.
                #
                # Здесь читался ключ `orderId`, которого в ответе нет и не
                # было: роут отдаёт `{success, order: {id, orderNumber, …}}`.
                # `.get(..., order_id)` молча возвращал запасное значение —
                # локальный `uuid4()[:8]`, — и клиент с менеджером получали
                # номер, которого нет ни в одной таблице. Найти по нему заказ
                # было невозможно.
                order_id = (result.get("order") or {}).get("orderNumber")
                saved = bool(order_id)
                if saved:
                    logger.info("Order %s saved to database", order_id)
                else:
                    logger.error(
                        "Витрина приняла заказ, но не вернула orderNumber: %s", result
                    )
            else:
                logger.warning(f"Order API returned {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.error(f"Failed to save order to API: {e}")

    # Notify admin
    order_data = {
        "id": order_id or "—",
        "customerName": customer_name,
        "phone": phone,
        "address": ADDRESS_TO_CLARIFY,
        "total": total,
        "items": [
            {
                "title": p.get("title"),
                "price": p.get("price"),
                "quantity": cart_quantity(p),
            }
            for p in cart
        ],
        "telegramUserId": user_id,
        "status": "PENDING" if saved else "NOT_SAVED",
    }

    try:
        await send_order_to_group(message.bot, order_data)
    except Exception as e:
        logger.error(f"Failed to send notification: {e}")
    
    # Уведомить Степана-менеджера (@MG_PM1_bot).
    # Уходит в обоих случаях: если витрина отказала, заявку тем более надо
    # спасать руками — но менеджер должен видеть, что в админке её нет.
    items_for_stepan = "\n".join([f"  • {cart_item_text(p)} сум" for p in cart[:8]])
    header = (
        "📦 <b>Новый заказ из Telegram бота!</b>"
        if saved
        else "🚨 <b>Заказ НЕ сохранён — перезвонить вручную!</b>"
    )
    order_line = (
        f"🆔 Заказ: <code>#{order_id}</code>\n"
        if saved
        else "🆔 Номера нет: витрина заказ не приняла\n"
    )
    try:
        await bridge.notify_stepan(
            f"{header}\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"{order_line}"
            f"👤 Клиент: <b>{customer_name}</b>\n"
            f"📱 Телефон: {phone}\n"
            f"📍 Адрес: {ADDRESS_TO_CLARIFY}\n\n"
            f"🛒 <b>Товары:</b>\n{items_for_stepan}\n\n"
            f"💰 <b>Итого: {format_price(total)} сум</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"🤖 Источник: Telegram Bot\n"
            f"⏰ Ожидает подтверждения"
        )
    except Exception as e:
        logger.error(f"Failed to notify Stepan: {e}")

    items_text = "\n".join([f"• {cart_item_text(p)}" for p in cart[:5]])
    if len(cart) > 5:
        items_text += f"\n• ... и ещё {len(cart) - 5}"

    if not saved:
        # Корзину НЕ чистим: клиент сможет повторить, ничего не набирая заново.
        cart_storage.clear_checkout_state(user_id)
        config = await fetch_site_config()
        await message.answer(
            "⚠️ <b>Не получилось оформить заказ автоматически</b>\n\n"
            f"<b>Товары:</b>\n{items_text}\n\n"
            f"💰 <b>Итого: {format_price(total)} сум</b>\n\n"
            "Корзина сохранена — можно попробовать ещё раз.\n"
            f"Мы уже видим вашу заявку и перезвоним на {phone}.\n"
            f"Если удобнее сразу — {config.contact_phone}",
            parse_mode="HTML",
            reply_markup=ReplyKeyboardRemove()
        )
        return

    # Clear
    cart_storage.clear_cart(user_id)
    cart_storage.clear_checkout_state(user_id)

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

