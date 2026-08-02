"""Marketing Bot — Клавиатуры"""

from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton


def mkt_menu_kb(lang="ru"):
    b = InlineKeyboardBuilder()
    b.row(
        InlineKeyboardButton(text="📢 Создать рассылку", callback_data="mkt:campaign"),
        InlineKeyboardButton(text="🏷️ Создать акцию", callback_data="mkt:promo"),
    )
    b.row(
        InlineKeyboardButton(text="👥 Сегменты", callback_data="mkt:segments"),
        InlineKeyboardButton(text="📊 Аналитика", callback_data="mkt:analytics"),
    )
    b.row(
        InlineKeyboardButton(text="💡 AI идеи", callback_data="mkt:ideas"),
        InlineKeyboardButton(text="🔍 Конкуренты", callback_data="mkt:competitors"),
    )
    b.row(InlineKeyboardButton(text="🌐 Язык", callback_data="mkt:lang"))
    return b.as_markup()


def back_kb():
    b = InlineKeyboardBuilder()
    b.button(text="⬅️ Назад", callback_data="mkt:menu")
    return b.as_markup()


def segments_kb():
    b = InlineKeyboardBuilder()
    b.button(text="🏢 B2B", callback_data="mkt:seg:b2b")
    b.button(text="🛒 B2C", callback_data="mkt:seg:b2c")
    b.button(text="⭐ VIP", callback_data="mkt:seg:vip")
    b.button(text="😴 Спящие", callback_data="mkt:seg:churn")
    b.button(text="👥 Все", callback_data="mkt:seg:all")
    b.adjust(2)
    return b.as_markup()


def lang_kb():
    b = InlineKeyboardBuilder()
    b.button(text="🇷🇺 Русский", callback_data="mkt:setlang:ru")
    b.button(text="🇺🇿 O'zbekcha", callback_data="mkt:setlang:uz")
    return b.as_markup()


def confirm_kb():
    b = InlineKeyboardBuilder()
    b.button(text="✅ Отправить", callback_data="mkt:send_yes")
    b.button(text="❌ Отмена", callback_data="mkt:send_no")
    b.adjust(2)
    return b.as_markup()
