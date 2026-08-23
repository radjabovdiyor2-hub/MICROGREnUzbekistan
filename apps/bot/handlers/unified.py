"""
🌱 MICROGREEN UZBEKISTAN — UNIFIED BOT HANDLER

Единый обработчик для всех команд с интеграцией экосистемы.
Все действия через ecosystem_bridge синхронизируются с веб-платформой.
"""

from aiogram import Router, F
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.filters import Command

from services.ecosystem_bridge import bridge
from services.config_service import fetch_site_config
from shared.constants import CATEGORY_LABELS_LOWER, CATEGORY_LABELS, format_price
from shared.offers import balance_text, referral_text
from shared.i18n import DEFAULT_LANG, t
from services.lang_storage import lang_of
from shared.screen import render


router = Router()


# ==================== INLINE KEYBOARDS ====================

def get_main_menu_kb(lang: str = DEFAULT_LANG) -> InlineKeyboardMarkup:
    """Главное меню"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=t('btn.catalog', lang), callback_data="catalog:pricelist"),
            InlineKeyboardButton(text=t('btn.cart', lang), callback_data="cart:view"),
        ],
        [
            InlineKeyboardButton(text=t('btn.orders', lang), callback_data="menu:orders"),
            InlineKeyboardButton(text=t('btn.reorder', lang), callback_data="menu:reorder"),
        ],
        [
            InlineKeyboardButton(text=t('btn.recipes', lang), callback_data="menu:recipes"),
            InlineKeyboardButton(text=t('btn.favorites', lang), callback_data="menu:favorites"),
        ],
        [
            InlineKeyboardButton(text=t('btn.bonuses', lang), callback_data="menu:bonuses"),
            InlineKeyboardButton(text=t('btn.profile', lang), callback_data="menu:profile"),
        ],
        [
            InlineKeyboardButton(text=t('btn.game', lang), callback_data="menu:game"),
            InlineKeyboardButton(text=t('btn.about', lang), callback_data="menu:about"),
        ],
    ])


# `get_catalog_kb()` удалена.
#
# Её не вызывал никто, поэтому девять её кнопок (`catalog:microgreens`,
# `catalog:salads`, …) были недостижимы. И даже стань они достижимы, одна
# из них не сработала бы: слаг стоял `baby_leaf`, а настоящий —
# `baby-leaf` (`shared/constants.py`), то есть кнопка отвечала бы
# «нет товаров». Категории выбираются в `shop.py::show_categories`,
# который берёт их из того же `constants` и разойтись с ним не может.


# ==================== COMMAND HANDLERS ====================
# NOTE: /start is handled by start.py (with WebAppInfo, Farm Simulator links)
# NOTE: /catalog is handled by shop.py (with grid view UI)


@router.message(Command("orders"))
async def cmd_orders(message: Message):
    """Мои заказы"""
    lang = lang_of(message)
    user = message.from_user
    
    # Look up user phone from profile via ecosystem bridge
    user_data = await bridge.get_user_by_telegram_id(user.id)
    phone = user_data.get("phone") if user_data else None
    
    if not phone:
        text = t("orders.empty_screen", lang)
        await message.answer(text)
        return
    
    orders = await bridge.get_orders_by_phone(phone)
    
    if not orders:
        text = t("orders.empty_screen", lang)
    else:
        text = t("orders.title", lang) + "\n\n"
        for order in orders[:5]:
            text += f"• #{order['id'][-6:]} — {order['status']}\n"
    
    await message.answer(text)


@router.message(Command("bonuses"))
async def cmd_bonuses(message: Message):
    """Бонусный счёт"""
    user = message.from_user
    bonuses = await bridge.get_user_bonuses(user.id)
    
    config = await fetch_site_config()
    await message.answer(balance_text(config, bonuses), parse_mode="HTML")


# NOTE: /game command is handled by start.py (higher priority router)
# Removed duplicate handler to avoid confusion.


# ==================== CALLBACK HANDLERS ====================

@router.callback_query(F.data == "menu:main")
async def cb_main_menu(callback: CallbackQuery):
    """Главное меню"""
    lang = lang_of(callback)
    text = "🌱 <b>Главное меню</b>\n\nВыберите действие:"
    kb = get_main_menu_kb(lang)
    
    try:
        # Try to edit text (works for text messages)
        await render(callback, text, reply_markup=kb)
    except Exception:
        # If it fails (photo message), delete and send new
        try:
            await callback.message.delete()
        except Exception:
            pass
        await callback.message.answer(text, reply_markup=kb)
    
    await callback.answer()


# `menu:catalog` убран: кнопки с таким значением не существовало, а сам
# обработчик просто перенаправлял на `catalog:pricelist`, который меню и
# шлёт напрямую.


@router.callback_query(F.data == "catalog:pricelist")
async def cb_pricelist(callback: CallbackQuery):
    """Полный прайс-лист по всем категориям"""
    lang = lang_of(callback)
    import logging
    _log = logging.getLogger(__name__)
    
    all_products = []
    for cat_key in CATEGORY_LABELS:
        try:
            products = await bridge.get_products(limit=50, category=cat_key)
            if products:
                all_products.extend([(cat_key, p) for p in products])
        except Exception as e:
            _log.warning(f"Failed to fetch {cat_key}: {e}")
    
    if not all_products:
        try:
            await render(callback, t("catalog.empty", lang),
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
                ]),
                parse_mode="HTML"
            )
        except Exception:
            pass
        return
    
    # Group by category
    grouped: dict[str, list] = {}
    for cat_key, p in all_products:
        grouped.setdefault(cat_key, []).append(p)
    
    # Build price list text
    text = "🛒 <b>КАТАЛОГ — ПРАЙС-ЛИСТ</b>\n"
    text += "━━━━━━━━━━━━━━━━━━━━\n\n"
    
    total_count = 0
    for cat_key, products in grouped.items():
        cat_label = CATEGORY_LABELS.get(cat_key, cat_key)
        text += f"<b>{cat_label}</b>\n"
        for p in products[:10]:  # Max 10 per category to fit message
            title = p.get('title', 'Товар')[:30]
            price = int(p.get('price', 0))
            text += f"  • {title} — <b>{format_price(price)}</b> сум\n"
            total_count += 1
        if len(products) > 10:
            text += f"  <i>...ещё {len(products) - 10} товаров</i>\n"
        text += "\n"
    
    text += f"📊 <b>Всего: {total_count}+ позиций</b>\n"
    text += "🚚 Доставка: Самарканд — в день заказа, Ташкент — на следующий день\n\n"
    text += "👇 Выберите категорию для заказа:"
    
    # Category buttons for detailed view (2 per row)
    buttons = []
    row = []
    for cat_key, (emoji_label) in CATEGORY_LABELS.items():
        emoji = emoji_label.split(" ", 1)[0]
        name = emoji_label.split(" ", 1)[1] if " " in emoji_label else emoji_label
        row.append(InlineKeyboardButton(
            text=f"{emoji} {name}",
            callback_data=f"shop:grid:{cat_key}:0"
        ))
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    
    buttons.append([
        InlineKeyboardButton(text=t('btn.cart', lang), callback_data="cart:view"),
        InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main"),
    ])
    
    kb = InlineKeyboardMarkup(inline_keyboard=buttons)
    
    # Truncate if too long for Telegram (4096 char limit)
    if len(text) > 4000:
        text = text[:3950] + "\n\n<i>...полный список на сайте</i>"
    
    try:
        await render(callback, text, kb)
    except Exception:
        try:
            await callback.message.delete()
        except Exception:
            pass
        await callback.message.answer(text, reply_markup=kb, parse_mode="HTML")


@router.callback_query(F.data.startswith("catalog:"))
async def cb_category(callback: CallbackQuery):
    """Категория каталога — fallback для старых кнопок"""
    lang = lang_of(callback)
    category = callback.data.split(":")[1]
    if category == "pricelist":
        return  # Already handled above
    
    # Получаем товары через ecosystem bridge.
    # Без `.upper()`: витрина фильтрует по слагу (`salads`), и `SALADS`
    # возвращал ноль товаров — вторая независимая причина пустой категории.
    products = await bridge.get_products(limit=10, category=category)
    
    cat_title = CATEGORY_LABELS_LOWER.get(category, category.capitalize())
    
    if not products:
        text = f"📦 В категории <b>{cat_title}</b> пока нет товаров."
    else:
        text = f"📦 <b>{cat_title}</b>\n\n"
        for p in products[:10]:
            title = p.get('title', 'Товар')[:30]
            price = int(p.get('price', 0))
            text += f"• {title} — <b>{format_price(price)}</b> сум\n"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t("btn.on_site", lang), url=f"https://microgreenuzbekistan.com/catalog?category={category}")],
        [InlineKeyboardButton(text=t('btn.catalog', lang), callback_data="catalog:pricelist"),
         InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
    ])
    
    try:
        await render(callback, text, kb)
    except Exception:
        pass


@router.callback_query(F.data == "menu:orders")
async def cb_orders(callback: CallbackQuery):
    """Мои заказы"""
    lang = lang_of(callback)
    user = callback.from_user
    
    # Look up user phone from profile via ecosystem bridge
    user_data = await bridge.get_user_by_telegram_id(user.id)
    phone = user_data.get("phone") if user_data else None
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t('btn.catalog', lang), callback_data="shop:categories")],
        [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
    ])
    
    if not phone:
        try:
            await render(callback, t("orders.empty_screen", lang), keyboard)
        except Exception:
            pass
        return
    
    orders = await bridge.get_orders_by_phone(phone)
    
    if not orders:
        text = t("orders.empty_screen", lang)
    else:
        text = t("orders.title", lang) + "\n\n"
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
            text += f"• <b>#{order['id'][-6:]}</b> — {status} — {total:,} сум\n"
    
    try:
        await render(callback, text, keyboard)
    except Exception:
        pass


@router.callback_query(F.data == "menu:bonuses")
async def cb_bonuses(callback: CallbackQuery):
    """Бонусы"""
    lang = lang_of(callback)
    user = callback.from_user
    bonuses = await bridge.get_user_bonuses(user.id)
    
    config = await fetch_site_config()
    await render(callback, balance_text(config, bonuses),
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
        ])
    )


@router.callback_query(F.data == "menu:game")
async def cb_game(callback: CallbackQuery):
    """Игра"""
    lang = lang_of(callback)
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t('btn.game', lang), url="https://t.me/Microgreenuzbekistan_bot/game")],
        [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
    ])
    
    await render(callback, t("game.body", lang), kb)


@router.callback_query(F.data == "agronomist")
async def cb_ai_seller(callback: CallbackQuery):
    """Заставка AI-продавца — кнопка из меню /start.

    ⚠️ Строка `agronomist` в `callback_data` остаётся НАВСЕГДА, хотя агронома
    в боте нет: она уже разослана клиентам в кнопках, а Telegram хранит их в
    истории чата вечно. Переименуешь — старая кнопка перестанет отвечать, и
    клиент получит молчание вместо помощника. Имя обработчика при этом
    честное: продаёт продавец.
    """
    lang = lang_of(callback)
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t("btn.send_food_photo", lang), callback_data="agronomist:photo_hint")],
        [InlineKeyboardButton(text=t("btn.pick_greens", lang), callback_data="agronomist:shop_hint")],
        [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
    ])
    
    try:
        await render(callback, t("ai.splash", lang), kb)
    except Exception:
        try:
            await callback.message.delete()
        except Exception:
            pass
        await callback.message.answer(
            t("ai.ready", lang),
            reply_markup=kb,
            parse_mode="HTML"
        )
    await callback.answer()


@router.callback_query(F.data == "agronomist:photo_hint")
async def cb_ai_seller_photo(callback: CallbackQuery):
    """Подсказка: как прислать фото блюда (не растения — мы не диагностируем)"""
    lang = lang_of(callback)
    await callback.answer(
        t("ai.photo_hint", lang),
        show_alert=True
    )


@router.callback_query(F.data == "agronomist:shop_hint")
async def cb_ai_seller_shop(callback: CallbackQuery):
    """Подсказка: как попросить AI-продавца подобрать зелень"""
    lang = lang_of(callback)
    try:
        await callback.message.edit_text(
            # prompt-ok: obrazec formata telefona dlya klienta, a ne kontakt kompanii
            t("ai.shop_hint", lang),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text=t('btn.catalog', lang), callback_data="shop:categories")],
                [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
            ]),
            parse_mode="HTML"
        )
    except Exception:
        pass
    await callback.answer()


@router.message(Command("ref", "referral"))
async def cmd_referral(message: Message):
    """Generate referral link"""
    user_id = message.from_user.id
    ref_link = f"https://t.me/Microgreenuzbekistan_bot?start=ref_{user_id}"
    
    config = await fetch_site_config()
    await message.answer(referral_text(config, ref_link), parse_mode="HTML")


@router.callback_query(F.data == "menu:about")
async def cb_about(callback: CallbackQuery):
    """О нас — Полная экосистема"""
    lang = lang_of(callback)
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=t("btn.channel", lang), url="https://t.me/MicrogreenUzbekistan"),
            InlineKeyboardButton(text=t("btn.group", lang), url="https://t.me/Microgreen_Uzbekistan"),
        ],
        [
            InlineKeyboardButton(text="📸 Instagram", url="https://www.instagram.com/microgreenuzbekistan"),
            InlineKeyboardButton(text=t("btn.website", lang), url="https://microgreenuzbekistan.com"),
        ],
        [
            InlineKeyboardButton(text="🎮 Farm Simulator", url="https://t.me/Microgreenuzbekistan_bot/game"),
        ],
        [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
    ])
    
    await render(callback, t("about.body", lang), kb)
