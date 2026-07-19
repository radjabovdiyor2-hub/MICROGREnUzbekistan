import logging
from aiogram import Router, F
from aiogram.types import InlineQuery, InlineQueryResultArticle, InputTextMessageContent
from keyboards.magazine import magazine_keyboard

router = Router()

@router.inline_query(F.query.startswith("magazine"))
async def inline_magazine_query(inline_query: InlineQuery):
    """
    Обработчик inline-запросов для пересылки журнала.
    Запрос имеет вид: "magazine {issue_number}"
    """
    try:
        parts = inline_query.query.split(" ")
        issue_number = int(parts[1]) if len(parts) > 1 else 2
    except ValueError:
        issue_number = 2

    text = (
        f"🌟 <b>FRESH WEEKLY — Выпуск #{issue_number}</b>\n\n"
        "Главный интерактивный гастрономический журнал Узбекистана о микрозелени, ресторанах и рецептах!\n\n"
        f"👉 <a href='https://microgreenuzbekistan.com/magazine/{issue_number}'>Читать выпуск онлайн</a>"
    )

    thumb_url = f"https://microgreenuzbekistan.com/magazine/cover_issue_0{issue_number}.png" if issue_number > 1 else "https://microgreenuzbekistan.com/magazine/cover-01.png"

    result = InlineQueryResultArticle(
        id=f"mag_{issue_number}",
        title=f"FRESH WEEKLY Выпуск #{issue_number}",
        description="Переслать журнал другу",
        thumb_url=thumb_url,
        input_message_content=InputTextMessageContent(
            message_text=text,
            parse_mode="HTML",
            disable_web_page_preview=False
        ),
        reply_markup=magazine_keyboard(issue_number)
    )

    try:
        await inline_query.answer([result], cache_time=1)
    except Exception as e:
        logging.error(f"Error answering inline query: {e}")
