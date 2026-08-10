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
from typing import Iterable, Mapping, Optional

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
    ⚠️ НЕ ЭТОТ. Живой генератор — асинхронный `shared.order_utils.
    generate_order_number()`: он берёт advisory lock и читает MAX по
    `crm_orders`, поэтому два параллельных заказа не получат один номер.
    Здесь же номер выводится из переданной строки — вызывающему пришлось
    бы сначала прочитать последний номер, и гонка возвращается.

    Функция оставлена как чистое преобразование (её удобно тестировать и
    она ни от чего не зависит), но из публичной поверхности `shared/__init__`
    убрана: `from shared import generate_order_number` молча отдавал
    именно её вместо асинхронной.

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


# ── Поиск ключевых слов в тексте ──────────────────────────────────────────
#
# 10.08.2026 владелец надиктовал «Поставь этот вопрос на общее заседание», и
# офис попытался опубликовать пост в Instagram. Причина — поиск по подстроке
# сразу в двух списках: «пост» ⊂ «Поставь», «опрос» ⊂ «вопрос». Ни одного
# ложного слова в списках не было; ошибка была в способе сравнения.
#
# «пост» внутри «поставки», «поставщика» и «постоянно» — это же самое, то есть
# половина складских и закупочных формулировок вела бы к публикации.

_ENDINGS = (
    "а|ам|ами|ах|е|ей|ем|и|ии|ий|ию|ия|о|ов|ой|ом|у|ы|ю|я|ы|s|es"
)


def _keyword_pattern(word: str) -> str:
    """Регулярка для одного ключевого слова.

    Три случая, и различаются они формой самого слова:

    * `«слово со словом»` (есть пробел) — фраза, ищется как есть: у фраз
      ложных срабатываний не бывает, а склонять их пришлось бы целиком.
    * `«корень*»` — совпадение по началу слова: так живут «публикац*»,
      «викторин*» — их формы слишком разные, чтобы перечислять.
    * `«слово»` — целое слово с обычными русскими окончаниями. Окончание
      берётся из закрытого списка, поэтому «пост» находится в «посты» и
      «постом», но НЕ в «поставь»: «авь» окончанием не является.
    """
    if " " in word:
        return re.escape(word)
    if word.endswith("*"):
        return r"\b" + re.escape(word[:-1])
    return r"\b" + re.escape(word) + rf"(?:{_ENDINGS})?\b"


def contains_any(text: str, words: "Iterable[str]") -> bool:
    """Есть ли в тексте хоть одно из ключевых слов. Регистр не важен."""
    low = (text or "").lower()
    return any(re.search(_keyword_pattern(w.lower()), low) for w in words)


def first_match(text: str, mapping: "Mapping[str, str]") -> Optional[str]:
    """Значение первого ключа `mapping`, найденного в тексте.

    Порядок обхода — порядок объявления словаря: он значим, первое совпадение
    и выигрывает.
    """
    low = (text or "").lower()
    for word, value in mapping.items():
        if re.search(_keyword_pattern(word.lower()), low):
            return value
    return None


# ── Телефон ───────────────────────────────────────────────────────────────
# Живёт в shared/phone.py — там единственный канон +998XXXXXXXXX и правило
# сравнения по последним девяти цифрам. Здесь были свои копии `normalize_phone`
# и `is_valid_uz_phone`; их никто не импортировал, но они существовали рядом с
# тремя другими копиями и приглашали дописать четвёртую.
#
# Реэкспорт оставлен, чтобы `from shared.utils import normalize_phone`
# не ломался, но новый код должен брать их прямо из shared.phone.
from shared.phone import (  # noqa: E402,F401  (внизу файла — рядом с бывшими копиями)
    is_valid_uz as is_valid_uz_phone,
    normalize as normalize_phone,
)
