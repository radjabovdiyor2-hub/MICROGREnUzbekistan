"""Sales Bot — Inline-клавиатуры"""

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder

# Запасная ссылка на единственный магазин — на случай недоступных настроек.
# Тот же адрес, что в дефолтах витрины (apps/web/src/lib/site.ts).
SHOP_URL_FALLBACK = "https://t.me/Microgreenuzbekistan_bot"


# ── Языковое меню ──
async def main_menu(lang="ru") -> InlineKeyboardMarkup:
    """Главное меню с живой ссылкой на магазин.

    Адрес читается из тех же настроек, что показывает сайт и витринный бот
    (`contacts.telegramBotUrl`): имя бота уже меняли однажды, и вписанные
    строкой ссылки тогда развели по разным местам. Настройки недоступны —
    берём запасное значение, а не рисуем меню без кнопки «Заказать».
    """
    try:
        from shared import settings_store

        url = await settings_store.get("contacts.telegramBotUrl", SHOP_URL_FALLBACK)
    except Exception:  # noqa: BLE001 — меню важнее свежести ссылки
        url = SHOP_URL_FALLBACK
    return main_menu_kb(lang, str(url) or SHOP_URL_FALLBACK)


def language_kb() -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    b.button(text="🇷🇺 Русский", callback_data="lang:ru")
    b.button(text="🇺🇿 O'zbekcha", callback_data="lang:uz")
    b.adjust(2)
    return b.as_markup()


# ── Главное меню ──
#
# Каталога и корзины здесь больше нет. Магазин для покупателя один — витринный
# бот (apps/bot): у него своя корзина, свой каталог по HTTP и та же учётная
# запись, что на сайте. Пока их было два, клиент, писавший одному, для второго
# оставался новым человеком: другие баллы, другая история заказов, два
# независимых способа посчитать доставку.
#
# «Заказать» — ссылка туда же, чтобы человек не упирался в тупик. Ссылка берётся
# из настроек витрины (`contacts.telegramBotUrl`), а не вписывается строкой:
# однажды имя бота уже меняли, и половина ссылок вела в никуда.
def main_menu_kb(lang="ru", shop_url: str = SHOP_URL_FALLBACK) -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    if lang == "uz":
        b.row(InlineKeyboardButton(text="🛒 Buyurtma berish", url=shop_url))
        b.row(
            InlineKeyboardButton(text="🏢 B2B Hamkorlik", callback_data="menu:b2b"),
            InlineKeyboardButton(
                text="💬 Manager bilan chat", callback_data="menu:ai_chat"
            ),
        )
        b.row(
            InlineKeyboardButton(text="📦 Buyurtmalarim", callback_data="menu:orders"),
        )
        b.row(
            InlineKeyboardButton(text="📞 Kontaktlar", callback_data="menu:contacts"),
            InlineKeyboardButton(text="🌐 Til", callback_data="menu:language"),
        )
    else:
        b.row(InlineKeyboardButton(text="🛒 Заказать", url=shop_url))
        b.row(
            InlineKeyboardButton(
                text="🏢 B2B Сотрудничество", callback_data="menu:b2b"
            ),
            InlineKeyboardButton(
                text="💬 Чат с менеджером", callback_data="menu:ai_chat"
            ),
        )
        b.row(
            InlineKeyboardButton(text="📦 Мои заказы", callback_data="menu:orders"),
        )
        b.row(
            InlineKeyboardButton(text="📞 Контакты", callback_data="menu:contacts"),
            InlineKeyboardButton(text="🌐 Язык", callback_data="menu:language"),
        )
    return b.as_markup()


# ── Навигация: назад в меню ──
def back_menu_kb(lang="ru") -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    b.button(
        text="⬅️ Orqaga" if lang == "uz" else "⬅️ Назад", callback_data="nav:main_menu"
    )
    return b.as_markup()
