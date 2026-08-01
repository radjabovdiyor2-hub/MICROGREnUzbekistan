"""Степан (Менеджер) — Клавиатуры"""

from aiogram.types import InlineKeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder


def pm_menu_kb(lang: str="ru") -> dict:
    b = InlineKeyboardBuilder()
    if lang == "uz":
        b.row(
            InlineKeyboardButton(
                text="✅ Vazifa yaratish", callback_data="pm:create_task"
            ),
            InlineKeyboardButton(text="📋 Vazifalarim", callback_data="pm:my_tasks"),
        )
        b.row(
            InlineKeyboardButton(
                text="🌱 Ishlab chiqarish", callback_data="pm:production"
            ),
            InlineKeyboardButton(text="🚚 Logistika", callback_data="pm:logistics"),
        )
        b.row(
            InlineKeyboardButton(
                text="📦 Inventarizatsiya", callback_data="pm:inventory"
            ),
            InlineKeyboardButton(text="📝 Standup", callback_data="pm:standup"),
        )
        b.row(
            InlineKeyboardButton(text="📊 Loyiha sharhi", callback_data="pm:overview"),
            InlineKeyboardButton(text="🌐 Til", callback_data="pm:lang"),
        )
    else:
        b.row(
            InlineKeyboardButton(
                text="✅ Создать задачу", callback_data="pm:create_task"
            ),
            InlineKeyboardButton(text="📋 Мои задачи", callback_data="pm:my_tasks"),
        )
        b.row(
            InlineKeyboardButton(text="🌱 Производство", callback_data="pm:production"),
            InlineKeyboardButton(text="🚚 Логистика", callback_data="pm:logistics"),
        )
        b.row(
            InlineKeyboardButton(
                text="📦 Инвентаризация", callback_data="pm:inventory"
            ),
            InlineKeyboardButton(text="📝 Standup", callback_data="pm:standup"),
        )
        b.row(
            InlineKeyboardButton(text="📊 Обзор проекта", callback_data="pm:overview"),
            InlineKeyboardButton(text="🌐 Язык", callback_data="pm:lang"),
        )
    return b.as_markup()


def back_kb(lang: str="ru") -> dict:
    b = InlineKeyboardBuilder()
    b.button(text="⬅️ Назад" if lang == "ru" else "⬅️ Orqaga", callback_data="pm:menu")
    return b.as_markup()


def priority_kb() -> dict:
    b = InlineKeyboardBuilder()
    b.button(text="🔴 Срочно", callback_data="pm:pri:urgent")
    b.button(text="🟡 Высокий", callback_data="pm:pri:high")
    b.button(text="🟢 Средний", callback_data="pm:pri:medium")
    b.button(text="⚪ Низкий", callback_data="pm:pri:low")
    b.adjust(2)
    return b.as_markup()


def confirm_kb(lang: str="ru") -> dict:
    b = InlineKeyboardBuilder()
    b.button(text="✅ Да" if lang == "ru" else "✅ Ha", callback_data="pm:yes")
    b.button(text="❌ Нет" if lang == "ru" else "❌ Yo'q", callback_data="pm:no")
    b.adjust(2)
    return b.as_markup()


def lang_kb() -> dict:
    b = InlineKeyboardBuilder()
    b.button(text="🇷🇺 Русский", callback_data="pm:setlang:ru")
    b.button(text="🇺🇿 O'zbekcha", callback_data="pm:setlang:uz")
    return b.as_markup()
