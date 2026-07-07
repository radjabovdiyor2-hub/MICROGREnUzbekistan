"""Support Bot — Клавиатуры"""
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton
def sup_menu_kb(lang="ru"):
    b = InlineKeyboardBuilder()
    b.row(InlineKeyboardButton(text="❓ FAQ", callback_data="sup:faq"), InlineKeyboardButton(text="📦 Статус заказа", callback_data="sup:order"))
    b.row(InlineKeyboardButton(text="🍽 Рецепты", callback_data="sup:recipes"), InlineKeyboardButton(text="📝 Жалоба", callback_data="sup:complaint"))
    b.row(InlineKeyboardButton(text="🤖 AI Консультант", callback_data="sup:ai"), InlineKeyboardButton(text="🌐 Язык", callback_data="sup:lang"))
    return b.as_markup()
def back_kb():
    b = InlineKeyboardBuilder()
    b.button(text="⬅️ Назад", callback_data="sup:menu")
    return b.as_markup()
def lang_kb():
    b = InlineKeyboardBuilder()
    b.button(text="🇷🇺 Русский", callback_data="sup:setlang:ru")
    b.button(text="🇺🇿 O'zbekcha", callback_data="sup:setlang:uz")
    return b.as_markup()
