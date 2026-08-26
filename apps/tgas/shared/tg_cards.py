"""
Дописать решение в карточку, которая может быть уже недоступна.

ЗАЧЕМ ЭТОТ МОДУЛЬ

В офисе две долгоживущие карточки с кнопками: заявка на подтверждение
(`shared/approvals.py`) и задача (`shared/task_ui.py`). Обе ждут решения
СКОЛЬКО УГОДНО — у заявок это записанное решение («ЗАЯВКА НЕ ИСТЕКАЕТ»),
у задач это просто жизнь: задача висит в `todo`, пока её не закроют.

А Telegram отдаёт сообщение старше 48 часов как `InaccessibleMessage`:
у него нет ни текста, ни `edit_text`, ни `answer`. Оба обработчика звали
эти методы напрямую. Для заявки падение ловилось и в запасном пути звало
`answer` у того же недоступного объекта; у задачи падало ещё раньше — на
`callback.message.chat.id` при сборке события, уже ПОСЛЕ того, как статус
в базе сменился на `done`.

Исход в обоих случаях один и худший из возможных: **действие выполнено, а
владельцу сказано «ошибка»**. Он нажимает второй раз, видит «уже
обработано» и не знает, чему верить.

Правило здесь одно и общее: доступность карточки проверяется явно, а
последний рубеж — новое сообщение в тот же чат. Чат известен даже у
недоступной карточки, а если и его нет — известен тот, кто нажал.
"""

from __future__ import annotations

import logging
from typing import Optional

from aiogram.types import CallbackQuery, InlineKeyboardMarkup, Message

logger = logging.getLogger(__name__)


def chat_id_of(callback: CallbackQuery) -> Optional[int]:
    """Куда писать. У недоступной карточки чат есть, текста нет."""
    if callback.message is not None:
        return callback.message.chat.id
    return callback.from_user.id if callback.from_user else None


async def append(
    callback: CallbackQuery,
    tail: str,
    keyboard: Optional[InlineKeyboardMarkup] = None,
) -> bool:
    """
    Дописать `tail` в карточку. Возвращает, удалось ли сообщить вообще.

    Порядок попыток — от лучшего к худшему:
      1. дописать в саму карточку (кнопки при этом уходят: решение принято);
      2. ответить на неё отдельным сообщением;
      3. написать в тот же чат новым сообщением.

    `False` означает не «действие не выполнено», а «выполнено, но доложить
    не удалось» — и это пишется в лог ошибкой, потому что расхождение между
    сделанным и увиденным дороже самого сбоя доставки.
    """
    message = callback.message

    if isinstance(message, Message):
        try:
            await message.edit_text(
                message.html_text + "\n\n" + tail,
                parse_mode="HTML",
                reply_markup=keyboard,
                # Ссылки в карточках ведут в админку; превью сайта под каждым
                # решением превратило бы переписку в ленту картинок.
                disable_web_page_preview=True,
            )
            return True
        except Exception as exc:
            logger.warning("КАРТОЧКА: не обновилась (%s) — пишу отдельно", exc)
            try:
                await message.answer(tail, parse_mode="HTML")
                return True
            except Exception as exc2:
                logger.warning("КАРТОЧКА: ответ не ушёл: %s", exc2)

    chat_id = chat_id_of(callback)
    if callback.bot is None or chat_id is None:
        logger.error("КАРТОЧКА: решение принято, но сообщить о нём некуда")
        return False
    try:
        await callback.bot.send_message(chat_id, tail, parse_mode="HTML")
        return True
    except Exception as exc:
        logger.error("КАРТОЧКА: решение принято, но доложить не удалось: %s", exc)
        return False
