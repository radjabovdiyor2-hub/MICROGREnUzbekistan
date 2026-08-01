"""Sales Bot — Telegram Payments."""

from aiogram import Router, F, Bot
from aiogram.types import Message, PreCheckoutQuery, LabeledPrice, CallbackQuery
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.config import settings

router = Router()


@router.callback_query(F.data.startswith("pay:"))
async def process_payment(cb: CallbackQuery, bot: Bot) -> None:
    order_id = cb.data.split(":")[1]

    # Получаем заказ из БД
    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT order_number, total_amount, status FROM orders WHERE id = :oid"
            ),
            {"oid": int(order_id)},
        )
        order = res.fetchone()

    if not order:
        await cb.answer("❌ Заказ не найден.", show_alert=True)
        return

    order_number, total_amount, status = order

    if status in ["cancelled"]:
        await cb.answer("❌ Заказ отменен.", show_alert=True)
        return

    # Формируем счет
    prices = [
        LabeledPrice(label=f"Заказ {order_number}", amount=int(total_amount * 100))
    ]  # В тийинах (копейках)

    # Если токен не настроен
    provider_token = (
        settings.payment_provider_token
        if hasattr(settings, "payment_provider_token")
        else "TEST_TOKEN"
    )

    try:
        await bot.send_invoice(
            chat_id=cb.message.chat.id,
            title=f"Заказ {order_number}",
            description="Оплата свежей микрозелени от Microgreen Uzbekistan 🌱",
            payload=f"mg_order_{order_id}",
            provider_token=provider_token,
            currency="UZS",
            prices=prices,
            start_parameter="mg-bot-payment",
            need_name=False,
            need_phone_number=False,
            need_email=False,
            need_shipping_address=False,
        )
        await cb.answer()
    except Exception:
        await cb.answer(
            "❌ Оплата онлайн пока недоступна (не настроен провайдер). Пожалуйста, оплатите наличными при получении.",
            show_alert=True,
        )


@router.pre_checkout_query()
async def process_pre_checkout_query(pre_checkout_query: PreCheckoutQuery, bot: Bot) -> None:
    await bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)


@router.message(F.successful_payment)
async def process_successful_payment(message: Message) -> None:
    payment_info = message.successful_payment
    payload = payment_info.invoice_payload

    if payload.startswith("mg_order_"):
        order_id = int(payload.split("_")[2])

        # Обновляем статус в БД
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "UPDATE orders SET payment_status = 'paid', payment_method = 'online' WHERE id = :oid"
                ),
                {"oid": order_id},
            )
            await session.commit()

            # Уведомляем Finance Bot
            from shared.event_bus import event_bus

            await event_bus.publish(
                "PAYMENT_RECEIVED",
                {
                    "order_id": order_id,
                    "amount": payment_info.total_amount / 100,
                    "currency": payment_info.currency,
                    "provider_payment_charge_id": payment_info.provider_payment_charge_id,
                    "telegram_payment_charge_id": payment_info.telegram_payment_charge_id,
                },
                "sales_bot",
            )

        await message.answer(
            "✅ <b>Оплата прошла успешно!</b>\n"
            "Спасибо за оплату заказа! Мы уже готовим его к отправке. 🚚",
            parse_mode="HTML",
        )
