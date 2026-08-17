"""
👤 CUSTOMER UI — вопрос о тёзке кнопками
=========================================
У продажи такой слой был всегда (`sale_ui`), у клиента — нет. Разница стоила
живого клиента: 16.08.2026 на «Зарегистрируй нового клиента Nozi
+998975773203» бот ответил «Похоже, «Nozi» уже есть… повтори с force_new» и
замолчал. Ответить на это было нечем — кнопок нет, состояние нигде не живёт,
а `force_new` человек ввести не может. Карточка не завелась.

Здесь тот же приём, что и у продажи: незакрытый вопрос лежит в Redis
(`cust:<token>`, TTL час), ответить можно кнопкой ИЛИ словами, и оба пути
ведут в один и тот же вызов `add_customer`.

Отдельно хранится `message_id` заданного вопроса: на него отвечают реплаем
(свайп вправо), и по нему ответ находит свою заявку даже через час и десяток
чужих сообщений.
"""

import json
import logging
import uuid
from typing import Any, Dict, Optional

import redis.asyncio as redis
from aiogram import F, Router
from aiogram.types import CallbackQuery, InlineKeyboardButton, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from shared import tools as tool_registry
from shared.config import settings

logger = logging.getLogger(__name__)
customer_ui_router = Router()

PENDING_TTL = 3600  # час на то, чтобы ответить на уточнение


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


async def save_pending(payload: Dict[str, Any]) -> str:
    token = uuid.uuid4().hex[:10]
    client = _redis()
    try:
        await client.set(
            f"cust:{token}", json.dumps(payload, ensure_ascii=False), ex=PENDING_TTL
        )
    finally:
        await client.aclose()
    return token


async def load_pending(token: str) -> Optional[Dict[str, Any]]:
    client = _redis()
    try:
        raw = await client.get(f"cust:{token}")
    finally:
        await client.aclose()
    return json.loads(raw) if raw else None


async def drop_pending(token: str) -> None:
    client = _redis()
    try:
        await client.delete(f"cust:{token}")
    finally:
        await client.aclose()


async def remember_open(chat_id: int, token: str, message_id: Optional[int]) -> None:
    """Запомнить незакрытый вопрос чата — и сообщение, которым он задан."""
    client = _redis()
    try:
        await client.set(
            f"cust:open:{int(chat_id)}",
            json.dumps({"token": token, "message_id": message_id}),
            ex=PENDING_TTL,
        )
    finally:
        await client.aclose()


async def open_question(chat_id: int) -> Optional[Dict[str, Any]]:
    """Незакрытый вопрос о клиенте в этом чате, если он есть."""
    client = _redis()
    try:
        raw = await client.get(f"cust:open:{int(chat_id)}")
    finally:
        await client.aclose()
    if not raw:
        return None
    entry = json.loads(raw)
    pending = await load_pending(entry["token"])
    if not pending:
        return None  # заявка истекла — вопроса больше нет
    return {
        "token": entry["token"],
        "message_id": entry.get("message_id"),
        "pending": pending,
    }


async def forget_open(chat_id: int) -> None:
    """Вопрос закрыт (ответили, отменили, завели) — забыть."""
    client = _redis()
    try:
        await client.delete(f"cust:open:{int(chat_id)}")
    finally:
        await client.aclose()


def build_confirm_keyboard(token: str, candidates: list):
    """Кнопки: каждый кандидат отдельной строкой, плюс «это новый» и отмена.

    Телефон в кнопке обязателен: имена у заведений похожи, и различает их
    именно номер. Без него выбор «Nozi» и «Noxat» — угадывание.
    """
    builder = InlineKeyboardBuilder()
    for candidate in candidates[:5]:
        mark = "🏢" if candidate.get("customer_type") == "b2b" else "👤"
        phone = candidate.get("phone") or "без телефона"
        builder.button(
            text=f"{mark} Это {candidate['name']} · {phone}",
            callback_data=f"cust:pick:{token}:{candidate['id']}",
        )
    builder.adjust(1)  # телефон длинный — в одну колонку
    builder.row(
        InlineKeyboardButton(
            text="➕ Нет, это новый клиент", callback_data=f"cust:new:{token}"
        ),
        InlineKeyboardButton(text="✖️ Отмена", callback_data=f"cust:cancel:{token}"),
    )
    return builder.as_markup()


async def run_add_customer(params: Dict[str, Any]) -> Dict[str, Any]:
    """Завести клиента инструментом реестра — той же дверью, что и модель."""
    result = await tool_registry.call("add_customer", dict(params or {}))
    return result if isinstance(result, dict) else {"ok": False, "error": str(result)}


async def answer_customer_result(message: Message, result: Dict[str, Any]) -> str:
    """
    Показать результат: карточку, вопрос с кнопками или честную ошибку.
    Возвращает короткую строку для истории диалога Стёпана.
    """
    from shared import tool_render

    data = result.get("data") or {}
    candidates = data.get("candidates") or result.get("candidates") or []

    if result.get("needs") == "confirmation" and data.get("pending"):
        # В заявке лежат и данные будущей карточки, и те, о ком спросили:
        # ответ словами («да») должен знать, какую карточку подтверждают.
        token = await save_pending(
            {"params": data["pending"], "candidates": candidates}
        )
        sent = await message.answer(
            tool_render.customer_confirm(result),
            reply_markup=build_confirm_keyboard(token, candidates),
        )
        await remember_open(message.chat.id, token, getattr(sent, "message_id", None))
        return (
            "Спросил про тёзку: "
            + ", ".join(f"{c['name']} (#{c['id']})" for c in candidates[:3])
            + " — карточка пока не заведена."
        )

    await message.answer(tool_render.customer_confirm(result))
    if result.get("created"):
        return f"Клиент заведён в CRM (#{result.get('customer_id')})."
    if result.get("ok"):
        return f"Клиент уже был в CRM (#{result.get('customer_id')}) — дубль не завёл."
    return f"Клиент не заведён: {result.get('error', 'нет данных')}"


async def confirm_new(chat_id: int) -> Optional[Dict[str, Any]]:
    """«Нет, это новый» — завести отдельную карточку. None — вопроса нет."""
    question = await open_question(chat_id)
    if not question:
        return None

    params = dict(question["pending"].get("params") or {})
    params["force_new"] = True
    result = await run_add_customer(params)
    await drop_pending(question["token"])
    await forget_open(chat_id)
    return result


async def confirm_existing(
    chat_id: int, customer_id: Any = None
) -> Optional[Dict[str, Any]]:
    """«Да, это он» — карточку не заводим, дописываем то, что узнали нового.

    Телефон, город и заметка из распоряжения не пропадают: руководитель их
    назвал, а в старой карточке их могло не быть. `customer_id` передаётся
    явно, поэтому повторный поиск по имени не выполняется и вопрос не
    зацикливается.

    Кандидатов несколько, а номер не назван — не угадываем: «да» отвечает на
    вопрос «это он?», а не «который из них». Просим нажать кнопку.
    """
    question = await open_question(chat_id)
    if not question:
        return None

    record = question["pending"]
    params = record.get("params") or {}
    candidates = record.get("candidates") or []

    target = customer_id
    if not target:
        if len(candidates) != 1:
            return {
                "ok": False,
                "error": "Их несколько — нажмите нужную карточку кнопкой выше.",
            }
        target = candidates[0].get("id")

    await drop_pending(question["token"])
    await forget_open(chat_id)

    if not target:
        return {"ok": False, "error": "Не понял, какую карточку вы имели в виду."}

    from shared import customer_repo

    saved = await customer_repo.upsert(
        customer_id=int(target),
        name=params.get("name") or None,
        raw_phone=params.get("phone") or None,
        customer_type=(params.get("customer_type") or "").lower() or None,
        city=params.get("city") or None,
        notes=params.get("notes") or None,
        source="office",
    )
    return {
        "ok": True,
        "created": False,
        "customer_id": saved.get("id"),
        "summary": (
            f"Понял, это {saved.get('name')} (#{saved.get('id')}). "
            f"Новую карточку не завожу — дописал в существующую."
        ),
    }


@customer_ui_router.callback_query(F.data.startswith("cust:new:"))
async def on_new_customer(callback: CallbackQuery):
    """Руководитель сказал «это другой» — заводим отдельную карточку."""
    try:
        token = callback.data.split(":")[2]
        pending = await load_pending(token)
        if not pending:
            await callback.answer(
                "Этот вопрос уже неактуален (прошёл час).", show_alert=True
            )
            return

        await callback.answer("Принято, завожу…")
        await callback.message.edit_reply_markup(reply_markup=None)

        params = dict(pending.get("params") or {})
        params["force_new"] = True
        result = await run_add_customer(params)
        await drop_pending(token)
        await forget_open(callback.message.chat.id)
        await answer_customer_result(callback.message, result)
    except Exception as exc:
        logger.error(f"cust:new — {exc}", exc_info=True)
        await callback.answer("Не смог завести клиента.", show_alert=True)


@customer_ui_router.callback_query(F.data.startswith("cust:pick:"))
async def on_pick_customer(callback: CallbackQuery):
    """Руководитель подтвердил тёзку — дописываем в его карточку."""
    try:
        _, _, token, customer_id = callback.data.split(":")
        if not await load_pending(token):
            await callback.answer(
                "Этот вопрос уже неактуален (прошёл час).", show_alert=True
            )
            return

        await callback.answer("Принято…")
        await callback.message.edit_reply_markup(reply_markup=None)

        result = await confirm_existing(callback.message.chat.id, customer_id)
        await answer_customer_result(callback.message, result or {})
    except Exception as exc:
        logger.error(f"cust:pick — {exc}", exc_info=True)
        await callback.answer("Не смог обработать выбор.", show_alert=True)


@customer_ui_router.callback_query(F.data.startswith("cust:cancel:"))
async def on_cancel(callback: CallbackQuery):
    try:
        token = callback.data.split(":")[2]
        await drop_pending(token)
        await forget_open(callback.message.chat.id)
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.message.answer("✖️ Отменил — в CRM ничего не записал.")
        await callback.answer()
    except Exception as exc:
        logger.error(f"cust:cancel — {exc}", exc_info=True)
        await callback.answer("Не смог отменить.", show_alert=True)
