"""
🍽️ FEATURES — Рецепты, профиль, избранное, реордер, отзывы, промо, подписки

Все новые фичи бота, зеркалящие функционал веб-платформы.
Каждый обработчик работает через ecosystem_bridge (HTTP → Web API).
"""

import json
import logging
import os
from pathlib import Path

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
from services.config_service import fetch_site_config
from shared.constants import format_price
from shared.offers import referral_text
from shared.api import api_headers
from shared.i18n import DEFAULT_LANG, t
from services.lang_storage import lang_storage
from services.cart_storage import cart_storage
from handlers.shop import cart_line, cart_totals, totals_text
from shared.screen import render

def lang_of(event) -> str:
    """Язык собеседника: сохранённый выбор, иначе язык клиента Telegram."""
    user = getattr(event, "from_user", None)
    if user is None:
        return DEFAULT_LANG
    return lang_storage.get(user.id, getattr(user, "language_code", None))


router = Router()
logger = logging.getLogger(__name__)

WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://microgreenuzbekistan.com")

# ==================== РЕЦЕПТЫ ====================

@router.callback_query(F.data == "menu:recipes")
async def cb_recipes(callback: CallbackQuery):
    """Рецепт дня из веб-API"""
    lang = lang_of(callback)
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
                        [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
                    ])

                    await render(callback, text, kb)
                    return

        # Fallback — API не вернул рецепт
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📖 Рецепты на сайте", url=f"{WEB_APP_URL}/recipe")],
            [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
        ])
        await render(callback, "🍽️ <b>Рецепты с микрозеленью</b>\n\n"
            "ПП и ЗОЖ рецепты — на нашем сайте!\n"
            "Салаты, смузи, сэндвичи — за 15 минут.\n\n"
            "Или спросите AI: «придумай рецепт с рукколой» 🤖", kb)
    except Exception as e:
        logger.error("Ошибка рецептов: %s", e)
        await render(callback, "🍽️ Рецепты временно недоступны.\n"
            f"Смотрите на сайте: {WEB_APP_URL}/recipe",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
            ])
        )


# ==================== ПРОФИЛЬ ====================

@router.callback_query(F.data == "menu:profile")
async def cb_profile(callback: CallbackQuery):
    """Профиль пользователя"""
    user = callback.from_user
    user_data = await bridge.get_user_by_telegram_id(user.id)
    bonuses = await bridge.get_user_bonuses(user.id)

    # Число заказов считаем по их списку: поля `ordersCount` в ответе роута
    # нет, и `user_data.get("ordersCount", 0)` показывал ноль всем и всегда.
    try:
        orders_count = len(await bridge.get_orders_by_telegram_id(user.id))
    except Exception as exc:
        logger.warning("Профиль: не смог получить заказы: %s", exc)
        orders_count = 0

    if user_data:
        name = user_data.get("firstName") or user.full_name
        phone = user_data.get("phone") or "не указан"
        lang = user_data.get("language", "ru")
    else:
        name = user.full_name
        phone = "не указан"
        lang = "ru"

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
        [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
    ])

    await render(callback, text, kb)


@router.callback_query(F.data == "profile:referral")
async def cb_profile_referral(callback: CallbackQuery):
    """Реферальная ссылка из профиля"""
    lang = lang_of(callback)
    user_id = callback.from_user.id
    ref_link = f"https://t.me/Microgreenuzbekistan_bot?start=ref_{user_id}"

    config = await fetch_site_config()
    await render(callback, referral_text(config, ref_link),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:profile")],
        ]),
        parse_mode="HTML"
    )


@router.callback_query(F.data.startswith("profile:lang:"))
async def cb_profile_lang(callback: CallbackQuery):
    """
    Смена языка — с сохранением.

    Раньше обработчик показывал тост «✅ Язык изменён» и заканчивался: ни
    записи, ни запроса. Профиль при этом читал `language` с витрины, куда
    бот его никогда не писал, а новые пользователи заводятся с `uz` — и
    экран честно сообщал «Oʻzbekcha» посреди русского интерфейса.

    Пишем в двух местах: локально (нужно на каждое сообщение) и на витрину
    (чтобы сайт говорил с человеком так же). Сбой витрины выбор не отменяет —
    зеркало не должно решать за источник.
    """
    lang = lang_storage.set(callback.from_user.id, callback.data.split(":")[-1])

    try:
        await bridge.get_or_create_user(
            callback.from_user.id,
            name=callback.from_user.full_name,
            language=lang,
        )
    except Exception as exc:  # noqa: BLE001 — язык уже сохранён локально
        logger.warning("Язык не доехал до витрины: %s", exc)

    await callback.answer(
        f"{t('lang.saved', lang)} — {t(f'lang.{lang}', lang)}",
        show_alert=True,
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


def is_favorite(user_id: int, product_id: str) -> bool:
    """
    Лежит ли товар в избранном.

    Нужна карточке товара в `shop.py`, чтобы сердечко показывало настоящее
    состояние, а не одну и ту же картинку всегда. Хранение остаётся здесь:
    один владелец файла — один способ его читать.
    """
    return any(str(item.get("id")) == str(product_id) for item in _load_favs(user_id))


def _save_favs(user_id: int, favs: list) -> None:
    _FAV_DIR.mkdir(parents=True, exist_ok=True)
    _fav_path(user_id).write_text(
        json.dumps(favs, ensure_ascii=False), encoding="utf-8"
    )


@router.callback_query(F.data == "menu:favorites")
async def cb_favorites(callback: CallbackQuery):
    """Показать избранное"""
    lang = lang_of(callback)
    favs = _load_favs(callback.from_user.id)

    if not favs:
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=t('btn.catalog', lang), callback_data="shop:categories")],
            [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
        ])
        await render(callback, "❤️ <b>Избранное пусто</b>\n\n"
            "Добавляйте товары в избранное, чтобы быстро\n"
            "находить их потом!\n\n"
            "💡 Нажмите ❤️ на карточке товара в каталоге.", kb)
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
    buttons.append([InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")])

    await render(callback, text, reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML"
    )


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
    lang = lang_of(callback)
    user = callback.from_user
    user_data = await bridge.get_user_by_telegram_id(user.id)
    phone = user_data.get("phone") if user_data else None

    if not phone:
        await render(callback, "🔄 <b>Повторить заказ</b>\n\n"
            "У вас пока нет заказов.\n"
            "Оформите первый заказ через каталог!", InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text=t('btn.catalog', lang), callback_data="shop:categories")],
                [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
            ]))
        return

    orders = await bridge.get_orders_by_phone(phone)
    if not orders:
        await render(callback, "🔄 <b>Повторить заказ</b>\n\nНет предыдущих заказов.", InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text=t('btn.catalog', lang), callback_data="shop:categories")],
                [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
            ]))
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
        [InlineKeyboardButton(text=t('btn.catalog', lang), callback_data="shop:categories")],
        [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
    ])

    await render(callback, text, kb)


# ==================== ПОИСК ====================

@router.message(Command("search"))
async def cmd_search(message: Message):
    """Поиск товаров: /search руккола"""
    lang = lang_of(message)
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

    buttons.append([InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")])
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

    # Обещания «+50 бонусов за отзыв» здесь больше нет: начисления за отзыв
    # не существует ни в одном роуте витрины — баллы не приходили никогда.
    await render(callback, "⭐ <b>Оставьте отзыв!</b>\n\n"
        "Как вам наша продукция?\n"
        "Выберите оценку:", kb)


async def _save_order_review(telegram_id: int, order_id: str, rating: int) -> int:
    """Сохранить оценку как отзыв на каждый товар заказа. Вернуть их число.

    Отзыв на витрине привязан к ТОВАРУ (`userId_productId` — составной ключ),
    а бот присылал `{rating, orderId, telegramId, author}`: ни `productId`, ни
    признака автора, который роут понимает. Каждый отзыв получал 400, ошибку
    глотал `except`, и следом клиенту безусловно писали «Спасибо за оценку!
    +50 бонусов начислено». Не сохранялось ничего: ни отзыв, ни рейтинг
    товара, ни бонусы — вся обратная связь из Telegram терялась.
    """
    try:
        orders = await bridge.get_orders_by_telegram_id(telegram_id)
    except Exception as exc:
        logger.error("Отзыв: не смог получить заказы: %s", exc)
        return 0

    order = next((o for o in orders if str(o.get("id")) == str(order_id)), None)
    if not order:
        logger.warning("Отзыв: заказ %s у клиента %s не найден", order_id, telegram_id)
        return 0

    product_ids = {
        item.get("productId") for item in order.get("items", []) if item.get("productId")
    }
    if not product_ids:
        return 0

    saved = 0
    async with httpx.AsyncClient(timeout=10) as client:
        for product_id in product_ids:
            try:
                resp = await client.post(
                    f"{WEB_API_URL}/reviews",
                    json={
                        "productId": product_id,
                        "rating": rating,
                        "telegramId": telegram_id,
                    },
                    headers=api_headers(),
                )
                if resp.status_code == 200:
                    saved += 1
                else:
                    logger.warning(
                        "Отзыв на %s отклонён: %s %s",
                        product_id,
                        resp.status_code,
                        resp.text[:200],
                    )
            except Exception as exc:
                logger.error("Отзыв на %s не ушёл: %s", product_id, exc)
    return saved


@router.callback_query(F.data.startswith("review:rate:"))
async def cb_review_rate(callback: CallbackQuery):
    """Оценка выставлена — запрос текста"""
    lang = lang_of(callback)
    parts = callback.data.split(":")
    order_id = parts[2]
    rating = int(parts[3])

    saved = await _save_order_review(callback.from_user.id, order_id, rating)

    if saved:
        body = (
            f"{'⭐' * rating}\n\n"
            "Спасибо за оценку! 🎉\n"
            "Она уже видна на странице товара.\n\n"
            "💬 Хотите написать комментарий?\n"
            "Просто отправьте сообщение в чат."
        )
        toast = "Спасибо за отзыв!"
    else:
        body = (
            f"{'⭐' * rating}\n\n"
            "Спасибо! Оценку записать не получилось — попробуйте чуть позже "
            "или напишите нам сообщением, мы учтём вручную."
        )
        toast = "Не удалось сохранить отзыв"

    await render(callback, body,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
        ]),
        parse_mode="HTML"
    )
    await callback.answer(toast)


# ==================== ПОДПИСКИ ====================

# Экран подписки убран.
#
# Он был недостижим — ни одна кнопка не вела на `menu:subscription`, —
# и все три кнопки частоты (`sub:interval:*`) не имели обработчика: нажатие
# крутило спиннер. При этом экран обещал «−10% на каждую доставку».
#
# Реализовать его в боте сейчас НЕЛЬЗЯ: `/api/subscriptions` берёт владельца
# из клиентской cookie (`getCustomerId`), а бот ходит по общему секрету и
# cookie не имеет. Нужна отдельная дверь, как у заказов, где доверенный
# вызывающий передаёт `telegramId`. Это функция, а не починка кнопки.
#
# Подписка — основной канал в финмодели, так что вернуть её стоит; пока
# оформить регулярную доставку можно на сайте.


@router.callback_query(F.data.startswith("reorder:confirm:"))
async def cb_reorder_confirm(callback: CallbackQuery):
    """
    Повторить заказ: перенести его позиции в корзину.

    Кнопка существовала с самого начала и была ГЛАВНОЙ на своём экране, но
    обработчика к ней не было ни одного: нажатие крутило спиннер и не делало
    ничего. Заодно и сам экран до недавнего времени был недостижим — бот не
    находил заказы клиента, потому что витрина не записывала `telegramId`.

    Цену берём из КАТАЛОГА, а не из старого заказа: между покупками она
    могла измениться, и подставлять прошлую значит показать человеку сумму,
    которой при оформлении не будет. Товар, которого больше нет в продаже,
    честно называем — молча пропустить его хуже, чем сказать.
    """
    lang = lang_of(callback)
    order_id = callback.data.split(":", 2)[2]
    user_id = callback.from_user.id

    user_data = await bridge.get_user_by_telegram_id(user_id)
    phone = user_data.get("phone") if user_data else None
    orders = await bridge.get_orders_by_phone(phone) if phone else []

    order = next((o for o in orders if str(o.get("id")) == order_id), None)
    if not order:
        await callback.answer("Заказ не найден — возможно, он уже удалён", show_alert=True)
        return

    added, missing = [], []
    for item in order.get("items", []):
        product_id = item.get("productId") or item.get("id")
        product = await bridge.get_product(product_id) if product_id else None
        if not product or not product.get("in_stock", True):
            missing.append(item.get("productName") or item.get("title") or "товар")
            continue
        product = dict(product)
        product["quantity"] = max(1, int(item.get("quantity", 1) or 1))
        cart_storage.add_to_cart(user_id, product)
        added.append(product)

    if not added:
        await callback.answer(
            "Ни одной позиции из того заказа сейчас нет в наличии.",
            show_alert=True,
        )
        return

    text = "🔄 <b>Позиции добавлены в корзину</b>\n\n"
    for n, product in enumerate(added, start=1):
        text += cart_line(n, product) + "\n"
    if missing:
        text += "\n⚠️ Сейчас нет в наличии: " + ", ".join(missing) + "\n"

    subtotal, delivery, total = await cart_totals(cart_storage.get_cart(user_id))
    text += "\n" + totals_text(subtotal, delivery, total)

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Оформить", callback_data="cart:checkout")],
        [InlineKeyboardButton(text="🛒 Корзина", callback_data="cart:view")],
        [InlineKeyboardButton(text=t('btn.home', lang), callback_data="menu:main")],
    ])

    # Экран мог прийти как фото (из карточки товара) — тогда edit_text падает.
    try:
        await render(callback, text, kb)
    except Exception:
        await callback.message.answer(text, reply_markup=kb, parse_mode="HTML")
