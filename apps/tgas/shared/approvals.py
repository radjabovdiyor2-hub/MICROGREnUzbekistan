"""
✅ ПОДТВЕРЖДЕНИЕ ВЛАДЕЛЬЦА — ЕДИНЫЙ МЕХАНИЗМ НА ВЕСЬ TELEGRAM
==============================================================
Отделы получили инструменты, которые меняют деньги, цены, каталог и пишут живым
клиентам. Ошибка модели в таком инструменте — это не кривой текст, а изменённые
данные, поэтому исполняется он только после нажатия «Одобрить».

ПОЧЕМУ МЕХАНИЗМ ОДИН

Их было три, и все делали одно и то же по-разному:
  · этот модуль — заявки инструментов отделов (Redis, 15 минут);
  · `_PENDING` в assistant.py — карточки изменяющих действий витрины
    (словарь в памяти процесса: перезапуск бота обнулял всё неподтверждённое);
  · `PENDING_EXEC` в team_meeting.py — планы совещаний (тоже словарь в памяти).
Три хранилища, три префикса callback_data, три набора текстов. Теперь заявка
одна, лежит в Redis и переживает перезапуск, а тип действия задаётся полем
`kind` с обработчиком, который регистрирует владелец логики.

Тот же принцип действует в веб-админке: там write-инструмент возвращает
предложение с подписанным токеном, а не выполняется сразу
(apps/web/src/lib/stepan/proposal.ts). Здесь — телеграм-сторона того же.

КАК ДОБАВИТЬ СВОЙ ТИП

    approvals.register_handler("meeting_plan", run_plan)   # при старте бота
    await approvals.request(bot, chat_id, "meeting_plan",
                            payload={...}, summary="Запустить план")

`run_plan(payload, callback)` вызывается после нажатия ✅ и возвращает строку
для карточки. Ничего не выполняется до нажатия — в этом весь смысл.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Awaitable, Callable, Dict, Optional

from aiogram import Bot, F, Router
from aiogram.types import CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder

from shared import tools as tool_registry
from shared.config import settings

logger = logging.getLogger(__name__)

approvals_router = Router()

KEY_PREFIX = "approval:"
TTL_SECONDS = 15 * 60

#: Тип заявки → что сделать после «Одобрить». Возвращает текст для карточки.
Handler = Callable[[Dict[str, Any], CallbackQuery], Awaitable[str]]
_HANDLERS: Dict[str, Handler] = {}

#: Тип заявки → что прибрать после «Отклонить». Нужен не всем: у отказа обычно
#: нет работы. Но, например, отклонённый план совещания надо снять с «исполнен»,
#: иначе он залипает в meeting_state и мешает следующему.
_REJECT_HANDLERS: Dict[str, Handler] = {}


def register_handler(kind: str, handler: Handler) -> None:
    """Зарегистрировать обработчик типа заявки (вызывать при старте бота)."""
    _HANDLERS[kind] = handler


def register_reject_handler(kind: str, handler: Handler) -> None:
    """Что сделать, если владелец нажал «Отклонить» (необязательно)."""
    _REJECT_HANDLERS[kind] = handler


async def _redis():
    import redis.asyncio as aioredis

    return aioredis.from_url(settings.redis_url, decode_responses=True)


def _owner_chat_id() -> Optional[int]:
    ids = getattr(settings, "admin_telegram_ids", None) or []
    return ids[0] if ids else None


def _fallback_bot() -> Optional[Bot]:
    """Бот Стёпана — запасной канал до владельца.

    У qa_bot, rnd_bot и devops_bot нет Telegram-интерфейса: они зовут
    `execute_bot_task(bot=None)`, и карточку подтверждения слать было нечем.
    Заявка не создавалась, модель получала «подтвердить не удалось», и ЛЮБОЙ
    рискованный инструмент у этих трёх отделов не выполнялся никогда — включая
    `run_backup`, единственное реальное действие DevOps.

    Стёпан подходит: у него есть токен и подключён `approvals_router`,
    а владелец у офиса один. Кнопку всё равно нажимает только он (`is_owner`).
    """
    token = getattr(settings, "stepan_bot_token", "") or ""
    if not token:
        return None
    try:
        from aiogram.client.default import DefaultBotProperties
        from aiogram.enums import ParseMode

        return Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    except Exception as exc:  # токен битый — молча не падаем
        logger.warning("APPROVALS: запасной канал недоступен: %s", exc)
        return None


def is_owner(user_id: Optional[int]) -> bool:
    """Кнопку подтверждения нажимает ТОЛЬКО владелец.

    Проверка здесь, а не у вызывающих: карточка уходит в чат задачи, а отделы
    работают и в групповых чатах — без неё любой участник группы мог одобрить
    регистрацию продажи, рассылку по всей клиентской базе, смену статуса
    заказа, списание со склада или бэкап. Оба механизма, которые этот модуль
    заменил, такую проверку имели (`is_admin` в assistant.py, `_is_admin` в
    team_meeting.py), и при объединении она потерялась.
    """
    ids = getattr(settings, "admin_telegram_ids", None) or []
    return bool(user_id) and user_id in ids


async def request(
    bot: Optional[Bot],
    chat_id: Optional[int],
    kind: str,
    payload: Dict[str, Any],
    summary: str,
    *,
    bot_name: str = "office",
    details: str = "",
) -> Optional[str]:
    """
    Показать владельцу карточку и запомнить заявку. Возвращает токен или None.

    Ничего не выполняется: до нажатия кнопки в данных не меняется ни строки.
    """
    target = chat_id or _owner_chat_id()

    # Безголовый бот (qa/rnd/devops) шлёт карточку через Стёпана, а не молчит.
    # Чат при этом всегда владельца: у чужого бота нет доступа к чату задачи.
    own_bot = bot is not None
    if bot is None:
        bot = _fallback_bot()
        target = _owner_chat_id()

    if bot is None or not target:
        logger.warning("APPROVALS: нет канала до руководителя — заявка %s не создана", kind)
        return None

    token = uuid.uuid4().hex[:16]
    record = {"kind": kind, "payload": payload, "bot": bot_name, "chat_id": target}
    try:
        client = await _redis()
        await client.set(
            KEY_PREFIX + token,
            json.dumps(record, ensure_ascii=False, default=str),
            ex=TTL_SECONDS,
        )
    except Exception as exc:
        logger.warning("APPROVALS: не смог сохранить заявку: %s", exc)
        return None

    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Одобрить", callback_data=f"approve:{token}")
    builder.button(text="❌ Отклонить", callback_data=f"reject:{token}")
    builder.adjust(2)

    body = (
        f"⚠️ <b>Нужно ваше подтверждение</b>\n\n"
        f"<b>От кого:</b> {bot_name}\n"
        f"<b>Действие:</b> {summary}\n"
    )
    if details:
        body += f"\n{details}\n"
    body += "\n<i>В базе пока ничего не изменилось. Кнопки живут 15 минут.</i>"

    try:
        await bot.send_message(
            target, body, parse_mode="HTML", reply_markup=builder.as_markup()
        )
    except Exception as exc:
        logger.warning("APPROVALS: карточка не доставлена: %s", exc)
        return None
    finally:
        # Запасного бота создали здесь — здесь же и закрываем сессию,
        # иначе aiohttp течёт по одному соединению на каждую заявку.
        if not own_bot:
            try:
                await bot.session.close()
            except Exception:
                pass
    return token


async def request_approval(
    bot: Optional[Bot],
    tool: tool_registry.Tool,
    args: Dict[str, Any],
    *,
    bot_name: str,
    chat_id: Optional[int] = None,
) -> str:
    """
    Отправить на подтверждение вызов рискованного инструмента.

    Возвращает текст для модели — он попадёт в её контекст, поэтому формулировка
    важна: модель не должна решить, что действие уже выполнено.
    """
    token = await request(
        bot,
        chat_id,
        "tool",
        {"tool": tool.name, "args": args},
        tool.summary(args),
        bot_name=bot_name,
    )
    if not token:
        return (
            f"{tool.name}: подтвердить не удалось (нет канала до руководителя "
            f"или недоступен Redis). Действие НЕ выполнено — так и скажи."
        )
    return (
        f"{tool.name}: отправлено руководителю на подтверждение. "
        f"Действие ПОКА НЕ выполнено — сообщи, что ждём решения, "
        f"и не описывай результат как достигнутый."
    )


def approver(bot: Optional[Bot], bot_name: str, chat_id: Optional[int] = None):
    """Готовая функция `approve` для shared/tool_runtime.run_tool_loop."""

    async def _approve(tool: tool_registry.Tool, args: Dict[str, Any]) -> str:
        return await request_approval(
            bot, tool, args, bot_name=bot_name, chat_id=chat_id
        )

    return _approve


async def _take(token: str) -> Optional[Dict[str, Any]]:
    """Забрать заявку. Одноразово: повторное нажатие не выполнит действие дважды."""
    try:
        client = await _redis()
        key = KEY_PREFIX + token
        raw = await client.get(key)
        if not raw:
            return None
        await client.delete(key)
        return json.loads(raw)
    except Exception as exc:
        logger.warning("APPROVALS: не смог прочитать заявку %s: %s", token, exc)
        return None


async def _run_tool(payload: Dict[str, Any], callback: CallbackQuery) -> str:
    result = await tool_registry.call(payload["tool"], payload.get("args") or {})
    return tool_registry.normalize_result(result)["summary"]


_HANDLERS["tool"] = _run_tool


@approvals_router.callback_query(F.data.startswith("approve:"))
async def on_approve(callback: CallbackQuery):
    if not is_owner(callback.from_user.id if callback.from_user else None):
        await callback.answer("⛔ Только для руководителя", show_alert=True)
        return

    token = callback.data.split(":", 1)[1]
    request_data = await _take(token)
    if not request_data:
        await callback.answer("Заявка истекла или уже обработана", show_alert=True)
        return

    handler = _HANDLERS.get(request_data.get("kind", ""))
    if handler is None:
        await callback.answer("Некому выполнить это действие", show_alert=True)
        logger.error(
            "APPROVALS: нет обработчика для типа %r — заявка потеряна",
            request_data.get("kind"),
        )
        return

    await callback.answer("Выполняю…")
    try:
        message = await handler(request_data.get("payload") or {}, callback)
    except Exception as exc:
        logger.exception("APPROVALS: обработчик %s упал: %s", request_data.get("kind"), exc)
        message = f"Не выполнено: {exc}"

    await _finish(callback, f"✅ <b>Одобрено.</b>\n{message}")


@approvals_router.callback_query(F.data.startswith("reject:"))
async def on_reject(callback: CallbackQuery):
    # Отказ тоже только для владельца: иначе посторонний мог бы «отклонить»
    # заявку и тем самым отменить решение руководителя.
    if not is_owner(callback.from_user.id if callback.from_user else None):
        await callback.answer("⛔ Только для руководителя", show_alert=True)
        return

    token = callback.data.split(":", 1)[1]
    request_data = await _take(token)
    if not request_data:
        await callback.answer("Заявка истекла или уже обработана", show_alert=True)
        return

    await callback.answer("Отклонено")
    handler = _REJECT_HANDLERS.get(request_data.get("kind", ""))
    tail = "❌ <b>Отклонено.</b> Ничего не изменилось."
    if handler is not None:
        try:
            note = await handler(request_data.get("payload") or {}, callback)
            if note:
                tail += f"\n{note}"
        except Exception as exc:
            logger.exception(
                "APPROVALS: обработчик отказа %s упал: %s", request_data.get("kind"), exc
            )
    await _finish(callback, tail)


async def _finish(callback: CallbackQuery, tail: str) -> None:
    try:
        await callback.message.edit_text(
            callback.message.html_text + "\n\n" + tail, parse_mode="HTML"
        )
    except Exception:
        await callback.message.answer(tail, parse_mode="HTML")
