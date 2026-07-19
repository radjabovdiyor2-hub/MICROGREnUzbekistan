import logging
from aiogram import Router, F, types
from aiogram.filters import Command
from aiogram.types import FSInputFile
from pathlib import Path

from keyboards.magazine import magazine_keyboard

router = Router()
logger = logging.getLogger(__name__)

# Paths relative to the bot's working directory (apps/bot/ in Docker, project root locally)
_CONTENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "content"
COVER_IMAGE_PATH = _CONTENT_DIR / "img" / "cover.png"
PDF_PATH = _CONTENT_DIR / "fresh_weekly_issue_01.pdf"

@router.message(Command("magazine"))
async def cmd_magazine(message: types.Message):
    """Handler for the /magazine command."""
    issue_number = 1
    text = (
        f"🌟 <b>MICROGREEN WEEKLY — Выпуск #{issue_number}</b>\n\n"
        "Главный гастрономический журнал Узбекистана о микрозелени, ресторанах и рецептах!\n\n"
        "В этом выпуске:\n"
        "🍽 <b>Ресторан недели:</b> ORA (Секреты шефа)\n"
        "👩‍🍳 <b>Рецепт недели:</b> Говяжьи медальоны с кейлом\n"
        "🌍 <b>Стрит-фуд:</b> Тако с настурцией\n\n"
        "<i>Используйте AR-магию на обложке печатной версии, чтобы оживить блюда!</i>"
    )
    
    keyboard = magazine_keyboard(issue_number)
    
    if COVER_IMAGE_PATH.exists():
        photo = FSInputFile(COVER_IMAGE_PATH)
        await message.answer_photo(
            photo=photo,
            caption=text,
            reply_markup=keyboard
        )
    else:
        logger.warning("Cover image not found: %s", COVER_IMAGE_PATH)
        await message.answer(text, reply_markup=keyboard)


@router.callback_query(F.data.startswith("mag_pdf_"))
async def handle_magazine_pdf(callback: types.CallbackQuery):
    """Отправляет PDF-файл журнала."""
    issue_number = callback.data.split("_")[-1]
    
    if PDF_PATH.exists():
        await callback.answer("📄 Отправляю PDF...")
        doc = FSInputFile(PDF_PATH, filename=f"FRESH_WEEKLY_{issue_number}.pdf")
        await callback.message.answer_document(
            document=doc,
            caption=f"📖 <b>FRESH WEEKLY — Выпуск #{issue_number}</b>\n12 страниц о микрозелени, ресторанах и рецептах!"
        )
    else:
        logger.warning("PDF not found: %s", PDF_PATH)
        await callback.answer(
            "PDF ещё не готов. Читайте онлайн: microgreenuzbekistan.com/magazine",
            show_alert=True
        )


@router.callback_query(F.data.startswith("mag_print_"))
async def handle_magazine_print_order(callback: types.CallbackQuery):
    """Заказ печатной версии → создаёт заявку через EventBus."""
    issue_number = callback.data.split("_")[-1]
    user = callback.from_user
    
    await callback.message.answer(
        f"📝 <b>Заявка на печатную версию (Выпуск #{issue_number})</b>\n\n"
        "Стоимость: 30 000 сум (включает доставку по Самарканду).\n\n"
        "📞 Для оформления свяжитесь с нами:\n"
        "• Telegram: @microgreen_uz\n"
        "• Телефон: +998 94 999 95 99\n\n"
        f"<i>Ваша заявка зафиксирована. Наш менеджер скоро с вами свяжется! Имя: {user.full_name}</i>"
    )
    await callback.answer()
    
    # Notify Stepan through the Ecosystem Bridge
    from services.ecosystem_bridge import bridge
    msg = (
        f"📖 <b>Новая заявка: Печатный Журнал</b>\n"
        f"Выпуск: #{issue_number}\n"
        f"Клиент: <a href='tg://user?id={user.id}'>{user.full_name}</a> (ID: {user.id})\n"
        f"Username: @{user.username if user.username else 'нет'}\n\n"
        f"Свяжитесь для оформления доставки!"
    )
    await bridge.notify_stepan(msg)
    logger.info("Print order request sent to Stepan: user=%s issue=%s", user.id, issue_number)

