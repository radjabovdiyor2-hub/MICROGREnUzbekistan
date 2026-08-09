"""HR Bot — Start + All Handlers"""

from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.utils import simulate_typing
from shared.ai_engine import AIEngine
from bots.hr_bot.keyboards.inline import hr_menu_kb, back_kb, leave_type_kb
from bots.hr_bot.states import ApplicationStates, LeaveStates
from shared.prompts import role_prompt

router = Router()
ai = AIEngine()

VACANCIES = [
    (
        "🌱 Фермер микрозелени",
        "Посев, полив, сбор урожая. Опыт не требуется.",
        # prompt-ok: vilka zarplaty v vakansii - ne cena kataloga, svoego istochnika net
        "15 000 - 20 000 сум/день",
    ),
    (
        "🚚 Курьер",
        "Доставка заказов по Самарканду. Авто/мото.",
        # prompt-ok: vilka zarplaty v vakansii - ne cena kataloga, svoego istochnika net
        "20 000 - 30 000 сум/день",
    ),
    # prompt-ok: vilka zarplaty v vakansii - ne cena kataloga, svoego istochnika net
    ("📦 Упаковщик", "Упаковка и маркировка продукции.", "12 000 - 15 000 сум/день"),
    ("📱 SMM-менеджер", "Ведение Instagram и Telegram.", "Договорная"),
]


@router.message(CommandStart())
async def cmd_start(msg: Message):
    await msg.answer(
        "👥 <b>HR Bot</b>\n\nВакансии, заявки и управление персоналом.",
        reply_markup=hr_menu_kb(),
    )


@router.callback_query(F.data == "hr:menu")
async def menu(cb: CallbackQuery):
    await cb.message.edit_text("👥 HR:", reply_markup=hr_menu_kb())
    await cb.answer()


@router.callback_query(F.data == "hr:vacancies")
async def vacancies(cb: CallbackQuery):
    lines = ["📋 <b>Открытые вакансии</b>\n━━━━━━━━━━━━━━━━━━"]
    for title, desc, pay in VACANCIES:
        lines.append(f"\n{title}\n{desc}\n💰 {pay}")
    await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()


@router.callback_query(F.data == "hr:apply")
async def apply(cb: CallbackQuery, state: FSMContext):
    await state.set_state(ApplicationStates.entering_name)
    await cb.message.edit_text("📝 <b>Подача заявки</b>\n\nВведите ваше ФИО:")
    await cb.answer()


@router.message(ApplicationStates.entering_name)
async def app_name(msg: Message, state: FSMContext):
    await state.update_data(name=msg.text)
    await state.set_state(ApplicationStates.entering_phone)
    await msg.answer("📞 Ваш номер телефона:")


@router.message(ApplicationStates.entering_phone)
async def app_phone(msg: Message, state: FSMContext):
    await state.update_data(phone=msg.text)
    await state.set_state(ApplicationStates.entering_position)
    await msg.answer("💼 На какую должность претендуете?")


@router.message(ApplicationStates.entering_position)
async def app_position(msg: Message, state: FSMContext):
    d = await state.get_data()
    async with get_session_ctx() as session:
        await session.execute(
            text(
                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                "VALUES (COALESCE((SELECT id FROM customers WHERE telegram_id = :tid), 1), 'telegram', 'hr_application', 'hr_bot', :s, NOW())"
            ),
            {
                "tid": msg.from_user.id,
                "s": f"HR Заявка: {d['name']} | Тел: {d['phone']} | Должность: {msg.text}",
            },
        )
    await state.clear()
    # 🔗 EventBus: уведомляем PM бота
    from shared.event_bus import event_bus, Events

    await event_bus.publish(
        Events.APPLICATION_RECEIVED,
        {"name": d["name"], "phone": d["phone"], "position": msg.text},
        source_bot="hr_bot",
    )
    await msg.answer(
        f"✅ <b>Заявка принята!</b>\n\n👤 {d['name']}\n📞 {d['phone']}\n💼 {msg.text}\n\nМы свяжемся с вами!",
        reply_markup=hr_menu_kb(),
    )


@router.callback_query(F.data == "hr:shifts")
async def shifts(cb: CallbackQuery):
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT name, role, status FROM crm_employees WHERE status='active' LIMIT 10"
            )
        )
        emps = r.fetchall()
    if not emps:
        await cb.message.edit_text(
            "⏰ Нет активных сотрудников.", reply_markup=back_kb()
        )
    else:
        lines = ["⏰ <b>Табель сотрудников</b>\n━━━━━━━━━━━━━━━━━━"]
        for e in emps:
            lines.append(f"✅ {e.name} — {e.role}")
        await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()


@router.callback_query(F.data == "hr:leave")
async def leave(cb: CallbackQuery, state: FSMContext):
    await state.set_state(LeaveStates.entering_type)
    await cb.message.edit_text(
        "🏖 Выберите тип отсутствия:", reply_markup=leave_type_kb()
    )
    await cb.answer()


@router.callback_query(LeaveStates.entering_type, F.data.startswith("leave:"))
async def leave_type(cb: CallbackQuery, state: FSMContext):
    ltype = cb.data.split(":")[1]
    await state.update_data(leave_type=ltype)
    await state.set_state(LeaveStates.entering_start_date)
    await cb.message.edit_text("📅 Введите дату начала (например, 2024-01-01):")
    await cb.answer()


@router.message(LeaveStates.entering_start_date)
async def leave_start(msg: Message, state: FSMContext):
    await state.update_data(start_date=msg.text)
    await state.set_state(LeaveStates.entering_end_date)
    await msg.answer("📅 Введите дату окончания:")


@router.message(LeaveStates.entering_end_date)
async def leave_end(msg: Message, state: FSMContext):
    await state.update_data(end_date=msg.text)
    await state.set_state(LeaveStates.entering_reason)
    await msg.answer("📝 Введите причину:")


@router.message(LeaveStates.entering_reason)
async def leave_reason(msg: Message, state: FSMContext):
    d = await state.get_data()
    async with get_session_ctx() as session:
        await session.execute(
            text(
                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                "VALUES (COALESCE((SELECT id FROM customers WHERE telegram_id = :tid), 1), 'telegram', 'hr_leave', 'hr_bot', :s, NOW())"
            ),
            {
                "tid": msg.from_user.id,
                "s": f"Отпуск/Больничный: {d['leave_type']} | С: {d['start_date']} По: {d['end_date']} | Причина: {msg.text}",
            },
        )
    await state.clear()

    # 🔗 EventBus: уведомляем PM бота (или HR)
    from shared.event_bus import event_bus, Events

    # Можно отправить просто как NEW_MESSAGE, если нет специального ивента
    await event_bus.publish(
        Events.NEW_MESSAGE,
        {
            "bot": "hr_bot",
            "text": f"Запрос на {d['leave_type']}: {d['start_date']} - {d['end_date']} ({msg.text})",
        },
        source_bot="hr_bot",
    )

    await msg.answer("✅ Запрос на отсутствие сохранён!", reply_markup=hr_menu_kb())


@router.callback_query(F.data == "hr:training")
async def training(cb: CallbackQuery):
    await cb.message.edit_text(
        "📚 <b>Обучение</b>\n━━━━━━━━━━━━━━━━━━\n\n"
        "1. 🌱 Основы микрозелени\n2. 🧪 Гидропоника и аэропоника\n"
        "3. 📦 Упаковка и хранение\n4. 🚚 Логистика доставки\n"
        "5. 💬 Работа с клиентами\n6. 🍽 Микрозелень в HoReCa",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "hr:ai")
async def start_ai(cb: CallbackQuery):
    await cb.message.edit_text("🤖 Задайте HR вопрос:", reply_markup=back_kb())
    await cb.answer()


@router.message(F.text, F.chat.type == "private")
async def ai_hr(msg: Message):
    await simulate_typing(msg, delay=2)
    r = await ai.chat_completion(role_prompt("Ты HR-менеджер Microgreen Uzbekistan."), msg.text)
    await msg.answer(r)
