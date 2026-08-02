from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton


def cnt_menu_kb():
    b = InlineKeyboardBuilder()
    b.row(
        InlineKeyboardButton(text="📸 Instagram пост", callback_data="cnt:insta"),
        InlineKeyboardButton(text="📢 Telegram пост", callback_data="cnt:tg"),
    )
    b.row(
        InlineKeyboardButton(text="📝 Описание товара", callback_data="cnt:desc"),
        InlineKeyboardButton(text="🍽 Рецепт", callback_data="cnt:recipe"),
    )
    b.row(
        InlineKeyboardButton(text="📅 Контент-план", callback_data="cnt:plan"),
        InlineKeyboardButton(text="🤖 AI Копирайтер", callback_data="cnt:ai"),
    )
    return b.as_markup()


def back_kb():
    b = InlineKeyboardBuilder()
    b.button(text="⬅️ Назад", callback_data="cnt:menu")
    return b.as_markup()
