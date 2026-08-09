from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

def magazine_keyboard(issue_number: int, print_price: int) -> InlineKeyboardMarkup:
    """Returns the main magazine keyboard.

    `print_price` приходит из настроек (`magazine.printPrice`): цена стояла
    числом и здесь, и в тексте заявки — два места, которые расходятся при
    первой же правке прайса.
    """
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📖 Читать онлайн",
                    url="https://microgreenuzbekistan.com/magazine"
                )
            ],
            [
                InlineKeyboardButton(
                    text="📄 Скачать PDF",
                    callback_data=f"mag_pdf_{issue_number}"
                ),
                InlineKeyboardButton(
                    text="📖 Читать онлайн",
                    url="https://microgreenuzbekistan.com/magazine"
                )
            ],
            [
                InlineKeyboardButton(
                    text=f"🖨 Заказать печатную копию ({print_price:,} сум)".replace(",", " "),
                    callback_data=f"mag_print_{issue_number}"
                )
            ],
            [
                InlineKeyboardButton(
                    text="📤 Переслать журнал другу",
                    switch_inline_query=f"magazine {issue_number}"
                )
            ]
        ]
    )
