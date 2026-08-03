"""Sales Bot — Оформление заказа."""

from aiogram import Router, F
from aiogram.types import CallbackQuery, Message
from aiogram.fsm.context import FSMContext
from sqlalchemy import text
from shared import storefront_orders
from shared.database import get_session_ctx
from shared.utils import format_price, simulate_typing
from shared.config import settings
from bots.sales_bot.states import OrderStates
from bots.sales_bot.keyboards.inline import confirm_order_kb, main_menu_kb

router = Router()


async def _delivery_terms() -> tuple[int, int]:
    """Стоимость доставки и порог бесплатной — из настроек в админке.

    Раньше цена доставки была вписана сюда числом (25 000), а на сайте
    жила своей константой в lib/site.ts. Владелец, поменяв её в одном
    месте, получал два разных ответа: один в боте, другой на витрине,
    и расхождение ничем не проявлялось до жалобы клиента.

    Дефолты — прежние значения, поэтому при недоступной базе бот считает
    ровно как считал.
    """
    from shared import settings_store

    fee = await settings_store.get_int("delivery.fee", 25000)
    threshold = await settings_store.get_int(
        "delivery.freeThreshold", int(settings.free_delivery_threshold)
    )
    return fee, threshold


@router.callback_query(F.data == "cart:checkout")
async def start_checkout(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.set_state(OrderStates.entering_address)
    await cb.message.edit_text(
        "📍 Введите адрес доставки:"
        if lang == "ru"
        else "📍 Yetkazib berish manzilini kiriting:"
    )
    await cb.answer()


@router.message(OrderStates.entering_address)
async def process_address(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(address=message.text)
    await state.set_state(OrderStates.entering_delivery_time)
    await message.answer(
        "⏰ Укажите удобное время доставки (например: 14:00-16:00):"
        if lang == "ru"
        else "⏰ Qulay yetkazib berish vaqtini kiriting (masalan: 14:00-16:00):"
    )


@router.message(OrderStates.entering_delivery_time)
async def process_time(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(delivery_time=message.text)
    await state.set_state(OrderStates.entering_notes)
    await message.answer(
        "📝 Есть примечания к заказу? (или напишите 'нет'):"
        if lang == "ru"
        else "📝 Buyurtmaga izoh bormi? (yoki 'yo'q' deb yozing):"
    )


@router.message(OrderStates.entering_notes)
async def process_notes(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(notes=message.text)

    cart = data.get("cart", {})
    total = sum(item["price"] * item["qty"] for item in cart.values())
    fee, free_from = await _delivery_terms()
    delivery = 0 if total >= free_from else fee
    grand_total = total + delivery

    lines = ["📋 <b>Ваш заказ:</b>\n" if lang == "ru" else "📋 <b>Buyurtmangiz:</b>\n"]
    for item in cart.values():
        lines.append(
            f"• {item['name']} × {item['qty']} = {format_price(item['price'] * item['qty'])}"
        )

    lines.append(f"\n💰 Товары: {format_price(total)}")
    lines.append(
        f"🚚 Доставка: {'Бесплатно' if delivery == 0 else format_price(delivery)}"
        if lang == "ru"
        else f"🚚 Yetkazib berish: {'Bepul' if delivery == 0 else format_price(delivery)}"
    )
    lines.append(
        f"<b>💵 Итого: {format_price(grand_total)}</b>"
        if lang == "ru"
        else f"<b>💵 Jami: {format_price(grand_total)}</b>"
    )
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
    fee, free_from = await _delivery_terms()
    delivery = 0 if total >= free_from else fee

    await simulate_typing(cb.message, delay=1.5)

    # Заказ создаёт витрина: она владелец заказов и остатков. Свой INSERT здесь
    # писал в таблицу витрины офисными колонками и падал; даже почини колонки —
    # покупка из Telegram не появилась бы ни на сайте, ни в остатках.
    # Витрина же сама зеркалит заказ в CRM и рассылает ORDER_CREATED, поэтому
    # событие отсюда больше не публикуется: иначе доход посчитали бы дважды.
    created = await storefront_orders.create_order(
        customer_name=data.get("customer_name") or cb.from_user.full_name or "Клиент",
        phone=data.get("phone") or "",
        address=data.get("address", ""),
        items=[
            {"id": pid, "price": int(round(item["price"])), "quantity": item["qty"]}
            for pid, item in cart.items()
        ],
        telegram_id=cb.from_user.id,
        note=data.get("notes", "") or None,
    )
    if not created["ok"]:
        await cb.message.edit_text(
            f"⚠️ Не удалось оформить заказ: {created['error']}.\n"
            f"Позвоните нам: {settings.company_phone}"
            if lang == "ru"
            else f"⚠️ Buyurtma rasmiylashtirilmadi: {created['error']}.\n"
            f"Bizga qo'ng'iroq qiling: {settings.company_phone}"
        )
        await cb.answer()
        return

    order_number = created["order"].get("orderNumber") or "—"

    await state.update_data(cart={})
    await state.set_state(None)

    # 📝 CRM: только follow-up.
    # Карточку клиента, журнал взаимодействия и статистику заводит зеркало
    # витрины (/ingest/order) — оно теперь получает и этот заказ. Повтори мы их
    # здесь, у клиента удвоились бы orders_count и total_spent.
    try:
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO followups (customer_id, scheduled_at, message, status) "
                    "SELECT id, NOW() + INTERVAL '2 days', :msg, 'pending' "
                    "FROM customers WHERE telegram_id = :tid"
                ),
                {
                    "tid": cb.from_user.id,
                    "msg": f"Здравствуйте! Как вам наша микрозелень из заказа {order_number}? "
                    f"Будем рады вашему отзыву! 🌱",
                },
            )
    except Exception:
        pass  # Не ломаем заказ из-за CRM

    # Кнопки «Оплатить онлайн» здесь нет и быть не должно.
    #
    # Онлайн-оплаты в системе не существует: способы — наличные, карта, перевод
    # (то же правило, по которому из бота убрали ссылки Click/Payme с
    # merchant ID-заглушками). Кнопка вела в handlers/payments.py, который берёт
    # `settings.payment_provider_token` — такой настройки в shared/config.py нет
    # вовсе, и подставлялся литерал "TEST_TOKEN", то есть счёт не выставлялся
    # никогда. После переезда заказов на витрину она вдобавок стала падать:
    # в callback уходит cuid витрины, а payments.py делает int() и ищет по
    # crm_orders.id. Обещать клиенту оплату, которой нет, — хуже, чем её не
    # предлагать.
    payment_hint = (
        "💳 Оплата при получении: наличные, карта или перевод."
        if lang == "ru"
        else "💳 To'lov qabul qilishda: naqd, karta yoki o'tkazma."
    )
    success = (
        (
            f"🎉 <b>Заказ #{order_number} оформлен!</b>\n\n"
            f"💰 Сумма: {format_price(total + delivery)}\n"
            f"{payment_hint}\n"
            f"📞 Мы скоро свяжемся с вами для подтверждения.\n"
            f"Телефон: {settings.company_phone}"
        )
        if lang == "ru"
        else (
            f"🎉 <b>#{order_number} buyurtma qabul qilindi!</b>\n\n"
            f"💰 Summa: {format_price(total + delivery)}\n"
            f"{payment_hint}\n"
            f"📞 Tez orada siz bilan bog'lanamiz.\n"
            f"Telefon: {settings.company_phone}"
        )
    )

    await cb.message.edit_text(success, reply_markup=main_menu_kb(lang))
    await cb.answer()


@router.callback_query(F.data == "order:cancel")
async def cancel_order(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.set_state(None)
    await cb.message.edit_text(
        "❌ Заказ отменён" if lang == "ru" else "❌ Buyurtma bekor qilindi",
        reply_markup=main_menu_kb(lang),
    )
    await cb.answer()
