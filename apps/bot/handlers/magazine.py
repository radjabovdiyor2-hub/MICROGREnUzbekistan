import logging
import os
from aiogram import Router, F, types
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command
from aiogram.types import URLInputFile

from keyboards.magazine import magazine_keyboard
from services.config_service import fetch_site_config
from services.lang_storage import lang_of
from shared.i18n import t

router = Router()
logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
# НОМЕР БЕРЁТСЯ С САЙТА, А НЕ С ДИСКА
#
# Раньше PDF искали в локальном каталоге `content/`. В контейнере его нет
# вовсе: Dockerfile копирует только `apps/bot`, поэтому оба кандидата пути
# («/app/content» и «корень репозитория») не существуют, `pdf_path.exists()`
# всегда False, и кнопка «Скачать PDF» молча отвечала «PDF ещё не готов».
# Проверить это на глаз было нельзя — локально каталог есть и всё работает.
#
# Файл и так лежит на сайте, который бот и рекламирует. Telegram умеет
# забирать документ по ссылке сам, поэтому носить его в образе не нужно:
# уходит и рассинхрон «в репозитории один номер, в контейнере другой».
#
# Ограничение Telegram на документ по URL — 20 МБ; номер весит 10,4 МБ.
# Если номер перевалит за лимит, отправка упадёт — на этот случай ниже
# стоит перехват с честной ссылкой вместо молчания.
# ══════════════════════════════════════════════════════════════════════
SITE_URL = os.getenv("NEXT_PUBLIC_URL", "https://microgreenuzbekistan.com").rstrip("/")

# Slug опубликованного номера — тот же, что в apps/web/public/magazine.
# Меняется при выпуске следующего: одно место вместо трёх.
ISSUE_SLUG = os.getenv("MAGAZINE_ISSUE_SLUG", "shakar-01")


def get_issue_pdf_url() -> str:
    return f"{SITE_URL}/magazine/{ISSUE_SLUG}.pdf"


def get_issue_cover_url() -> str:
    """Обложка номера — рядом с его вёрсткой, по тому же слагу.

    В `inline.py` стоял адрес `/magazine/img/cover.png`. Этой картинки в
    репозитории нет: каталог `magazine/img/` пуст. Телеграм не показывает
    превью, которое не смог забрать, — карточка пересылки выходила голой.
    """
    return f"{SITE_URL}/magazine/{ISSUE_SLUG}/{ISSUE_SLUG}-cover.jpg"

@router.message(Command("magazine"))
async def cmd_magazine(message: types.Message):
    """Handler for the /magazine command."""
    lang = lang_of(message)
    issue_number = 2
    text = (
        f"🌟 <b>FRESH WEEKLY — Выпуск #{issue_number}</b>\n\n"
        "Главный гастрономический журнал Узбекистана о микрозелени, ресторанах и рецептах!\n\n"
        "В этом выпуске (Корейская кухня):\n"
        "🍜 <b>Стрит-фуд:</b> Азиатские тренды\n"
        "🥩 <b>Рецепт недели:</b> Пибимпаб с микрозеленью\n"
        "🌱 <b>Фокус:</b> Дайкон и кинза в деле\n\n"
        "<i>Используйте AR-магию на обложке печатной версии, чтобы оживить блюда!</i>"
    )
    
    config = await fetch_site_config()
    keyboard = magazine_keyboard(issue_number, config.magazine_print_price, lang)

    # Обложка отдельным файлом не носится по той же причине, что и PDF: в
    # образе бота её нет. Текст с кнопками — это ровно то, что владелец видел
    # в проде и до правки, только теперь без обещания в логе.
    await message.answer(text, reply_markup=keyboard)


@router.callback_query(F.data.startswith("mag_pdf_"))
async def handle_magazine_pdf(callback: types.CallbackQuery):
    """Отправляет PDF-файл журнала."""
    lang = lang_of(callback)
    issue_number = int(callback.data.split("_")[-1])
    pdf_url = get_issue_pdf_url()

    await callback.answer(t("magazine.sending_pdf", lang))
    try:
        await callback.message.answer_document(
            document=URLInputFile(pdf_url, filename=f"FRESH_WEEKLY_0{issue_number}.pdf"),
            caption=t("magazine.pdf_caption", lang, number=issue_number),
        )
    except TelegramAPIError:
        # Telegram не смог забрать файл (лимит 20 МБ, сайт недоступен, 404).
        # Ловим именно ошибку API, а не всё подряд: падение по другой причине
        # должно быть видно в логе, а не превращаться в «читайте онлайн».
        logger.exception("Не удалось отправить PDF номера: %s", pdf_url)
        await callback.message.answer(
            t("magazine.pdf_failed", lang, url=f"{SITE_URL}/magazine")
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

