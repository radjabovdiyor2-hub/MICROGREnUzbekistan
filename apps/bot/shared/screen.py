"""
Перерисовка экрана бота.

ЗАЧЕМ

`callback.message.edit_text(...)` падает с TelegramBadRequest, если текущее
сообщение — ФОТО. А фото в этом боте появляется на каждом шагу: сетка
каталога и карточка товара отправляются картинкой с подписью. Значит любой
переход «карточка товара → бонусы / профиль / избранное / рецепты» ронял
обработчик, и клиент не получал ни нового экрана, ни ответа на нажатие —
кнопка просто крутила часики.

Так было в пятнадцати местах. Пятнадцать одинаковых `try/except` — это
пятнадцать возможностей забыть один; поэтому один помощник.

ПОЧЕМУ НЕ delete + answer ВСЕГДА

Правка на месте сохраняет позицию переписки: экран меняется там, где на
него смотрят. Отправка нового сообщения уводит вниз и оставляет позади
мёртвый экран со старыми кнопками, которые продолжают работать.
"""

from __future__ import annotations

import logging

from aiogram.types import CallbackQuery, InlineKeyboardMarkup

logger = logging.getLogger(__name__)


async def render(
    callback: CallbackQuery,
    text: str,
    markup: InlineKeyboardMarkup | None = None,
    parse_mode: str = "HTML",
) -> None:
    """
    Показать экран: правкой текущего сообщения, а если нельзя — новым.

    Callback отвечаем здесь же: без `answer()` Telegram крутит «часики» на
    кнопке до истечения времени ожидания, даже когда экран уже сменился.
    """
    try:
        await callback.answer()
    except Exception as exc:  # noqa: BLE001 — устаревший callback не беда
        logger.debug("callback.answer не прошёл: %s", exc)

    try:
        await callback.message.edit_text(text, reply_markup=markup, parse_mode=parse_mode)
        return
    except Exception as exc:  # noqa: BLE001
        # Самая частая причина — сообщение с фотографией: у него нет текста,
        # который можно править. Есть и вторая: Telegram отвечает ошибкой,
        # когда текст и клавиатура совпадают с текущими.
        logger.debug("edit_text не прошёл, отправляем новым сообщением: %s", exc)

    try:
        await callback.message.delete()
    except Exception as exc:  # noqa: BLE001 — сообщение старше 48 часов
        logger.debug("Не удалось удалить прежний экран: %s", exc)

    await callback.message.answer(text, reply_markup=markup, parse_mode=parse_mode)
