"""
Microgreen Uzbekistan — Утилиты
================================
Вспомогательные функции для всех ботов-сотрудников:
- Форматирование цен в UZS
- Генерация номеров заказов
- Имитация набора текста
- Двуязычные приветствия
- Экранирование Markdown V2
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime
from typing import Optional

from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

# Часовой пояс Узбекистана (UTC+5)
UZ_TIMEZONE = ZoneInfo("Asia/Samarkand")


def format_price(amount: float | int) -> str:
    """
    Форматирование цены в узбекских сумах.

    Разделяет тысячи пробелами и добавляет " сум".

    Примеры:
        format_price(50000)    -> '50 000 сум'
        format_price(1500000)  -> '1 500 000 сум'
        format_price(850.50)   -> '851 сум'
        format_price(0)        -> '0 сум'

    Args:
        amount: Сумма в UZS (число)

    Returns:
        Отформатированная строка с ценой
    """
    # Округляем до целого (в UZS нет копеек)
    rounded = int(round(amount))

    # Форматируем с разделителем тысяч
    if rounded < 0:
        formatted = "-" + f"{abs(rounded):,}".replace(",", " ")
    else:
        formatted = f"{rounded:,}".replace(",", " ")

    return f"{formatted} сум"


def generate_order_number(last_number: Optional[str] = None) -> str:
    """
    Генерация следующего номера заказа в формате MG-XXXXXX.

    Номера идут последовательно: MG-000001, MG-000002, ...
    Если передан last_number — генерирует следующий за ним.
    Если нет — начинает с MG-000001.

    Args:
        last_number: Последний существующий номер заказа (или None)

    Returns:
        Новый номер заказа в формате MG-XXXXXX

    Примеры:
        generate_order_number()              -> 'MG-000001'
        generate_order_number('MG-000042')   -> 'MG-000043'
    """
    if last_number is None:
        return "MG-000001"

    try:
        # Извлекаем числовую часть после "MG-"
        num_part = last_number.split("-", 1)[1]
        next_num = int(num_part) + 1
        return f"MG-{next_num:06d}"
    except (IndexError, ValueError) as e:
        logger.warning(f"Некорректный номер заказа '{last_number}': {e}")
        return "MG-000001"


async def simulate_typing(
    bot_or_message,
    chat_id: int = None,
    seconds: float = 1.5,
    delay: float = None,
) -> None:
    """
    Имитация набора текста в Telegram.

    Принимает Bot+chat_id или объект Message напрямую.
    """
    if delay is not None:
        seconds = delay
    try:
        if hasattr(bot_or_message, "answer"):
            # This is a Message object
            from aiogram.enums import ChatAction

            await bot_or_message.answer_chat_action(ChatAction.TYPING)
        else:
            await bot_or_message.send_chat_action(chat_id=chat_id, action="typing")
        clamped = max(0.3, min(seconds, 5.0))
        await asyncio.sleep(clamped)
    except Exception as e:
        logger.debug(f"Ошибка имитации набора текста: {e}")


def get_greeting(language: str = "ru") -> str:
    """
    Приветствие на основе текущего времени суток в Узбекистане.

    Определяет часовой пояс Asia/Samarkand (UTC+5) и подбирает
    соответствующее приветствие на русском или узбекском.

    Args:
        language: Код языка — 'ru' или 'uz'

    Returns:
        Строка приветствия с эмодзи

    Примеры:
        get_greeting('ru')  -> '☀️ Доброе утро' (утром)
        get_greeting('uz')  -> '🌙 Xayrli kech' (вечером)
    """
    now = datetime.now(UZ_TIMEZONE)
    hour = now.hour

    greetings = {
        "ru": {
            "night": "🌙 Доброй ночи",  # 00:00 - 05:59
            "morning": "☀️ Доброе утро",  # 06:00 - 11:59
            "afternoon": "🌤 Добрый день",  # 12:00 - 17:59
            "evening": "🌆 Добрый вечер",  # 18:00 - 23:59
        },
        "uz": {
            "night": "🌙 Xayrli tun",
            "morning": "☀️ Xayrli tong",
            "afternoon": "🌤 Xayrli kun",
            "evening": "🌆 Xayrli kech",
        },
    }

    lang_greetings = greetings.get(language, greetings["ru"])

    if 0 <= hour < 6:
        return lang_greetings["night"]
    elif 6 <= hour < 12:
        return lang_greetings["morning"]
    elif 12 <= hour < 18:
        return lang_greetings["afternoon"]
    else:
        return lang_greetings["evening"]


def escape_md(text: str) -> str:
    r"""
    Экранирование специальных символов для Telegram MarkdownV2.

    Telegram MarkdownV2 требует экранирования следующих символов:
    _ * [ ] ( ) ~ ` > # + - = | { } . !

    Args:
        text: Исходный текст

    Returns:
        Текст с экранированными спецсимволами

    Примеры:
        escape_md('Цена: 50,000 сум!')  -> 'Цена: 50,000 сум\\!'
        escape_md('Микс (200г)')        -> 'Микс \\(200г\\)'
    """
    # Все спецсимволы MarkdownV2 по документации Telegram
    special_chars = r"_*[]()~`>#+-=|{}.!"

    # Экранируем каждый спецсимвол обратным слешем
    escaped = text
    for char in special_chars:
        escaped = escaped.replace(char, f"\\{char}")

    return escaped


def truncate_text(text: str, max_length: int = 200, suffix: str = "...") -> str:
    """
    Обрезка текста до заданной длины с добавлением суффикса.

    Args:
        text: Исходный текст
        max_length: Максимальная длина (включая суффикс)
        suffix: Суффикс для обрезанного текста

    Returns:
        Обрезанный или исходный текст
    """
    if len(text) <= max_length:
        return text
    return text[: max_length - len(suffix)].rstrip() + suffix


def collapsible(text: str, threshold: int = 550, header: str = "") -> str:
    """
    Длинные ответы в Telegram прячем в разворачиваемую цитату
    (<blockquote expandable> — сворачивается/раскрывается по тапу).
    Короткие оставляем как есть.

    Требует parse_mode="HTML". Тело экранируется, чтобы вёрстка не ломалась.
    """
    import html as _html

    if not text:
        return text
    t = text.strip()
    if len(t) <= threshold:
        return f"{header}\n{t}" if header else t
    head = header or "🔽 <i>Подробно — нажмите, чтобы развернуть:</i>"
    return f"{head}\n<blockquote expandable>{_html.escape(t)}</blockquote>"


def is_valid_uz_phone(phone: str) -> bool:
    """
    Проверка узбекистанского номера телефона.

    Допустимые форматы:
    - +998901234567
    - +998 90 123 45 67
    - 998901234567
    - 901234567

    Args:
        phone: Строка с номером телефона

    Returns:
        True если номер валиден
    """
    # Убираем всё кроме цифр
    digits = re.sub(r"\D", "", phone)

    # Проверяем формат
    if len(digits) == 9 and digits[0] in "97":
        return True  # 901234567
    if len(digits) == 12 and digits.startswith("998"):
        return True  # 998901234567
    return False


def normalize_phone(phone: str) -> str:
    """
    Нормализация номера телефона в формат +998XXXXXXXXX.

    Args:
        phone: Номер в любом формате

    Returns:
        Нормализованный номер или исходная строка при ошибке
    """
    digits = re.sub(r"\D", "", phone)

    if len(digits) == 9 and digits[0] in "97":
        return f"+998{digits}"
    if len(digits) == 12 and digits.startswith("998"):
        return f"+{digits}"

    logger.warning(f"Не удалось нормализовать номер: {phone}")
    return phone
