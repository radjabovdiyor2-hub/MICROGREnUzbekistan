from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

from shared.i18n import t

SITE_MAGAZINE = "https://microgreenuzbekistan.com/magazine"


def magazine_keyboard(issue_number: int, print_price: int, lang: str) -> InlineKeyboardMarkup:
    """Клавиатура номера журнала.

    `print_price` приходит из настроек (`magazine.printPrice`): цена стояла
    числом и здесь, и в тексте заявки — два места, которые расходятся при
    первой же правке прайса.

    «Читать онлайн» стояла ДВАЖДЫ — отдельной строкой сверху и рядом со
    «Скачать PDF», обе с одним и тем же адресом. Клиент видел один и тот же
    переход дважды и решал, чем они отличаются. Оставлена одна.
    """
    price = f"{print_price:,}".replace(",", " ")
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t("magazine.btn_pdf", lang),
                    callback_data=f"mag_pdf_{issue_number}",
                ),
                InlineKeyboardButton(
                    text=t("magazine.btn_online", lang),
                    url=SITE_MAGAZINE,
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t("magazine.btn_print", lang, price=price),
                    callback_data=f"mag_print_{issue_number}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t("magazine.btn_share", lang),
                    switch_inline_query=f"magazine {issue_number}",
                )
            ],
        ]
    )
