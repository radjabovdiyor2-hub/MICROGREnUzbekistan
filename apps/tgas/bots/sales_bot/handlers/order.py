"""Sales Bot — Оформление заказа."""
from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.utils import format_price, generate_order_number, simulate_typing
from shared.config import settings
from bots.sales_bot.states import OrderStates
from bots.sales_bot.keyboards.inline import confirm_order_kb, main_menu_kb

router = Router()
DELIVERY_FEE = 25000

@router.callback_query(F.data == "cart:checkout")
async def start_checkout(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.set_state(OrderStates.entering_address)
    await cb.message.edit_text(
        "📍 Введите адрес доставки:" if lang == "ru" else "📍 Yetkazib berish manzilini kiriting:")
    await cb.answer()

@router.message(OrderStates.entering_address)
async def process_address(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(address=message.text)
    await state.set_state(OrderStates.entering_delivery_time)
    await message.answer(
        "⏰ Укажите удобное время доставки (например: 14:00-16:00):" if lang == "ru"
        else "⏰ Qulay yetkazib berish vaqtini kiriting (masalan: 14:00-16:00):")

@router.message(OrderStates.entering_delivery_time)
async def process_time(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(delivery_time=message.text)
    await state.set_state(OrderStates.entering_notes)
    await message.answer(
        "📝 Есть примечания к заказу? (или напишите 'нет'):" if lang == "ru"
        else "📝 Buyurtmaga izoh bormi? (yoki 'yo'q' deb yozing):")

@router.message(OrderStates.entering_notes)
async def process_notes(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(notes=message.text)
    
    cart = data.get("cart", {})
    total = sum(item["price"] * item["qty"] for item in cart.values())
    delivery = 0 if total >= settings.free_delivery_threshold else DELIVERY_FEE
    grand_total = total + delivery
    
    lines = ["📋 <b>Ваш заказ:</b>\n" if lang == "ru" else "📋 <b>Buyurtmangiz:</b>\n"]
    for item in cart.values():
        lines.append(f"• {item['name']} × {item['qty']} = {format_price(item['price'] * item['qty'])}")
    
    lines.append(f"\n💰 Товары: {format_price(total)}")
    lines.append(f"🚚 Доставка: {'Бесплатно' if delivery == 0 else format_price(delivery)}" if lang == "ru"
                 else f"🚚 Yetkazib berish: {'Bepul' if delivery == 0 else format_price(delivery)}")
    lines.append(f"<b>💵 Итого: {format_price(grand_total)}</b>" if lang == "ru"
                 else f"<b>💵 Jami: {format_price(grand_total)}</b>")
    lines.append(f"\n📍 {data.get('address', '-')}")
    lines.append(f"⏰ {data.get('delivery_time', '-')}")
    
    await state.set_state(OrderStates.confirming_order)
    await message.answer("\n".join(lines), reply_markup=confirm_order_kb(lang))

@router.callback_query(OrderStates.confirming_order, F.data == "order:confirm")
async def confirm_order(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    cart = data.get("cart", {})
    total = sum(item["price"] * item["qty"] for item in cart.values())
    delivery = 0 if total >= settings.free_delivery_threshold else DELIVERY_FEE
    
    await simulate_typing(cb.message, delay=1.5)
    
    async with get_session_ctx() as session:
        # Get last order number
        res = await session.execute(text("SELECT order_number FROM orders ORDER BY id DESC LIMIT 1"))
        last = res.scalar()
        order_number = generate_order_number(last)
        
        # Create order
        res = await session.execute(
            text("INSERT INTO orders (customer_id, order_number, total_amount, delivery_fee, status, "
                 "payment_status, delivery_address, notes, created_at, updated_at) "
                 "VALUES ((SELECT id FROM customers WHERE telegram_id = :tid), :onum, :total, :delivery, "
                 "'new', 'pending', :addr, :notes, NOW(), NOW()) RETURNING id"),
            {"tid": cb.from_user.id, "onum": order_number, "total": total + delivery,
             "delivery": delivery, "addr": data.get("address", ""), "notes": data.get("notes", "")})
        order_id = res.scalar()
        
        for pid, item in cart.items():
            await session.execute(
                text("INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price) "
                     "VALUES (:oid, :pid, :qty, :price, :total)"),
                {"oid": order_id, "pid": int(pid), "qty": item["qty"],
                 "price": item["price"], "total": item["price"] * item["qty"]})
    
    await state.update_data(cart={})
    await state.set_state(None)

    # 🔗 EventBus: уведомляем другие боты
    from shared.event_bus import event_bus, Events
    items_summary = ", ".join(f"{i['name']} x{i['qty']}" for i in cart.values())
    await event_bus.publish(Events.ORDER_CREATED, {
        "order_id": order_id, "order_number": order_number,
        "total_amount": total + delivery, "customer_id": None,
        "items_summary": items_summary, "telegram_id": cb.from_user.id
    }, source_bot="sales_bot")

    # 📝 CRM: логируем взаимодействие + создаём follow-up
    try:
        async with get_session_ctx() as session:
            await session.execute(
                text("INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                     "VALUES ((SELECT id FROM customers WHERE telegram_id = :tid), 'telegram', 'order', "
                     "'sales_bot', :summary)"),
                {"tid": cb.from_user.id, "summary": f"Заказ {order_number} на {format_price(total + delivery)}: {items_summary[:150]}"})
            # Follow-up через 2 дня
            await session.execute(
                text("INSERT INTO followups (customer_id, scheduled_at, message, status) "
                     "VALUES ((SELECT id FROM customers WHERE telegram_id = :tid), "
                     "NOW() + INTERVAL '2 days', :msg, 'pending')"),
                {"tid": cb.from_user.id,
                 "msg": f"Здравствуйте! Как вам наша микрозелень из заказа {order_number}? "
                        f"Будем рады вашему отзыву! 🌱"})
            # Обновляем статистику клиента
            await session.execute(
                text("UPDATE customers SET orders_count = orders_count + 1, "
                     "total_spent = total_spent + :amount, last_order_date = NOW(), "
                     "status = CASE WHEN orders_count >= 5 THEN 'vip' "
                     "WHEN orders_count >= 1 THEN 'active' ELSE status END "
                     "WHERE telegram_id = :tid"),
                {"amount": total + delivery, "tid": cb.from_user.id})
    except Exception:
        pass  # Не ломаем заказ из-за CRM

    success = (
        f"🎉 <b>Заказ #{order_number} оформлен!</b>\n\n"
        f"💰 Сумма: {format_price(total + delivery)}\n"
        f"📞 Мы скоро свяжемся с вами для подтверждения.\n"
        f"Телефон: {settings.company_phone}"
    ) if lang == "ru" else (
        f"🎉 <b>#{order_number} buyurtma qabul qilindi!</b>\n\n"
        f"💰 Summa: {format_price(total + delivery)}\n"
        f"📞 Tez orada siz bilan bog'lanamiz.\n"
        f"Telefon: {settings.company_phone}"
    )
    
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    btn_pay = "💳 Оплатить онлайн" if lang == "ru" else "💳 Onlayn to'lov"
    btn_menu = "🏠 Главное меню" if lang == "ru" else "🏠 Asosiy menyu"
    
    pay_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=btn_pay, callback_data=f"pay:{order_id}")],
        [InlineKeyboardButton(text=btn_menu, callback_data="menu:main")]
    ])
    
    await cb.message.edit_text(success, reply_markup=pay_kb)
    await cb.answer()

@router.callback_query(F.data == "order:cancel")
async def cancel_order(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.set_state(None)
    await cb.message.edit_text("❌ Заказ отменён" if lang == "ru" else "❌ Buyurtma bekor qilindi",
                               reply_markup=main_menu_kb(lang))
    await cb.answer()
