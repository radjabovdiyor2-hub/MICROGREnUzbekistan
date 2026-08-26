"""Sales Bot — B2B сотрудничество."""

from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.config import settings
from bots.sales_bot.states import B2BStates
from bots.sales_bot.keyboards.inline import main_menu

router = Router()


@router.callback_query(F.data == "menu:b2b")
async def start_b2b(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    text_msg = (
        (
            "🏢 <b>B2B Сотрудничество</b>\n\n"
            "Мы работаем с ресторанами, кафе, отелями и кейтерингом.\n"
            "Специальные цены, регулярные поставки, индивидуальный подход.\n\n"
            "Введите название вашей компании:"
        )
        if lang == "ru"
        else (
            "🏢 <b>B2B Hamkorlik</b>\n\n"
            "Biz restoranlar, kafelar, mehmonxonalar bilan ishlaymiz.\n"
            "Maxsus narxlar, muntazam yetkazib berish.\n\n"
            "Kompaniyangiz nomini kiriting:"
        )
    )
    await state.set_state(B2BStates.entering_company)
    await cb.message.edit_text(text_msg)
    await cb.answer()


@router.message(B2BStates.entering_company)
async def process_company(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(company=message.text)
    await state.set_state(B2BStates.entering_volume)
    await message.answer(
        "📦 Какой примерный объём поставок вас интересует (кг/месяц)?"
        if lang == "ru"
        else "📦 Taxminan qancha hajmda yetkazib berish kerak (kg/oy)?"
    )


@router.message(B2BStates.entering_volume)
async def process_volume(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(volume=message.text)
    await state.set_state(B2BStates.entering_contact)
    await message.answer(
        "📞 Ваш контактный телефон:" if lang == "ru" else "📞 Aloqa telefoningiz:"
    )


@router.message(B2BStates.entering_contact)
async def process_contact(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(contact=message.text)

    # Карточку заводим через единственного писателя `customers`, а не
    # подзапросом внутри INSERT. Подзапрос давал NULL, если человек пишет
    # впервые, и id удалённой карточки, если её вычистили, — заявка в обоих
    # случаях оказывалась ничьей и до менеджера не доходила. `upsert`
    # заводит карточку и воскрешает удалённую.
    from shared import customer_repo

    customer = await customer_repo.upsert(
        telegram_id=message.from_user.id,
        telegram_username=message.from_user.username,
        name=message.from_user.full_name,
        company_name=data.get("company") or None,
        raw_phone=message.text,
        customer_type="b2b",
        status="lead",
        source="telegram",
        language=lang,
    )

    async with get_session_ctx() as session:
        await session.execute(
            text(
                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                "VALUES (:cid, 'telegram', 'b2b_lead', 'sales_bot', :summary, NOW())"
            ),
            {
                "cid": customer["id"],
                "summary": f"B2B: {data.get('company', '')} | Объём: {data.get('volume', '')} | Тел: {message.text}",
            },
        )

    await state.set_state(None)
    success = (
        (
            f"✅ <b>Заявка на B2B сотрудничество принята!</b>\n\n"
            f"🏢 {data.get('company', '')}\n"
            f"📦 Объём: {data.get('volume', '')}\n"
            f"📞 {message.text}\n\n"
            f"Наш менеджер свяжется с вами в ближайшее время.\n"
            f"Или позвоните: {settings.company_phone}"
        )
        if lang == "ru"
        else (
            f"✅ <b>B2B hamkorlik uchun ariza qabul qilindi!</b>\n\n"
            f"🏢 {data.get('company', '')}\n"
            f"📦 Hajm: {data.get('volume', '')}\n"
            f"📞 {message.text}\n\n"
            f"Menejerimiz siz bilan tez orada bog'lanadi.\n"
            f"Yoki qo'ng'iroq qiling: {settings.company_phone}"
        )
    )
    await message.answer(success, reply_markup=await main_menu(lang))
