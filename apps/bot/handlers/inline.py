import logging
from aiogram import Router, F
from aiogram.types import InlineQuery, InlineQueryResultArticle, InputTextMessageContent
from keyboards.magazine import magazine_keyboard
from services.config_service import fetch_site_config
from services.lang_storage import lang_of

router = Router()

@router.inline_query(F.query.startswith("magazine"))
async def inline_magazine_query(inline_query: InlineQuery):
    """
    Обработчик inline-запросов для пересылки журнала.
    Запрос имеет вид: "magazine {issue_number}"
    """
    lang = lang_of(inline_query)
    try:
        parts = inline_query.query.split(" ")
        issue_number = int(parts[1]) if len(parts) > 1 else 2
    except ValueError:
        issue_number = 2

    text = (
        f"🌟 <b>FRESH WEEKLY — Выпуск #{issue_number}</b>\n\n"
        "Главный интерактивный гастрономический журнал Узбекистана о микрозелени, ресторанах и рецептах!\n\n"
        # Страницы выпуска по номеру нет — /magazine показывает все выпуски.
        "👉 <a href='https://microgreenuzbekistan.com/magazine'>Читать выпуск онлайн</a>"
    )

    thumb_url = "https://microgreenuzbekistan.com/magazine/img/cover.png"

    # Цена печатного выпуска — из настроек: она стоит на кнопке клавиатуры.
    config = await fetch_site_config()

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
        reply_markup=magazine_keyboard(issue_number, config.magazine_print_price, lang)
    )

    try:
        await inline_query.answer([result], cache_time=1)
    except Exception as e:
        logging.error(f"Error answering inline query: {e}")
