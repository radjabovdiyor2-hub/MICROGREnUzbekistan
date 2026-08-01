"""Sales Bot — Inline-клавиатуры"""

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder


# ── Языковое меню ──
def language_kb() -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    b.button(text="🇷🇺 Русский", callback_data="lang:ru")
    b.button(text="🇺🇿 O'zbekcha", callback_data="lang:uz")
    b.adjust(2)
    return b.as_markup()


# ── Главное меню ──
def main_menu_kb(lang: str="ru") -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    if lang == "uz":
        b.row(
            InlineKeyboardButton(text="🛒 Katalog", callback_data="menu:catalog"),
            InlineKeyboardButton(text="📦 Buyurtmalarim", callback_data="menu:orders"),
        )
        b.row(
            InlineKeyboardButton(text="🏢 B2B Hamkorlik", callback_data="menu:b2b"),
            InlineKeyboardButton(
                text="💬 Manager bilan chat", callback_data="menu:ai_chat"
            ),
        )
        b.row(
            InlineKeyboardButton(text="📞 Kontaktlar", callback_data="menu:contacts"),
            InlineKeyboardButton(text="🌐 Til", callback_data="menu:language"),
        )
    else:
        b.row(
            InlineKeyboardButton(text="🛒 Каталог", callback_data="menu:catalog"),
            InlineKeyboardButton(text="📦 Мои заказы", callback_data="menu:orders"),
        )
        b.row(
            InlineKeyboardButton(
                text="🏢 B2B Сотрудничество", callback_data="menu:b2b"
            ),
            InlineKeyboardButton(
                text="💬 Чат с менеджером", callback_data="menu:ai_chat"
            ),
        )
        b.row(
            InlineKeyboardButton(text="📞 Контакты", callback_data="menu:contacts"),
            InlineKeyboardButton(text="🌐 Язык", callback_data="menu:language"),
        )
    return b.as_markup()


# ── Категории товаров ──
def categories_kb(lang: str="ru") -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    cats = [
        ("🌱 Микрозелень", "🌱 Mikrogreens", "cat:microgreens"),
        ("🥬 Бейби лист", "🥬 Baby-leaf", "cat:baby-leaf"),
        ("🥗 Салаты", "🥗 Salatlar", "cat:salads"),
        ("🌸 Цветы", "🌸 Gullar", "cat:flowers"),
        ("🌰 Семена", "🌰 Urug'lar", "cat:seeds"),
        ("🧱 Субстраты", "🧱 Substratlar", "cat:substrate"),
        ("⚙️ Оборудование", "⚙️ Jihozlar", "cat:equipment"),
        ("📦 Наборы", "📦 To'plamlar", "cat:sets"),
    ]
    for ru, uz, cb in cats:
        b.button(text=uz if lang == "uz" else ru, callback_data=cb)
    b.adjust(2)
    b.row(
        InlineKeyboardButton(
            text="⬅️ Orqaga" if lang == "uz" else "⬅️ Назад",
            callback_data="nav:main_menu",
        )
    )
    return b.as_markup()


# ── Навигация: назад в меню ──
def back_menu_kb(lang: str="ru") -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    b.button(
        text="⬅️ Orqaga" if lang == "uz" else "⬅️ Назад", callback_data="nav:main_menu"
    )
    return b.as_markup()


# ── Корзина подтверждение ──
def cart_confirm_kb(lang: str="ru") -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    if lang == "uz":
        b.button(text="✅ Buyurtma berish", callback_data="cart:checkout")
        b.button(text="🗑 Tozalash", callback_data="cart:clear")
        b.button(text="⬅️ Katalog", callback_data="menu:catalog")
    else:
        b.button(text="✅ Оформить заказ", callback_data="cart:checkout")
        b.button(text="🗑 Очистить", callback_data="cart:clear")
        b.button(text="⬅️ Каталог", callback_data="menu:catalog")
    b.adjust(2)
    return b.as_markup()


def confirm_order_kb(lang: str="ru") -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    b.button(
        text="✅ Подтвердить" if lang == "ru" else "✅ Tasdiqlash",
        callback_data="order:confirm",
    )
    b.button(
        text="❌ Отмена" if lang == "ru" else "❌ Bekor qilish",
        callback_data="order:cancel",
    )
    b.adjust(2)
    return b.as_markup()
