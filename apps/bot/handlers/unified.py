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

router = Router()


# ==================== INLINE KEYBOARDS ====================

def get_main_menu_kb() -> InlineKeyboardMarkup:
    """Главное меню"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🛒 Каталог", callback_data="catalog:pricelist"),
            InlineKeyboardButton(text="🛍️ Корзина", callback_data="cart:view"),
        ],
        [
            InlineKeyboardButton(text="📦 Мои заказы", callback_data="menu:orders"),
            InlineKeyboardButton(text="🔄 Повторить заказ", callback_data="menu:reorder"),
        ],
        [
            InlineKeyboardButton(text="🍽️ Рецепты", callback_data="menu:recipes"),
            InlineKeyboardButton(text="❤️ Избранное", callback_data="menu:favorites"),
        ],
        [
            InlineKeyboardButton(text="💰 Бонусы", callback_data="menu:bonuses"),
            InlineKeyboardButton(text="👤 Профиль", callback_data="menu:profile"),
        ],
        [
            InlineKeyboardButton(text="🎮 Играть", callback_data="menu:game"),
            InlineKeyboardButton(text="ℹ️ О нас", callback_data="menu:about"),
        ],
    ])


def get_catalog_kb() -> InlineKeyboardMarkup:
    """Меню каталога"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🌱 Микрозелень", callback_data="catalog:microgreens"),
            InlineKeyboardButton(text="🥬 Бейби-лист", callback_data="catalog:baby_leaf"),
        ],
        [
            InlineKeyboardButton(text="🥗 Салаты", callback_data="catalog:salads"),
            InlineKeyboardButton(text="🥙 BALANS", callback_data="catalog:balans"),
        ],
        [
            InlineKeyboardButton(text="🌸 Цветы", callback_data="catalog:flowers"),
            InlineKeyboardButton(text="🌾 Семена", callback_data="catalog:seeds"),
        ],
        [
            InlineKeyboardButton(text="⚙️ Оборудование", callback_data="catalog:equipment"),
        ],
        [
            InlineKeyboardButton(text="📦 Наборы", callback_data="catalog:sets"),
        ],
        [InlineKeyboardButton(text="« Назад", callback_data="menu:main")],
    ])


# ==================== COMMAND HANDLERS ====================
# NOTE: /start is handled by start.py (with WebAppInfo, Farm Simulator links)
# NOTE: /catalog is handled by shop.py (with grid view UI)


@router.message(Command("orders"))
async def cmd_orders(message: Message):
    """Мои заказы"""
    user = message.from_user
    
    # Look up user phone from profile via ecosystem bridge
    user_data = await bridge.get_user_by_telegram_id(user.id)
    phone = user_data.get("phone") if user_data else None
    
    if not phone:
        text = "📦 <b>Мои заказы</b>\n\nУ вас пока нет заказов.\n\n💡 Чтобы видеть заказы, оформите первый заказ через каталог."
        await message.answer(text)
        return
    
    orders = await bridge.get_orders_by_phone(phone)
    
    if not orders:
        text = "📦 <b>Мои заказы</b>\n\nУ вас пока нет заказов."
    else:
        text = "📦 <b>Мои заказы</b>\n\n"
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
    text = "🌱 <b>Главное меню</b>\n\nВыберите действие:"
    kb = get_main_menu_kb()
    
    try:
        # Try to edit text (works for text messages)
        await callback.message.edit_text(text, reply_markup=kb)
    except Exception:
        # If it fails (photo message), delete and send new
        try:
            await callback.message.delete()
        except Exception:
            pass
        await callback.message.answer(text, reply_markup=kb)
    
    await callback.answer()


@router.callback_query(F.data == "menu:catalog")
async def cb_catalog(callback: CallbackQuery):
    """Каталог — redirect to pricelist"""
    await cb_pricelist(callback)


@router.callback_query(F.data == "catalog:pricelist")
async def cb_pricelist(callback: CallbackQuery):
    """Полный прайс-лист по всем категориям"""
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
            await callback.message.edit_text(
                "📦 <b>Каталог пуст</b>\n\nТовары скоро появятся!",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main")],
                ]),
                parse_mode="HTML"
            )
        except Exception:
            pass
        await callback.answer()
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
        InlineKeyboardButton(text="🛍️ Корзина", callback_data="cart:view"),
        InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main"),
    ])
    
    kb = InlineKeyboardMarkup(inline_keyboard=buttons)
    
    # Truncate if too long for Telegram (4096 char limit)
    if len(text) > 4000:
        text = text[:3950] + "\n\n<i>...полный список на сайте</i>"
    
    try:
        await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
    except Exception:
        try:
            await callback.message.delete()
        except Exception:
            pass
        await callback.message.answer(text, reply_markup=kb, parse_mode="HTML")
    await callback.answer()


@router.callback_query(F.data.startswith("catalog:"))
async def cb_category(callback: CallbackQuery):
    """Категория каталога — fallback для старых кнопок"""
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
        [InlineKeyboardButton(text="🌐 На сайте", url=f"https://microgreenuzbekistan.com/catalog?category={category}")],
        [InlineKeyboardButton(text="« Каталог", callback_data="catalog:pricelist"),
         InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
    ])
    
    try:
        await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
    except Exception:
        pass
    await callback.answer()


@router.callback_query(F.data == "menu:orders")
async def cb_orders(callback: CallbackQuery):
    """Мои заказы"""
    user = callback.from_user
    
    # Look up user phone from profile via ecosystem bridge
    user_data = await bridge.get_user_by_telegram_id(user.id)
    phone = user_data.get("phone") if user_data else None
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🛒 Каталог", callback_data="shop:categories")],
        [InlineKeyboardButton(text="« Назад", callback_data="menu:main")],
    ])
    
    if not phone:
        try:
            await callback.message.edit_text(
                "📦 <b>Мои заказы</b>\n\nУ вас пока нет заказов.\n\n💡 Чтобы видеть заказы, оформите первый заказ через каталог.",
                reply_markup=keyboard,
                parse_mode="HTML"
            )
        except Exception:
            pass
        await callback.answer()
        return
    
    orders = await bridge.get_orders_by_phone(phone)
    
    if not orders:
        text = "📦 <b>Мои заказы</b>\n\nУ вас пока нет заказов."
    else:
        text = "📦 <b>Мои заказы</b>\n\n"
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
        await callback.message.edit_text(text, reply_markup=keyboard, parse_mode="HTML")
    except Exception:
        pass
    await callback.answer()


@router.callback_query(F.data == "menu:bonuses")
async def cb_bonuses(callback: CallbackQuery):
    """Бонусы"""
    user = callback.from_user
    bonuses = await bridge.get_user_bonuses(user.id)
    
    config = await fetch_site_config()
    await callback.message.edit_text(
        balance_text(config, bonuses),
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="« Назад", callback_data="menu:main")],
        ])
    )
    await callback.answer()


@router.callback_query(F.data == "menu:game")
async def cb_game(callback: CallbackQuery):
    """Игра"""
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎮 Играть", url="https://t.me/Microgreenuzbekistan_bot/game")],
        [InlineKeyboardButton(text="« Назад", callback_data="menu:main")],
    ])
    
    await callback.message.edit_text(
        "🎮 <b>Farm Simulator</b>\n\n"
        "Нажимай на растения, зарабатывай GreenCoins!\n"
        "Монеты можно обменять на скидки.",
        reply_markup=kb
    )
    await callback.answer()


@router.callback_query(F.data == "agronomist")
async def cb_ai_seller(callback: CallbackQuery):
    """Заставка AI-продавца — кнопка из меню /start.

    ⚠️ Строка `agronomist` в `callback_data` остаётся НАВСЕГДА, хотя агронома
    в боте нет: она уже разослана клиентам в кнопках, а Telegram хранит их в
    истории чата вечно. Переименуешь — старая кнопка перестанет отвечать, и
    клиент получит молчание вместо помощника. Имя обработчика при этом
    честное: продаёт продавец.
    """
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📸 Отправить фото еды", callback_data="agronomist:photo_hint")],
        [InlineKeyboardButton(text="🛒 Подобрать микрозелень", callback_data="agronomist:shop_hint")],
        [InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main")],
    ])
    
    try:
        await callback.message.edit_text(
            "🤖 <b>AI-помощник готов!</b>\n\n"
            "Просто напишите мне любой вопрос, и я помогу:\n\n"
            "🥗 <b>Подбор по вкусу</b> — какая микрозелень к какому блюду\n"
            "🍽️ <b>Рецепты</b> — ПП и ЗОЖ рецепты с микрозеленью\n"
            "📸 <b>Фото еды</b> — пришлите фото блюда, подскажу чем дополнить\n"
            "🛒 <b>Заказ</b> — оформлю покупку прямо здесь\n"
            "🚚 <b>Доставка</b> — расскажу условия и сроки\n"
            "🎤 <b>Голосовые</b> — отправьте голосовое, я расшифрую и отвечу\n\n"
            "👇 <i>Или выберите действие ниже:</i>",
            reply_markup=kb,
            parse_mode="HTML"
        )
    except Exception:
        try:
            await callback.message.delete()
        except Exception:
            pass
        await callback.message.answer(
            "🤖 <b>AI-помощник готов!</b>\n\n"
            "Напишите любой вопрос!\n"
            "📸 Пришлите фото еды — подскажу чем дополнить\n"
            "🎤 Отправьте голосовое — я расшифрую",
            reply_markup=kb,
            parse_mode="HTML"
        )
    await callback.answer()


@router.callback_query(F.data == "agronomist:photo_hint")
async def cb_ai_seller_photo(callback: CallbackQuery):
    """Подсказка: как прислать фото блюда (не растения — мы не диагностируем)"""
    await callback.answer(
        "📸 Просто отправьте фото вашего блюда в этот чат!\n"
        "Я подскажу, какая микрозелень его дополнит.",
        show_alert=True
    )


@router.callback_query(F.data == "agronomist:shop_hint")
async def cb_ai_seller_shop(callback: CallbackQuery):
    """Подсказка: как попросить AI-продавца подобрать зелень"""
    try:
        await callback.message.edit_text(
            # prompt-ok: obrazec formata telefona dlya klienta, a ne kontakt kompanii
            "🛒 <b>Подбор микрозелени</b>\n\n"
            "Напишите мне, что вам нужно, например:\n\n"
            "• <i>«Какая микрозелень самая вкусная?»</i>\n"
            "• <i>«Что добавить в салат?»</i>\n"
            "• <i>«Хочу попробовать что-нибудь острое»</i>\n"
            "• <i>«Закажи 2 лотка подсолнечника, тел +998901234567»</i>\n\n"
            "Подберу по вкусу и назову цены! 🌱",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🛒 Открыть каталог", callback_data="shop:categories")],
                [InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main")],
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
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📢 Канал", url="https://t.me/MicrogreenUzbekistan"),
            InlineKeyboardButton(text="👥 Группа", url="https://t.me/Microgreen_Uzbekistan"),
        ],
        [
            InlineKeyboardButton(text="📸 Instagram", url="https://www.instagram.com/microgreenuzbekistan"),
            InlineKeyboardButton(text="🌐 Сайт", url="https://microgreenuzbekistan.com"),
        ],
        [
            InlineKeyboardButton(text="🎮 Farm Simulator", url="https://t.me/Microgreenuzbekistan_bot/game"),
        ],
        [InlineKeyboardButton(text="« Назад", callback_data="menu:main")],
    ])
    
    await callback.message.edit_text(
        "🌱 <b>Microgreen Uzbekistan</b>\n"
        "Свежая микрозелень • Бейби-лист • Салаты 🥗\n\n"
        "• 🌿 Микрозелень, бейби-лист, салаты\n"
        "• 🤖 AI-помощник для подбора и заказа\n"
        "• 🎮 Farm Simulator — играй и получай бонусы!\n"
        "• 🚚 Доставка: Самарканд + Ташкент\n\n"
        "<b>Наши ресурсы:</b>",
        reply_markup=kb
    )
    await callback.answer()
