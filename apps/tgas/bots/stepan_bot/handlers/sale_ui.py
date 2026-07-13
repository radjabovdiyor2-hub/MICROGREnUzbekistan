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

import json
import logging
import uuid
from typing import Any, Dict, Optional

import redis.asyncio as redis
from aiogram import F, Router
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from shared.config import settings
from shared.utils import format_price

logger = logging.getLogger(__name__)
sale_ui_router = Router()

PENDING_TTL = 3600  # час на то, чтобы ответить на уточнение


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


async def save_pending(payload: Dict[str, Any]) -> str:
    token = uuid.uuid4().hex[:10]
    client = _redis()
    try:
        await client.set(f"sale:{token}", json.dumps(payload, ensure_ascii=False), ex=PENDING_TTL)
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


def build_clarify_keyboard(token: str, data: Dict[str, Any]):
    """
    Кнопки на ПЕРВЫЙ незакрытый вопрос: варианты товара либо «добавить в каталог».
    Остальные вопросы зададим следующим шагом — по одному, чтобы не путать.
    """
    builder = InlineKeyboardBuilder()

    ambiguous = data.get("ambiguous") or []
    missing = data.get("missing") or []

    if ambiguous:
        first = ambiguous[0]
        for candidate in first["candidates"][:10]:
            builder.button(
                text=f"{candidate['name']} — {format_price(candidate['price'])}",
                callback_data=f"sale:pick:{token}:{first['index']}:{candidate['id']}",
            )
    elif missing:
        first = missing[0]
        if not first.get("name"):
            return None  # нечего предлагать — товар вообще не назван
        if first.get("unit_price"):
            builder.button(
                text=f"➕ Добавить «{first['name']}» — {format_price(first['unit_price'])}",
                callback_data=f"sale:add:{token}:{first['index']}",
            )
        else:
            return None  # без цены добавлять нечего — руководитель назовёт её текстом
    else:
        return None

    builder.button(text="✖️ Отменить продажу", callback_data=f"sale:cancel:{token}")
    builder.adjust(1)
    return builder.as_markup()


async def _run_sale(pending: Dict[str, Any]) -> Dict[str, Any]:
    """Продажу регистрирует отдел продаж (bot_bus) — здесь только вызов."""
    from shared.bot_bus import send_task, get_result

    params = dict(pending)
    params["registered_by"] = "sales_bot"
    task_id = await send_task("stepan_bot", "sales_bot", "register_sale", params)
    bus_result = await get_result(task_id, timeout=60)
    if not bus_result or bus_result.get("status") == "error":
        return {"status": "error",
                "message": (bus_result or {}).get("error", "отдел не ответил за 60 секунд")}
    return bus_result.get("result") or {"status": "error", "message": "пустой ответ отдела"}


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
        token = await save_pending(data["pending"])
        keyboard = build_clarify_keyboard(token, data)
        await message.answer(
            f"❓ <b>Отдел продаж:</b> {result.get('message')}",
            parse_mode="HTML",
            reply_markup=keyboard,
        )
        return "Отдел продаж уточняет позицию — продажа пока не записана."

    await message.answer(f"❓ <b>Отдел продаж:</b> {result.get('message', 'Не хватает данных.')}",
                         parse_mode="HTML")
    return "Отдел продаж запросил уточнение — продажа пока не записана."


@sale_ui_router.callback_query(F.data.startswith("sale:pick:"))
async def on_pick_product(callback: CallbackQuery):
    """Руководитель выбрал позицию каталога — дозаписываем продажу."""
    try:
        _, _, token, index, product_id = callback.data.split(":")
        pending = await load_pending(token)
        if not pending:
            await callback.answer("Этот вопрос уже неактуален (прошёл час).", show_alert=True)
            return

        pending["items"][int(index)]["product_id"] = int(product_id)
        await callback.answer("Принято, записываю…")
        await callback.message.edit_reply_markup(reply_markup=None)

        result = await _run_sale(pending)
        await drop_pending(token)
        await answer_sale_result(callback.message, result)
    except Exception as e:
        logger.error(f"sale:pick — {e}", exc_info=True)
        await callback.answer("Не смог обработать выбор.", show_alert=True)


@sale_ui_router.callback_query(F.data.startswith("sale:add:"))
async def on_add_product(callback: CallbackQuery):
    """Одобрено добавление товара: заводим в магазин + CRM и дозаписываем продажу."""
    try:
        _, _, token, index = callback.data.split(":")
        pending = await load_pending(token)
        if not pending:
            await callback.answer("Этот вопрос уже неактуален (прошёл час).", show_alert=True)
            return

        item = pending["items"][int(index)]
        await callback.answer("Добавляю товар…")
        await callback.message.edit_reply_markup(reply_markup=None)

        from shared.bot_bus import send_task, get_result
        task_id = await send_task("stepan_bot", "sales_bot", "add_product", {
            "name": item.get("product"),
            "price": item.get("unit_price"),
            "unit": "piece",
            "category": "microgreens",
        })
        bus_result = await get_result(task_id, timeout=60)
        add_result = (bus_result or {}).get("result") or {}

        if add_result.get("status") not in ("ok", "exists"):
            await callback.message.answer(
                f"⚠️ Товар не добавлен: {add_result.get('message', 'отдел не ответил')}. "
                f"Продажа не записана."
            )
            return

        await callback.message.answer(add_result.get("message", "Товар добавлен."))
        item["product_id"] = (add_result.get("data") or {}).get("product_id")

        result = await _run_sale(pending)
        await drop_pending(token)
        await answer_sale_result(callback.message, result)
    except Exception as e:
        logger.error(f"sale:add — {e}", exc_info=True)
        await callback.answer("Не смог добавить товар.", show_alert=True)


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
