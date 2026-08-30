import logging
from aiogram import Router, F
from aiogram.types import InlineQuery, InlineQueryResultArticle, InputTextMessageContent
from keyboards.magazine import magazine_keyboard
from services.config_service import fetch_site_config
from services.lang_storage import lang_of
from services.magazine_service import fetch_current_issue

router = Router()

@router.inline_query(F.query.startswith("magazine"))
async def inline_magazine_query(inline_query: InlineQuery):
    """Пересылка номера журнала другу.

    Номер и обложка берутся с витрины (`/api/magazine/current`), а не из
    номера в тексте запроса: пересланная карточка обязана совпадать с тем,
    что откроется по ссылке. Раньше здесь по умолчанию стоял «выпуск 2», и
    друг получал карточку номера, которого на сайте уже не было.
    """
    lang = lang_of(inline_query)
    issue = await fetch_current_issue()
    if issue is None:
        await inline_query.answer([], cache_time=1)
        return

    title = (issue.title_uz or issue.title_ru) if lang == "uz" else issue.title_ru
    summary = ((issue.summary_uz or issue.summary_ru) if lang == "uz" else issue.summary_ru) or ""

    text = (
        f"🌟 <b>FRESH WEEKLY — Выпуск #{issue.number}</b>\n"
        f"<b>{title}</b>\n\n"
        f"{summary}\n\n"
        f"👉 <a href='{issue.magazine_url}'>Читать журнал онлайн</a>"
    )

    # Цена печатного выпуска — из настроек: она стоит на кнопке клавиатуры.
    config = await fetch_site_config()

    result = InlineQueryResultArticle(
        id=f"mag_{issue.number}",
        title=f"FRESH WEEKLY Выпуск #{issue.number}",
        description="Переслать журнал другу",
        thumb_url=issue.cover_url,
        input_message_content=InputTextMessageContent(
            message_text=text,
            parse_mode="HTML",
            disable_web_page_preview=False
        ),
        reply_markup=magazine_keyboard(issue.number, config.magazine_print_price, lang)
    )

    try:
        await inline_query.answer([result], cache_time=1)
    except Exception as e:
        logging.error(f"Error answering inline query: {e}")
