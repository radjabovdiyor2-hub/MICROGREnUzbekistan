import logging
from aiogram import Router, F, types
from aiogram.filters import Command
from aiogram.types import FSInputFile
from pathlib import Path

from keyboards.magazine import magazine_keyboard
from services.config_service import fetch_site_config

router = Router()
logger = logging.getLogger(__name__)

# Paths relative to the bot's working directory (apps/bot/ in Docker, project root locally)
_CONTENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "content"

def get_issue_paths(issue_number: int):
    cover_name = f"cover_issue_0{issue_number}.png" if issue_number > 1 else "cover.png"
    return (
        _CONTENT_DIR / "img" / cover_name,
        _CONTENT_DIR / f"fresh_weekly_issue_0{issue_number}.pdf"
    )

@router.message(Command("magazine"))
async def cmd_magazine(message: types.Message):
    """Handler for the /magazine command."""
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
    keyboard = magazine_keyboard(issue_number, config.magazine_print_price)
    cover_path, _ = get_issue_paths(issue_number)
    
    if cover_path.exists():
        photo = FSInputFile(cover_path)
        await message.answer_photo(
            photo=photo,
            caption=text,
            reply_markup=keyboard
        )
    else:
        logger.warning("Cover image not found: %s", cover_path)
        await message.answer(text, reply_markup=keyboard)


@router.callback_query(F.data.startswith("mag_pdf_"))
async def handle_magazine_pdf(callback: types.CallbackQuery):
    """Отправляет PDF-файл журнала."""
    issue_number = int(callback.data.split("_")[-1])
    _, pdf_path = get_issue_paths(issue_number)
    
    if pdf_path.exists():
        await callback.answer("📄 Отправляю PDF...")
        doc = FSInputFile(pdf_path, filename=f"FRESH_WEEKLY_0{issue_number}.pdf")
        await callback.message.answer_document(
            document=doc,
            caption=f"📖 <b>FRESH WEEKLY — Выпуск #{issue_number}</b>\n12 страниц о микрозелени, ресторанах и рецептах!"
        )
    else:
        logger.warning("PDF not found: %s", pdf_path)
        await callback.answer(
            "PDF ещё не готов. Читайте онлайн: microgreenuzbekistan.com/magazine",
            show_alert=True
        )


@router.callback_query(F.data.startswith("mag_print_"))
async def handle_magazine_print_order(callback: types.CallbackQuery):
    """Заказ печатной версии → создаёт заявку через EventBus."""
    issue_number = callback.data.split("_")[-1]
    user = callback.from_user
    
    # Цена и телефон — из настроек: раньше стояли числом здесь и второй раз в
    # тексте кнопки, и поднять цену можно было только правкой кода в двух местах.
    config = await fetch_site_config()
    price = f"{config.magazine_print_price:,}".replace(",", " ")

    await callback.message.answer(
        f"📝 <b>Заявка на печатную версию (Выпуск #{issue_number})</b>\n\n"
        f"Стоимость: {price} сум (включает доставку по Самарканду).\n\n"
        "📞 Для оформления свяжитесь с нами:\n"
        "• Telegram: @microgreen_uz\n"
        f"• Телефон: {config.contact_phone}\n\n"
        f"<i>Ваша заявка зафиксирована. Наш менеджер скоро с вами свяжется! Имя: {user.full_name}</i>"
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

