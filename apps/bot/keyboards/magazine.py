from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

def magazine_keyboard(issue_number: int) -> InlineKeyboardMarkup:
    """Returns the main magazine keyboard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📖 Читать онлайн",
                    url=f"https://microgreenuzbekistan.com/magazine/{issue_number}"
                )
            ],
            [
                InlineKeyboardButton(
                    text="📄 Скачать PDF",
                    callback_data=f"mag_pdf_{issue_number}"
                ),
                InlineKeyboardButton(
                    text="📸 AR-магия",
                    url="https://microgreenuzbekistan.com/magazine/ar"
                )
            ],
            [
                InlineKeyboardButton(
                    text="🖨 Заказать печатную копию (30 000 сум)",
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
