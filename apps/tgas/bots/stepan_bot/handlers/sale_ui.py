"""
🛒 SALE UI — уточнение продажи кнопками
========================================
Отдел продаж не угадывает: если «микрозелень» — это десять позиций каталога, а
«Санго» в каталоге нет, он спрашивает. Раньше вопрос приходил простыней текста,
и руководителю надо было печатать ответ вручную.

Здесь тот же вопрос превращается в кнопки: тапнул позицию → продажа
дозаписывается. Незакрытая продажа лежит в Redis (ключ sale:<token>, TTL 1 час),
поэтому после нажатия она регистрируется целиком, а не по кускам.
"""

import hashlib
import json
import logging
import uuid
from typing import Any, Dict, Optional

import redis.asyncio as redis
from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from shared.config import settings
from shared.utils import format_price

logger = logging.getLogger(__name__)
sale_ui_router = Router()

PENDING_TTL = 3600  # час на то, чтобы ответить на уточнение
ASKED_TTL = 900  # 15 минут: столько же не переспрашиваем про ту же продажу


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


async def save_pending(payload: Dict[str, Any]) -> str:
    token = uuid.uuid4().hex[:10]
    client = _redis()
    try:
        await client.set(
            f"sale:{token}", json.dumps(payload, ensure_ascii=False), ex=PENDING_TTL
        )
    finally:
        await client.aclose()
    return token


async def load_pending(token: str) -> Optional[Dict[str, Any]]:
    client = _redis()
    try:
        raw = await client.get(f"sale:{token}")
    finally:
        await client.aclose()
    return json.loads(raw) if raw else None


async def drop_pending(token: str) -> None:
    client = _redis()
    try:
        await client.delete(f"sale:{token}")
    finally:
        await client.aclose()


def _short(name: str) -> str:
    """«Микрозелень рукколы» → «Рукколы»: в кнопке важна суть, а не общий префикс."""
    for prefix in ("Микрозелень ", "Бейби ", "Салат "):
        if name.startswith(prefix):
            rest = name[len(prefix) :]
            return rest[:1].upper() + rest[1:]
    return name


def _price_short(price: float) -> str:
    """15 000 сум → «15к» — чтобы название и цена влезли в одну кнопку."""
    if price >= 1000:
        return f"{price / 1000:g}к"
    return f"{price:g}"


def _product_button(
    builder: InlineKeyboardBuilder, token: str, index: int, product: Dict[str, Any]
):
    builder.button(
        text=f"{_short(product['name'])} · {_price_short(product['price'])}",
        callback_data=f"sale:pick:{token}:{index}:{product['id']}",
    )


def build_clarify_keyboard(token: str, data: Dict[str, Any]):
    """
    Кнопки на ПЕРВЫЙ незакрытый вопрос: подходящие товары + вход во весь магазин.
    Остальные вопросы зададим следующим шагом — по одному, чтобы не путать.
    """
    builder = InlineKeyboardBuilder()

    ambiguous = data.get("ambiguous") or []
    missing = data.get("missing") or []

    if ambiguous:
        first = ambiguous[0]
        for candidate in first["candidates"][:8]:
            _product_button(builder, token, first["index"], candidate)
        builder.adjust(2)  # две колонки — список не растягивается на экран
        builder.row(
            InlineKeyboardButton(
                text="📂 Весь каталог",
                callback_data=f"sale:cats:{token}:{first['index']}",
            ),
            InlineKeyboardButton(text="✖️ Отмена", callback_data=f"sale:cancel:{token}"),
        )
        return builder.as_markup()

    if missing:
        first = missing[0]
        if not first.get("name"):
            return None  # товар вообще не назван — ждём текст
        if first.get("unit_price"):
            builder.button(
                text=f"➕ Завести «{first['name']}» — {format_price(first['unit_price'])}",
                callback_data=f"sale:add:{token}:{first['index']}",
            )
        builder.button(
            text="📂 Выбрать из каталога",
            callback_data=f"sale:cats:{token}:{first['index']}",
        )
        builder.button(text="✖️ Отмена", callback_data=f"sale:cancel:{token}")
        builder.adjust(1)
        return builder.as_markup()

    return None


async def build_categories_keyboard(token: str, index: int):
    """Экран «Весь каталог»: категории с количеством товаров."""
    from shared.catalog_ops import list_categories

    builder = InlineKeyboardBuilder()
    for cat in await list_categories():
        builder.button(
            text=f"{cat['title']} ({cat['count']})",
            callback_data=f"sale:cat:{token}:{index}:{cat['slug']}:0",
        )
    builder.adjust(2)
    builder.row(
        InlineKeyboardButton(text="✖️ Отмена", callback_data=f"sale:cancel:{token}")
    )
    return builder.as_markup()


async def build_products_keyboard(token: str, index: int, category: str, page: int):
    """Экран категории: товары постранично + листалка."""
    from shared.catalog_ops import list_products

    data = await list_products(category, page)
    builder = InlineKeyboardBuilder()
    for product in data["items"]:
        _product_button(builder, token, index, product)
    builder.adjust(2)

    nav = []
    if page > 0:
        nav.append(
            InlineKeyboardButton(
                text="◀️",
                callback_data=f"sale:cat:{token}:{index}:{category}:{page - 1}",
            )
        )
    nav.append(
        InlineKeyboardButton(
            text=f"{page + 1}/{data['pages']}", callback_data="sale:noop"
        )
    )
    if page + 1 < data["pages"]:
        nav.append(
            InlineKeyboardButton(
                text="▶️",
                callback_data=f"sale:cat:{token}:{index}:{category}:{page + 1}",
            )
        )
    if len(nav) > 1:
        builder.row(*nav)

    builder.row(
        InlineKeyboardButton(
            text="📂 Категории", callback_data=f"sale:cats:{token}:{index}"
        ),
        InlineKeyboardButton(text="✖️ Отмена", callback_data=f"sale:cancel:{token}"),
    )
    return builder.as_markup(), data


async def run_sale(pending: Dict[str, Any]) -> Dict[str, Any]:
    """Продажу регистрирует отдел продаж (bot_bus) — здесь только вызов."""
    from shared.bot_bus import send_task, get_result

    params = dict(pending)
    params["registered_by"] = "sales_bot"
    task_id = await send_task("stepan_bot", "sales_bot", "register_sale", params)
    bus_result = await get_result(task_id, timeout=60)
    if not bus_result or bus_result.get("status") == "error":
        return {
            "status": "error",
            "message": (bus_result or {}).get("error", "отдел не ответил за 60 секунд"),
        }
    return bus_result.get("result") or {
        "status": "error",
        "message": "пустой ответ отдела",
    }


def _sale_signature(pending: Dict[str, Any]) -> str:
    """Отпечаток продажи: клиент + позиции. Одинаковый — значит тот же вопрос."""
    # product_id входит в отпечаток: после выбора кнопкой продажа уже другая,
    # и следующий вопрос («а какой редис?») пройдёт, а не будет считаться дублем.
    items = [
        (i.get("product"), i.get("product_id"), i.get("quantity"), i.get("unit_price"))
        for i in pending.get("items", [])
    ]
    raw = json.dumps(
        [pending.get("customer_name"), items], ensure_ascii=False, sort_keys=True
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


async def _already_asked(signature: str) -> bool:
    """
    Уже спрашивали про эту же продажу? Тогда молчим.

    Модель иногда переспрашивает по второму разу (например, тянет позиции из
    истории диалога при следующем сообщении) — раньше это давало два одинаковых
    вопроса с кнопками, и руководитель видел «отвечает два раза».
    """
    client = _redis()
    try:
        # SET NX: ключ ставится только если его не было — атомарно, без гонок.
        created = await client.set(
            f"sale:asked:{signature}", "1", ex=ASKED_TTL, nx=True
        )
    finally:
        await client.aclose()
    return not created


async def answer_sale_result(message: Message, result: Dict[str, Any]) -> str:
    """
    Показать результат продажи: факты, вопрос с кнопками или честную ошибку.
    Возвращает короткую строку для истории диалога Степана.
    """
    from shared.sales_ops import format_sale_report

    status = result.get("status")

    if status == "ok":
        await message.answer(format_sale_report(result), parse_mode="HTML")
        return f"Отдел продаж зарегистрировал заказ {result['data']['order_number']}."

    if status == "duplicate":
        await message.answer(f"ℹ️ {result.get('message')}")
        return "Продажа уже была зарегистрирована — дубль отклонён."

    if status == "clarify" and (result.get("data") or {}).get("pending"):
        data = result["data"]
        if await _already_asked(_sale_signature(data["pending"])):
            logger.info("Степан: тот же вопрос по продаже уже задан — не дублирую")
            return "Вопрос по этой продаже уже задан выше — жду ответа."

        token = await save_pending(data["pending"])
        keyboard = build_clarify_keyboard(token, data)
        await message.answer(
            f"❓ <b>Отдел продаж:</b> {result.get('message')}",
            parse_mode="HTML",
            reply_markup=keyboard,
        )
        return "Отдел продаж уточняет позицию — продажа пока не записана."

    await message.answer(
        f"❓ <b>Отдел продаж:</b> {result.get('message', 'Не хватает данных.')}",
        parse_mode="HTML",
    )
    return "Отдел продаж запросил уточнение — продажа пока не записана."


@sale_ui_router.callback_query(F.data.startswith("sale:pick:"))
async def on_pick_product(callback: CallbackQuery):
    """Руководитель выбрал позицию каталога — дозаписываем продажу."""
    try:
        _, _, token, index, product_id = callback.data.split(":")
        pending = await load_pending(token)
        if not pending:
            await callback.answer(
                "Этот вопрос уже неактуален (прошёл час).", show_alert=True
            )
            return

        pending["items"][int(index)]["product_id"] = int(product_id)
        await callback.answer("Принято, записываю…")
        await callback.message.edit_reply_markup(reply_markup=None)

        result = await run_sale(pending)
        await drop_pending(token)
        await answer_sale_result(callback.message, result)
    except Exception as e:
        logger.error(f"sale:pick — {e}", exc_info=True)
        await callback.answer("Не смог обработать выбор.", show_alert=True)


@sale_ui_router.callback_query(F.data.startswith("sale:add:"))
async def on_add_product(callback: CallbackQuery, state: FSMContext):
    """
    Одобрено заведение товара → открываем мастер карточки.

    Товар в магазине — это карточка (фото, категория, описание), а не строка
    «название + цена». Название и цену уже знаем из продажи, остальное соберёт
    мастер; после публикации он сам дозапишет продажу.
    """
    try:
        _, _, token, index = callback.data.split(":")
        pending = await load_pending(token)
        if not pending:
            await callback.answer(
                "Этот вопрос уже неактуален (прошёл час).", show_alert=True
            )
            return

        item = pending["items"][int(index)]
        await callback.answer()
        await callback.message.edit_reply_markup(reply_markup=None)

        from bots.stepan_bot.handlers.product_card import start_product_card

        await start_product_card(
            callback.message,
            state,
            name=item.get("product"),
            price=item.get("unit_price"),
            sale_token=token,
            sale_index=int(index),
        )
    except Exception as e:
        logger.error(f"sale:add — {e}", exc_info=True)
        await callback.answer("Не смог открыть карточку товара.", show_alert=True)


@sale_ui_router.callback_query(F.data.startswith("sale:cats:"))
async def on_categories(callback: CallbackQuery):
    """«Весь каталог» — показываем категории прямо в том же сообщении."""
    try:
        _, _, token, index = callback.data.split(":")
        if not await load_pending(token):
            await callback.answer(
                "Этот вопрос уже неактуален (прошёл час).", show_alert=True
            )
            return
        await callback.message.edit_text(
            "📂 <b>Каталог</b> — выберите категорию:",
            parse_mode="HTML",
            reply_markup=await build_categories_keyboard(token, int(index)),
        )
        await callback.answer()
    except Exception as e:
        logger.error(f"sale:cats — {e}", exc_info=True)
        await callback.answer("Не смог открыть каталог.", show_alert=True)


@sale_ui_router.callback_query(F.data.startswith("sale:cat:"))
async def on_category_page(callback: CallbackQuery):
    """Товары категории с листалкой — правим то же сообщение, чат не засоряем."""
    try:
        _, _, token, index, category, page = callback.data.split(":")
        if not await load_pending(token):
            await callback.answer(
                "Этот вопрос уже неактуален (прошёл час).", show_alert=True
            )
            return

        keyboard, data = await build_products_keyboard(
            token, int(index), category, int(page)
        )
        from shared.catalog_ops import CATEGORY_TITLES

        title = CATEGORY_TITLES.get(category, category)
        await callback.message.edit_text(
            f"{title} — {data['total']} товаров. Выберите, что продали:",
            reply_markup=keyboard,
        )
        await callback.answer()
    except Exception as e:
        logger.error(f"sale:cat — {e}", exc_info=True)
        await callback.answer("Не смог показать категорию.", show_alert=True)


@sale_ui_router.callback_query(F.data == "sale:noop")
async def on_noop(callback: CallbackQuery):
    """Кнопка-счётчик страниц («2/3») — просто номер, нажимать нечего."""
    await callback.answer()


@sale_ui_router.callback_query(F.data.startswith("sale:cancel:"))
async def on_cancel(callback: CallbackQuery):
    try:
        token = callback.data.split(":")[2]
        await drop_pending(token)
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.message.answer("✖️ Продажа отменена — в CRM ничего не записано.")
        await callback.answer()
    except Exception as e:
        logger.error(f"sale:cancel — {e}", exc_info=True)
        await callback.answer("Не смог отменить.", show_alert=True)
