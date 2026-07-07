from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton
def hr_menu_kb():
    b = InlineKeyboardBuilder()
    b.row(InlineKeyboardButton(text="📋 Вакансии", callback_data="hr:vacancies"), InlineKeyboardButton(text="📝 Подать заявку", callback_data="hr:apply"))
    b.row(InlineKeyboardButton(text="⏰ Табель", callback_data="hr:shifts"), InlineKeyboardButton(text="🏖 Отпуска", callback_data="hr:leave"))
    b.row(InlineKeyboardButton(text="📚 Обучение", callback_data="hr:training"), InlineKeyboardButton(text="🤖 AI HR", callback_data="hr:ai"))
    return b.as_markup()
def back_kb():
    b = InlineKeyboardBuilder()
    b.button(text="⬅️ Назад", callback_data="hr:menu")
    return b.as_markup()

def leave_type_kb():
    b = InlineKeyboardBuilder()
    b.button(text="🏖 Отпуск", callback_data="leave:annual")
    b.button(text="🤒 Больничный", callback_data="leave:sick")
    b.adjust(2)
    b.row(InlineKeyboardButton(text="⬅️ Отмена", callback_data="hr:menu"))
    return b.as_markup()
