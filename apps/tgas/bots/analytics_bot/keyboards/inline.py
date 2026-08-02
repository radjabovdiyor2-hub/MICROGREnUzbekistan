"""Analytics Bot — Клавиатуры"""

from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton


def an_menu_kb(lang="ru"):
    b = InlineKeyboardBuilder()
    b.row(
        InlineKeyboardButton(text="📊 Дашборд продаж", callback_data="an:dashboard"),
        InlineKeyboardButton(text="🏆 Топ товаров", callback_data="an:top"),
    )
    b.row(
        InlineKeyboardButton(text="👥 Клиенты", callback_data="an:customers"),
        InlineKeyboardButton(text="📈 Прогнозы", callback_data="an:forecast"),
    )
    b.row(
        InlineKeyboardButton(text="📋 ABC-анализ", callback_data="an:abc"),
        InlineKeyboardButton(text="🤖 Спросить AI", callback_data="an:ai"),
    )
    b.row(InlineKeyboardButton(text="🌐 Язык", callback_data="an:lang"))
    return b.as_markup()


def back_kb():
    b = InlineKeyboardBuilder()
    b.button(text="⬅️ Назад", callback_data="an:menu")
    return b.as_markup()


def lang_kb():
    b = InlineKeyboardBuilder()
    b.button(text="🇷🇺 Русский", callback_data="an:setlang:ru")
    b.button(text="🇺🇿 O'zbekcha", callback_data="an:setlang:uz")
    return b.as_markup()
