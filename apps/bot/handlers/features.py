"""
🍽️ FEATURES — Рецепты, профиль, избранное, реордер, отзывы, промо, подписки

Все новые фичи бота, зеркалящие функционал веб-платформы.
Каждый обработчик работает через ecosystem_bridge (HTTP → Web API).
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

import httpx
from aiogram import Router, F
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from aiogram.filters import Command

from services.ecosystem_bridge import bridge
from shared.constants import format_price

router = Router()
logger = logging.getLogger(__name__)

WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://microgreenuzbekistan.com")

# ==================== РЕЦЕПТЫ ====================

@router.callback_query(F.data == "menu:recipes")
async def cb_recipes(callback: CallbackQuery):
    """Рецепт дня из веб-API"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{WEB_API_URL}/ai/nutrition?type=recipe")
            if resp.status_code == 200:
                data = resp.json()
                recipe = data.get("recipe")
                if recipe:
                    name = recipe.get("nameRu") or recipe.get("nameUz", "Рецепт")
                    time_min = recipe.get("timeMinutes", 15)
                    servings = recipe.get("servings", 2)
                    ingredients = recipe.get("ingredientsRu") or recipe.get("ingredientsUz", [])
                    steps = recipe.get("stepsRu") or recipe.get("stepsUz", [])

                    text = (
                        f"🍽️ <b>Рецепт дня: {name}</b>\n\n"
                        f"⏱ {time_min} мин • 👥 {servings} порции\n\n"
                    )

                    if ingredients:
                        text += "📋 <b>Ингредиенты:</b>\n"
                        for ing in ingredients[:8]:
                            text += f"  • {ing}\n"
                        text += "\n"

                    if steps:
                        text += "👨‍🍳 <b>Приготовление:</b>\n"
                        for i, step in enumerate(steps[:5], 1):
                            text += f"  {i}. {step}\n"

                    kb = InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(
                            text="🛒 Купить ингредиенты",
                            url=f"{WEB_APP_URL}/catalog"
                        )],
                        [InlineKeyboardButton(
                            text="📖 Все рецепты",
                            url=f"{WEB_APP_URL}/recipe"
                        )],
                        [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
                    ])

                    await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
                    await callback.answer()
                    return

        # Fallback — API не вернул рецепт
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📖 Рецепты на сайте", url=f"{WEB_APP_URL}/recipe")],
            [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
        ])
        await callback.message.edit_text(
            "🍽️ <b>Рецепты с микрозеленью</b>\n\n"
            "ПП и ЗОЖ рецепты — на нашем сайте!\n"
            "Салаты, смузи, сэндвичи — за 15 минут.\n\n"
            "Или спросите AI: «придумай рецепт с рукколой» 🤖",
            reply_markup=kb,
            parse_mode="HTML"
        )
    except Exception as e:
        logger.error("Ошибка рецептов: %s", e)
        await callback.message.edit_text(
            "🍽️ Рецепты временно недоступны.\n"
            f"Смотрите на сайте: {WEB_APP_URL}/recipe",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
            ])
        )
    await callback.answer()


# ==================== ПРОФИЛЬ ====================

@router.callback_query(F.data == "menu:profile")
async def cb_profile(callback: CallbackQuery):
    """Профиль пользователя"""
    user = callback.from_user
    user_data = await bridge.get_user_by_telegram_id(user.id)
    bonuses = await bridge.get_user_bonuses(user.id)

    if user_data:
        name = user_data.get("firstName") or user.full_name
        phone = user_data.get("phone") or "не указан"
        lang = user_data.get("language", "ru")
        orders_count = user_data.get("ordersCount", 0)
    else:
        name = user.full_name
        phone = "не указан"
        lang = "ru"
        orders_count = 0

    text = (
        f"👤 <b>Ваш профиль</b>\n\n"
        f"📛 Имя: <b>{name}</b>\n"
        f"📱 Телефон: <b>{phone}</b>\n"
        f"🌐 Язык: <b>{'🇷🇺 Русский' if lang == 'ru' else '🇺🇿 Oʻzbekcha'}</b>\n"
        f"💰 Бонусы: <b>{bonuses}</b> баллов\n"
        f"📦 Заказов: <b>{orders_count}</b>\n\n"
        f"🆔 Telegram ID: <code>{user.id}</code>"
    )

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🇷🇺 Русский", callback_data="profile:lang:ru"),
            InlineKeyboardButton(text="🇺🇿 O'zbekcha", callback_data="profile:lang:uz"),
        ],
        [InlineKeyboardButton(text="👥 Реферальная ссылка", callback_data="profile:referral")],
        [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
    ])

    await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
    await callback.answer()


@router.callback_query(F.data == "profile:referral")
async def cb_profile_referral(callback: CallbackQuery):
    """Реферальная ссылка из профиля"""
    user_id = callback.from_user.id
    ref_link = f"https://t.me/Microgreenuzbekistan_bot?start=ref_{user_id}"

    await callback.message.edit_text(
        "👥 <b>Пригласи друга — получи бонусы!</b>\n\n"
        f"🔗 Твоя ссылка:\n<code>{ref_link}</code>\n\n"
        "🎁 <b>Бонусы:</b>\n"
        "• Ты: <b>500 баллов</b> за каждого друга\n"
        "• Друг: <b>200 баллов</b> при первом заказе\n\n"
        "📤 Поделитесь с друзьями!",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="« Назад", callback_data="menu:profile")],
        ]),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data.startswith("profile:lang:"))
async def cb_profile_lang(callback: CallbackQuery):
    """Смена языка"""
    lang = callback.data.split(":")[-1]
    await callback.answer(
        f"✅ Язык изменён на {'Русский' if lang == 'ru' else 'Oʻzbekcha'}",
        show_alert=True
    )


# ==================== ИЗБРАННОЕ ====================

_FAV_DIR = Path(__file__).parent.parent / "data" / "favorites"


def _fav_path(user_id: int) -> Path:
    return _FAV_DIR / f"{user_id}.json"


def _load_favs(user_id: int) -> list:
    path = _fav_path(user_id)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save_favs(user_id: int, favs: list) -> None:
    _FAV_DIR.mkdir(parents=True, exist_ok=True)
    _fav_path(user_id).write_text(
        json.dumps(favs, ensure_ascii=False), encoding="utf-8"
    )


@router.callback_query(F.data == "menu:favorites")
async def cb_favorites(callback: CallbackQuery):
    """Показать избранное"""
    favs = _load_favs(callback.from_user.id)

    if not favs:
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🛒 Открыть каталог", callback_data="shop:categories")],
            [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
        ])
        await callback.message.edit_text(
            "❤️ <b>Избранное пусто</b>\n\n"
            "Добавляйте товары в избранное, чтобы быстро\n"
            "находить их потом!\n\n"
            "💡 Нажмите ❤️ на карточке товара в каталоге.",
            reply_markup=kb,
            parse_mode="HTML"
        )
        await callback.answer()
        return

    text = f"❤️ <b>Избранное ({len(favs)})</b>\n\n"
    buttons = []
    for item in favs[:10]:
        price = format_price(item.get("price", 0))
        text += f"• {item['title']} — {price} сум\n"
        buttons.append([InlineKeyboardButton(
            text=f"🛒 {item['title'][:20]}",
            callback_data=f"shop:product:{item['id']}"
        )])

    buttons.append([InlineKeyboardButton(text="🗑 Очистить", callback_data="fav:clear")])
    buttons.append([InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")])

    await callback.message.edit_text(
        text, reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data.startswith("fav:add:"))
async def cb_fav_add(callback: CallbackQuery):
    """Добавить в избранное"""
    product_id = callback.data.split(":", 2)[-1]
    favs = _load_favs(callback.from_user.id)

    if any(f.get("id") == product_id for f in favs):
        await callback.answer("Уже в избранном ❤️")
        return

    product = await bridge.get_product(product_id)
    if product:
        favs.append({
            "id": product_id,
            "title": product.get("title", ""),
            "price": product.get("price", 0),
        })
        _save_favs(callback.from_user.id, favs)
        await callback.answer(f"❤️ {product.get('title', '')} добавлен в избранное!")
    else:
        await callback.answer("Товар не найден")


@router.callback_query(F.data.startswith("fav:remove:"))
async def cb_fav_remove(callback: CallbackQuery):
    """Убрать из избранного"""
    product_id = callback.data.split(":", 2)[-1]
    favs = _load_favs(callback.from_user.id)
    favs = [f for f in favs if f.get("id") != product_id]
    _save_favs(callback.from_user.id, favs)
    await callback.answer("💔 Удалено из избранного")


@router.callback_query(F.data == "fav:clear")
async def cb_fav_clear(callback: CallbackQuery):
    """Очистить избранное"""
    _save_favs(callback.from_user.id, [])
    await callback.answer("🗑 Избранное очищено")
    await cb_favorites(callback)


# ==================== РЕОРДЕР ====================

@router.callback_query(F.data == "menu:reorder")
async def cb_reorder(callback: CallbackQuery):
    """Повторить последний заказ"""
    user = callback.from_user
    user_data = await bridge.get_user_by_telegram_id(user.id)
    phone = user_data.get("phone") if user_data else None

    if not phone:
        await callback.message.edit_text(
            "🔄 <b>Повторить заказ</b>\n\n"
            "У вас пока нет заказов.\n"
            "Оформите первый заказ через каталог!",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🛒 Каталог", callback_data="shop:categories")],
                [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
            ]),
            parse_mode="HTML"
        )
        await callback.answer()
        return

    orders = await bridge.get_orders_by_phone(phone)
    if not orders:
        await callback.message.edit_text(
            "🔄 <b>Повторить заказ</b>\n\nНет предыдущих заказов.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🛒 Каталог", callback_data="shop:categories")],
                [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
            ]),
            parse_mode="HTML"
        )
        await callback.answer()
        return

    last = orders[0]
    items = last.get("items", [])
    total = sum(
        (it.get("price", 0) * it.get("quantity", 1)) for it in items
    )

    text = (
        f"🔄 <b>Повторить заказ #{last['id'][-6:]}</b>\n\n"
    )
    for it in items[:10]:
        qty = it.get("quantity", 1)
        price = it.get("price", 0)
        name = it.get("productName") or it.get("title", "Товар")
        text += f"  • {name} × {qty} = {format_price(price * qty)} сум\n"

    text += f"\n💰 <b>Итого: {format_price(total)} сум</b>"

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Повторить этот заказ", callback_data=f"reorder:confirm:{last['id']}")],
        [InlineKeyboardButton(text="🛒 Лучше выберу сам", callback_data="shop:categories")],
        [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
    ])

    await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
    await callback.answer()


# ==================== ПОИСК ====================

@router.message(Command("search"))
async def cmd_search(message: Message):
    """Поиск товаров: /search руккола"""
    query = message.text.split(maxsplit=1)
    if len(query) < 2:
        await message.answer(
            "🔍 <b>Поиск</b>\n\n"
            "Напишите: /search <i>что ищете</i>\n"
            "Например: /search руккола",
            parse_mode="HTML"
        )
        return

    search_term = query[1].strip().lower()
    products = await bridge.get_products(limit=50)

    found = [
        p for p in products
        if search_term in (p.get("title", "") or "").lower()
        or search_term in (p.get("description", "") or "").lower()
    ]

    if not found:
        await message.answer(
            f"🔍 По запросу «{search_term}» ничего не найдено.\n\n"
            "💡 Попробуйте другой запрос или спросите AI:\n"
            "Напишите свободным текстом, например: «какая микрозелень острая?»"
        )
        return

    text = f"🔍 <b>Найдено: {len(found)}</b>\n\n"
    buttons = []
    for p in found[:8]:
        price = format_price(p.get("price", 0))
        stock = "✅" if p.get("inStock") else "❌"
        text += f"• {p['title']} — {price} сум {stock}\n"
        buttons.append([InlineKeyboardButton(
            text=f"🛒 {p['title'][:25]}",
            callback_data=f"shop:product:{p['id']}"
        )])

    buttons.append([InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")])
    await message.answer(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML"
    )


# ==================== ОТЗЫВЫ ====================

@router.callback_query(F.data.startswith("review:start:"))
async def cb_review_start(callback: CallbackQuery):
    """Начало отзыва — выбор оценки"""
    order_id = callback.data.split(":", 2)[-1]

    stars = []
    for i in range(1, 6):
        stars.append(InlineKeyboardButton(
            text="⭐" * i,
            callback_data=f"review:rate:{order_id}:{i}"
        ))

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [stars[0], stars[1]],
        [stars[2], stars[3]],
        [stars[4]],
        [InlineKeyboardButton(text="Пропустить", callback_data="menu:main")],
    ])

    await callback.message.edit_text(
        "⭐ <b>Оставьте отзыв!</b>\n\n"
        "Как вам наша продукция?\n"
        "Выберите оценку:\n\n"
        "+50 бонусов за отзыв! 🎁",
        reply_markup=kb,
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data.startswith("review:rate:"))
async def cb_review_rate(callback: CallbackQuery):
    """Оценка выставлена — запрос текста"""
    parts = callback.data.split(":")
    order_id = parts[2]
    rating = int(parts[3])

    # Сохраняем через API
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(f"{WEB_API_URL}/reviews", json={
                "rating": rating,
                "orderId": order_id,
                "telegramId": callback.from_user.id,
                "author": callback.from_user.full_name,
            })
    except Exception as e:
        logger.error("Ошибка отзыва: %s", e)

    await callback.message.edit_text(
        f"{'⭐' * rating}\n\n"
        "Спасибо за оценку! 🎉\n"
        "+50 бонусов начислено! 💰\n\n"
        "💬 Хотите написать комментарий?\n"
        "Просто отправьте сообщение в чат.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
        ]),
        parse_mode="HTML"
    )
    await callback.answer("Спасибо! +50 бонусов 🎁")


# ==================== ПОДПИСКИ ====================

@router.callback_query(F.data == "menu:subscription")
async def cb_subscription(callback: CallbackQuery):
    """Подписки на регулярную доставку"""
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📅 Каждую неделю", callback_data="sub:interval:WEEKLY")],
        [InlineKeyboardButton(text="📅 Каждые 2 недели", callback_data="sub:interval:BIWEEKLY")],
        [InlineKeyboardButton(text="📅 Раз в месяц", callback_data="sub:interval:MONTHLY")],
        [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
    ])

    await callback.message.edit_text(
        "📅 <b>Подписка на доставку</b>\n\n"
        "Получайте свежую микрозелень регулярно!\n\n"
        "🎁 <b>Бонус подписки:</b> -10% на каждую доставку\n"
        "🔄 Можно приостановить или отменить в любой момент\n\n"
        "Выберите частоту доставки:",
        reply_markup=kb,
        parse_mode="HTML"
    )
    await callback.answer()
