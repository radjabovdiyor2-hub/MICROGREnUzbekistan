from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton


def fin_menu_kb():
    b = InlineKeyboardBuilder()
    b.row(
        InlineKeyboardButton(text="💸 Расход", callback_data="fin:expense"),
        InlineKeyboardButton(text="💰 Доход", callback_data="fin:income"),
    )
    b.row(
        InlineKeyboardButton(text="📊 P&L Отчёт", callback_data="fin:pnl"),
        InlineKeyboardButton(text="🏦 Баланс", callback_data="fin:balance"),
    )
    b.row(
        InlineKeyboardButton(text="💳 Дебиторка", callback_data="fin:debts"),
        InlineKeyboardButton(text="💼 Зарплаты", callback_data="fin:salary"),
    )
    b.row(InlineKeyboardButton(text="🤖 AI Финансист", callback_data="fin:ai"))
    return b.as_markup()


def back_kb():
    b = InlineKeyboardBuilder()
    b.button(text="⬅️ Назад", callback_data="fin:menu")
    return b.as_markup()


def expense_categories_kb():
    b = InlineKeyboardBuilder()
    cats = ["salary", "rent", "marketing", "supplies", "taxes", "other"]
    for c in cats:
        b.button(text=c.capitalize(), callback_data=f"exp_cat:{c}")
    b.adjust(2)
    b.row(InlineKeyboardButton(text="⬅️ Отмена", callback_data="fin:menu"))
    return b.as_markup()


def income_categories_kb():
    b = InlineKeyboardBuilder()
    cats = ["sales", "investment", "other"]
    for c in cats:
        b.button(text=c.capitalize(), callback_data=f"inc_cat:{c}")
    b.adjust(2)
    b.row(InlineKeyboardButton(text="⬅️ Отмена", callback_data="fin:menu"))
    return b.as_markup()
