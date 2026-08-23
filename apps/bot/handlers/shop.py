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
from services.lang_storage import lang_storage
from shared.i18n import DEFAULT_LANG, t
from services.cart_storage import cart_storage
from services.config_service import fetch_site_config
from shared.constants import CATEGORY_TUPLES as CATEGORIES, format_price
from shared.api import api_headers as _api_headers

def lang_of(event) -> str:
    """
    Язык собеседника.

    Сначала сохранённый выбор, иначе — язык клиента Telegram. Второе важнее,
    чем кажется: узбекоязычный покупатель видит узбекский с первого экрана,
    не заходя в настройки, а до этого весь бот был русским независимо от
    того, на каком языке человек вообще говорит.
    """
    user = getattr(event, "from_user", None)
    if user is None:
        return DEFAULT_LANG
    return lang_storage.get(user.id, getattr(user, "language_code", None))


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
    """Сумма ТОВАРОВ корзины с учётом количества, без доставки."""
    return sum(int(p.get("price", 0) or 0) * cart_quantity(p) for p in cart)


async def cart_totals(cart: list) -> tuple[int, int, int]:
    """
    Товары, доставка, итог — по тому же правилу, что считает витрина.

    До этого бот показывал только сумму товаров и называл её «Итого», а
    доставку сервер добавлял уже ПОСЛЕ подтверждения
    (`deliveryFeeForSubtotal` в `lib/settings/store.ts`). Клиент нажимал
    «Подтвердить» под одной цифрой, а в заказ попадала другая — больше на
    стоимость доставки. Порог и цену берём из `/api/config`, который бот и
    так читает: правило остаётся в одном месте — в настройках витрины.
    """
    subtotal = cart_total(cart)
    config = await fetch_site_config()
    delivery = 0 if subtotal >= config.free_delivery_threshold else config.delivery_fee
    return subtotal, delivery, subtotal + delivery


def totals_text(subtotal: int, delivery: int, total: int,
                lang: str = DEFAULT_LANG) -> str:
    """Три строки итога. Бесплатную доставку называем вслух — это довод."""
    shipping = (
        t("cart.delivery", lang, sum=format_price(delivery))
        if delivery
        else t("cart.delivery_free", lang)
    )
    return "\n".join([
        t("cart.subtotal", lang, sum=format_price(subtotal)),
        f"🚚 {shipping}",
        f"💰 {t('cart.total', lang, sum=format_price(total))}",
    ])


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

def cart_rows(cart: list, lang: str = DEFAULT_LANG) -> list:
    """
    Клавиатура корзины: по ряду на позицию плюс общие действия.

    Корзина умела ровно две вещи — оформить и «очистить всё». Передумал по
    одной позиции — сноси корзину целиком и собирай заново. Теперь у каждой
    строки свои «−», «+» и «убрать», а номер в первой кнопке связывает ряд
    с текстом выше: «2» в списке и «2» на кнопке — одна и та же позиция.
    """
    rows = []
    for index, item in enumerate(cart):
        product_id = item.get("id", "")
        rows.append([
            InlineKeyboardButton(text=f"{index + 1}️⃣", callback_data="noop"),
            InlineKeyboardButton(text="−", callback_data=f"cart:dec:{product_id}"),
            InlineKeyboardButton(text=str(cart_quantity(item)), callback_data="noop"),
            InlineKeyboardButton(text="+", callback_data=f"cart:inc:{product_id}"),
            InlineKeyboardButton(text="🗑", callback_data=f"cart:del:{product_id}"),
        ])

    rows.append([InlineKeyboardButton(text=t("btn.checkout", lang), callback_data="cart:checkout")])
    rows.append([InlineKeyboardButton(text=t("btn.clear", lang), callback_data="cart:clear")])
    rows.append([
        InlineKeyboardButton(text=t("btn.catalog", lang), callback_data="shop:categories"),
        InlineKeyboardButton(text=t("btn.home", lang), callback_data="menu:main"),
    ])
    return rows


def get_grid_keyboard(category: str, page: int, total_pages: int,
                      page_items_count: int, lang: str = DEFAULT_LANG) -> InlineKeyboardMarkup:
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
        InlineKeyboardButton(text=t("btn.catalog", lang), callback_data="shop:categories"),
        InlineKeyboardButton(text=t("btn.home", lang), callback_data="menu:main"),
    ])
    buttons.append([
        InlineKeyboardButton(text=t("btn.cart", lang), callback_data="cart:view"),
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_product_keyboard(product: dict, idx: int, total: int, category: str,
                         lang: str = DEFAULT_LANG,
                         user_id: int | None = None) -> InlineKeyboardMarkup:
    product_id = product.get("id", "")
    buttons = []
    
    # Ряда листания фото здесь больше нет.
    #
    # Он был мёртвым по построению: `get_product_images` возвращает СПИСОК
    # ИЗ ОДНОЙ ссылки — картинку товара либо запасной логотип, — поэтому
    # `photo_total > 1` не бывало истинным никогда. Зато подпись под каждой
    # карточкой честно сообщала «📸 Фото 1 из 1», объясняя покупателю, что
    # смотреть больше нечего.
    
    # 2. В корзину и в избранное
    #
    # Сердечка тут не было ВОВСЕ — при том, что пустой экран избранного
    # советовал «нажмите ❤️ на карточке товара в каталоге». Наполнить
    # избранное из бота было физически нечем, а обработчики `fav:add:` и
    # `fav:remove:` при этом существовали и ждали своих кнопок.
    #
    # Кнопка «🌐 На сайте» уехала в нижний ряд: она уводит покупателя из
    # бота на страницу каталога, и стоять вровень с «в корзину» ей незачем.
    from handlers.features import is_favorite

    fav = is_favorite(user_id, product_id) if user_id else False
    buttons.append([
        InlineKeyboardButton(text=t("btn.add_to_cart", lang), callback_data=f"cart:add:{product_id}"),
        InlineKeyboardButton(
            text=t("btn.favorite_remove" if fav else "btn.favorite_add", lang),
            callback_data=f"fav:{'remove' if fav else 'add'}:{product_id}",
        ),
    ])
    
    # 3. Navigation with HOME
    # Calculate which grid page this product belongs to
    grid_page = idx // ITEMS_PER_PAGE
    
    buttons.append([
        InlineKeyboardButton(text=t("btn.catalog", lang), callback_data=f"shop:grid:{category}:{grid_page}"),
        InlineKeyboardButton(text=t("btn.home", lang), callback_data="menu:main"),
    ])
    buttons.append([
        InlineKeyboardButton(text=t("btn.on_site", lang), url=f"{WEB_URL}/catalog"),
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)


# ==================== HANDLERS ====================

@router.message(Command("shop", "catalog"))
async def cmd_shop(message: Message):
    await show_categories(message)

async def show_categories(message: Message):
    lang = lang_of(message)
    buttons = []
    row = []
    for key, (emoji, name) in CATEGORIES.items():
        row.append(InlineKeyboardButton(text=f"{emoji} {name}", callback_data=f"shop:grid:{key}:0"))
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row: buttons.append(row)
    
    buttons.append([
        InlineKeyboardButton(text=t("btn.cart", lang), callback_data="cart:view"),
        InlineKeyboardButton(text=t("btn.home", lang), callback_data="menu:main"),
    ])
    
    await message.answer(
        "🛒 <b>Магазин Microgreen Uzbekistan</b>\nКоснитесь категории:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML"
    )

@router.callback_query(F.data == "shop:categories")
async def cb_categories_list(callback: CallbackQuery):
    """
    Список категорий.

    Две правки против прежних трёх строк:

    * `callback.answer()` не вызывался вовсе — Telegram крутил «часики» на
      кнопке, пока не истечёт время ожидания. Экран при этом менялся, и
      выглядело так, будто бот подвис уже ПОСЛЕ того, как всё сделал;
    * `delete()` шёл без защиты. Сообщение старше 48 часов удалить нельзя —
      Telegram отвечает ошибкой, и клиент не получал ни нового экрана, ни
      объяснения. Достаточно вернуться в бот через два дня и нажать кнопку
      в старой переписке.
    """
    await callback.answer()
    try:
        await callback.message.delete()
    except Exception as exc:  # noqa: BLE001 — старое сообщение удалить нельзя
        logger.debug("Не удалось удалить сообщение категорий: %s", exc)
    await show_categories(callback.message)


# GRID VIEW HANDLER
@router.callback_query(F.data.startswith("shop:grid:"))
async def cb_grid_view(callback: CallbackQuery):
    lang = lang_of(callback)
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

    kb = get_grid_keyboard(category, page, total_pages, len(page_products), lang)
    
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
    lang = lang_of(callback)
    parts = callback.data.split(":")
    # Две формы обращения к карточке. Длинная — из сетки каталога, она несёт
    # категорию и позицию, чтобы работали листание фото и возврат на нужную
    # страницу. Короткая — из избранного и поиска: там известен только id.
    if len(parts) == 3:
        product = await bridge.get_product(parts[2])
        if not product:
            await callback.answer("Товар не найден", show_alert=True)
            return
        category = product.get("category") or ""
        products = await fetch_products(category) if category else []
        idx = next(
            (n for n, item in enumerate(products) if str(item.get("id")) == parts[2]),
            0,
        )
        photo_idx = 0
    else:
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
    
    # Строки «📸 Фото 1 из 1» здесь больше нет: галерея всегда состояла из
    # одной картинки, и счётчик только сообщал покупателю, что смотреть
    # больше нечего.
    caption = (
        f"📦 <b>{title}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<b>{t('product.price', lang, price=price)}</b>\n\n"
        f"{desc}"
    )
    
    total_in_category = len(products) or 1
    kb = get_product_keyboard(
        product, idx, total_in_category, category, lang, callback.from_user.id
    )
    
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
    
    if not product:
        await callback.answer("Ошибка — товар не найден", show_alert=True)
        return

    # Остаток спрашиваем ЗДЕСЬ, а не при оформлении.
    #
    # `normalize_product` считает `in_stock` с самого начала, но его никто не
    # читал: товар с нулём спокойно ложился в корзину, а отказ приходил от
    # витрины (409 «Mahsulot topilmadi yoki sotuvda yo'q») уже ПОСЛЕ того,
    # как клиент поделился телефоном. Человек отдавал номер и получал
    # «не получилось оформить» — худший момент из возможных.
    if not product.get("in_stock", True):
        await callback.answer(
            f"{product.get('title', 'Товар')} сейчас нет в наличии.\n"
            "Мы пополняем каждый день — загляните завтра.",
            show_alert=True,
        )
        return

    cart_storage.add_to_cart(user_id, product)
    await callback.answer("✅ Добавлено в корзину!", show_alert=True)

@router.callback_query(F.data == "cart:view")
async def cb_view_cart(callback: CallbackQuery):
    lang = lang_of(callback)
    user_id = callback.from_user.id
    cart = cart_storage.get_cart(user_id)
    if not cart:
        await callback.answer(t("cart.empty", lang), show_alert=True)
        return
        
    subtotal, delivery, total = await cart_totals(cart)
    text = t("cart.title", lang) + "\n\n"
    for i, p in enumerate(cart):
        text += cart_line(i + 1, p) + "\n"
    text += "\n" + totals_text(subtotal, delivery, total, lang)
    
    kb = InlineKeyboardMarkup(inline_keyboard=cart_rows(cart, lang))
    
    try: await callback.message.delete()
    except Exception: pass
    await callback.message.answer(text, reply_markup=kb, parse_mode="HTML")

@router.callback_query(F.data == "cart:clear")
async def cb_clear_cart(callback: CallbackQuery):
    lang = lang_of(callback)
    cart_storage.clear_cart(callback.from_user.id)
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=t("btn.catalog", lang), callback_data="shop:categories"),
            InlineKeyboardButton(text=t("btn.home", lang), callback_data="menu:main")
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
    lang = lang_of(callback)
    user_id = callback.from_user.id
    cart = cart_storage.get_cart(user_id)
    
    if not cart:
        await callback.answer(t("cart.empty", lang), show_alert=True)
        return
    
    subtotal, delivery, total = await cart_totals(cart)
    items_text = "\n".join([f"• {cart_item_text(p)}" for p in cart[:5]])
    if len(cart) > 5:
        items_text += f"\n• ... и ещё {len(cart) - 5}"

    # Save checkout state
    cart_storage.set_checkout_state(user_id, {"cart": list(cart), "step": "confirm"})
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t("btn.confirm_order", lang), callback_data="checkout:quick_confirm")],
        [InlineKeyboardButton(text=t("btn.cancel", lang), callback_data="cart:view")],
    ])
    
    user = callback.from_user
    contact_info = f"@{user.username}" if user.username else f"Telegram ID: {user_id}"
    
    try:
        await callback.message.edit_text(
            f"📋 <b>Подтвердите заказ</b>\n\n"
            f"<b>Товары:</b>\n{items_text}\n\n"
            f"{totals_text(subtotal, delivery, total, lang)}\n\n"
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
            f"{totals_text(subtotal, delivery, total, lang)}\n({len(cart)} поз.)\n\n"
            f"Нажмите ✅ для подтверждения",
            reply_markup=kb,
            parse_mode="HTML"
        )
    await callback.answer()


@router.callback_query(F.data == "checkout:quick_confirm")
async def cb_quick_confirm(callback: CallbackQuery):
    """Step 1: Ask for phone number via Telegram contact sharing"""
    lang = lang_of(callback)
    user_id = callback.from_user.id
    state = cart_storage.get_checkout_state(user_id)
    cart = state.get("cart") if state else cart_storage.get_cart(user_id)
    
    if not cart:
        await callback.answer(t("cart.empty", lang), show_alert=True)
        return
    
    # Save state for after contact is shared
    cart_storage.set_checkout_state(user_id, {
        "cart": list(cart),
        "step": "awaiting_phone"
    })
    
    # Request phone via contact sharing button
    contact_kb = ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=t("btn.share_phone", lang), request_contact=True)],
            [KeyboardButton(text=t("btn.cancel", lang))]
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
    lang = lang_of(message)
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
    
    subtotal, delivery, total = await cart_totals(cart)
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
            f"{totals_text(subtotal, delivery, total, lang)}\n"
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
            f"{totals_text(subtotal, delivery, total, lang)}\n\n"
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
        f"{totals_text(subtotal, delivery, total, lang)}\n\n"
        f"📱 Номер: {phone}\n"
        f"⏰ Мы свяжемся с вами в течение 30 минут\n\n"
        f"🌱 Спасибо за заказ!",
        parse_mode="HTML",
        reply_markup=ReplyKeyboardRemove()
    )


@router.message(F.text == "❌ Отмена")
async def cancel_phone_request(message: Message):
    """
    Отмена на шаге «поделитесь номером».

    Раньше тело целиком было под `if state == "awaiting_phone"`, а ветки
    `else` не существовало. Нажатие «Отмена» вне этого шага не делало
    РОВНО НИЧЕГО: сообщение не приходило, а ReplyKeyboard с двумя кнопками
    оставалась висеть внизу экрана — убрать её было нечем, потому что
    снимает её как раз ответ бота.
    """
    lang = lang_of(message)
    user_id = message.from_user.id
    state = cart_storage.get_checkout_state(user_id)

    if state and state.get("step") == "awaiting_phone":
        cart_storage.clear_checkout_state(user_id)

    # Клавиатуру снимаем в любом случае — она уже на экране, независимо от
    # того, помним ли мы состояние. Redis мог истечь, бот мог перезапуститься.
    await message.answer(
        t("checkout.cancelled", lang),
        reply_markup=ReplyKeyboardRemove(),
    )
    await message.answer(
        t("cart.title", lang),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=cart_rows(
            cart_storage.get_cart(user_id), lang
        )),
        parse_mode="HTML",
    )


# Dead checkout:confirm flow removed — current flow uses checkout:quick_confirm → contact sharing


# Обработчик `checkout:cancel` убран: такой кнопки не рисовала ни одна
# клавиатура. Отмена оформления идёт через `btn.cancel` → `cart:view`, то
# есть возвращает в корзину. А этот вдобавок оставлял сообщение БЕЗ
# КЛАВИАТУРЫ — тупик, из которого можно было выйти только командой.

@router.callback_query(F.data == "noop")
async def cb_noop(c): await c.answer()


# ── Правка позиции корзины ──────────────────────────────────────────────
#
# Один обработчик на три действия: они отличаются только тем, каким станет
# количество. Три почти одинаковых обработчика — это три места, где можно
# забыть перерисовать экран.


async def _redraw_cart(callback: CallbackQuery, lang: str) -> None:
    """Перерисовать корзину на месте, без нового сообщения."""
    cart = cart_storage.get_cart(callback.from_user.id)
    if not cart:
        await callback.message.edit_text(
            t("cart.empty_hint", lang),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text=t("btn.catalog", lang), callback_data="shop:categories"),
                InlineKeyboardButton(text=t("btn.home", lang), callback_data="menu:main"),
            ]]),
            parse_mode="HTML",
        )
        return

    subtotal, delivery, total = await cart_totals(cart)
    text = t("cart.title", lang) + "\n\n"
    for index, item in enumerate(cart):
        text += cart_line(index + 1, item) + "\n"
    text += "\n" + totals_text(subtotal, delivery, total, lang)

    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=cart_rows(cart, lang)),
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("cart:inc:"))
@router.callback_query(F.data.startswith("cart:dec:"))
@router.callback_query(F.data.startswith("cart:del:"))
async def cb_cart_edit(callback: CallbackQuery):
    lang = lang_of(callback)
    action, product_id = callback.data.split(":", 2)[1:]
    user_id = callback.from_user.id

    updated, removed = [], False
    for item in cart_storage.get_cart(user_id):
        if str(item.get("id")) != str(product_id):
            updated.append(item)
            continue
        if action == "del":
            removed = True
            continue
        qty = cart_quantity(item) + (1 if action == "inc" else -1)
        if qty < 1:
            # Уменьшили до нуля — это и есть «убрать». Подтверждения не
            # спрашиваем: вернуть товар — одно нажатие.
            removed = True
            continue
        item["quantity"] = qty
        updated.append(item)

    cart_storage.set_cart(user_id, updated)
    await callback.answer(t("cart.item_removed", lang) if removed else "")
    await _redraw_cart(callback, lang)
