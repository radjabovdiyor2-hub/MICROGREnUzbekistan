import logging

from aiogram import Router, F, types
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command
from aiogram.types import URLInputFile

from keyboards.magazine import magazine_keyboard
from services.config_service import fetch_site_config
from services.lang_storage import lang_of
from services.magazine_service import MagazineIssue, fetch_current_issue
from shared.i18n import t

router = Router()
logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
# НОМЕР БЕРЁТСЯ С ВИТРИНЫ, А НЕ ИЗ КОДА БОТА
#
# Раньше номер знали два места. Текстом здесь стояло «Выпуск #2, корейская
# кухня, пибимпаб с микрозеленью», а PDF отдавался по слагу из переменной
# `MAGAZINE_ISSUE_SLUG` — и оба разошлись с реальностью: на сайте вышел
# третий номер «Shakar va tartib», а бот про него не знал и рассказывал про
# второй, присылая при этом файл третьего.
#
# Теперь номер приходит из `/api/magazine/current` — из той же карточки,
# которую владелец публикует в админке. Витрина недоступна — говорим об
# этом прямо и даём ссылку на раздел, а не присылаем что попало.
#
# Файл Telegram забирает по ссылке сам: в образе бота его нет (Dockerfile
# копирует только `apps/bot`), а ограничение на документ по URL — 20 МБ.
# Если номер перевалит за лимит, отправка упадёт — ниже стоит перехват с
# честной ссылкой вместо молчания.
# ══════════════════════════════════════════════════════════════════════


def _issue_title(issue: MagazineIssue, lang: str) -> str:
    return (issue.title_uz or issue.title_ru) if lang == "uz" else issue.title_ru


def _issue_summary(issue: MagazineIssue, lang: str) -> str:
    text = (issue.summary_uz or issue.summary_ru) if lang == "uz" else issue.summary_ru
    return text or ""


@router.message(Command("magazine"))
async def cmd_magazine(message: types.Message):
    """Карточка свежего номера: о чём он и чем его забрать."""
    lang = lang_of(message)
    issue = await fetch_current_issue()

    if issue is None:
        await message.answer(
            t("magazine.unavailable", lang, url="https://microgreenuzbekistan.com/magazine")
        )
        return

    config = await fetch_site_config()
    await message.answer(
        t(
            "magazine.card",
            lang,
            number=issue.number,
            title=_issue_title(issue, lang),
            summary=_issue_summary(issue, lang),
        ),
        reply_markup=magazine_keyboard(issue.number, config.magazine_print_price, lang),
    )


@router.callback_query(F.data.startswith("mag_pdf_"))
async def handle_magazine_pdf(callback: types.CallbackQuery):
    """Отправляет PDF номера."""
    lang = lang_of(callback)
    issue = await fetch_current_issue()

    if issue is None or not issue.pdf_url:
        await callback.answer()
        await callback.message.answer(
            t("magazine.pdf_failed", lang, url="https://microgreenuzbekistan.com/magazine")
        )
        return

    await callback.answer(t("magazine.sending_pdf", lang))
    try:
        await callback.message.answer_document(
            document=URLInputFile(issue.pdf_url, filename=f"FRESH_WEEKLY_{issue.number:02d}.pdf"),
            caption=t("magazine.pdf_caption", lang, number=issue.number),
        )
    except TelegramAPIError:
        # Telegram не смог забрать файл (лимит 20 МБ, сайт недоступен, 404).
        # Ловим именно ошибку API, а не всё подряд: падение по другой причине
        # должно быть видно в логе, а не превращаться в «читайте онлайн».
        logger.exception("Не удалось отправить PDF номера: %s", issue.pdf_url)
        await callback.message.answer(
            t("magazine.pdf_failed", lang, url=issue.magazine_url)
        )


@router.callback_query(F.data.startswith("mag_print_"))
async def handle_magazine_print_order(callback: types.CallbackQuery):
    """Заказ печатной версии → создаёт заявку через EventBus."""
    lang = lang_of(callback)
    issue_number = callback.data.split("_")[-1]
    user = callback.from_user

    # Цена и телефон — из настроек: раньше стояли числом здесь и второй раз в
    # тексте кнопки, и поднять цену можно было только правкой кода в двух местах.
    config = await fetch_site_config()
    price = f"{config.magazine_print_price:,}".replace(",", " ")

    await callback.message.answer(
        t(
            "magazine.print_request",
            lang,
            number=issue_number,
            price=price,
            phone=config.contact_phone,
            name=user.full_name,
        )
    )
    await callback.answer()

    # Notify Stepan through the Ecosystem Bridge
    from services.ecosystem_bridge import bridge
    await bridge.create_magazine_lead(
        telegram_id=user.id,
        phone=None,
        issue_number=int(issue_number),
        address="Unknown"
    )
    msg = (
        f"📖 <b>Новая заявка: Печатный Журнал</b>\n"
        f"Выпуск: #{issue_number}\n"
        f"Клиент: <a href='tg://user?id={user.id}'>{user.full_name}</a> (ID: {user.id})\n"
        f"Username: @{user.username if user.username else 'нет'}\n\n"
        f"Свяжитесь для оформления доставки!"
    )
    await bridge.notify_stepan(msg)
    logger.info("Print order request sent to Stepan: user=%s issue=%s", user.id, issue_number)
