import logging
import re
from datetime import datetime
from typing import Dict, Optional
from shared.config import settings

logger = logging.getLogger(__name__)

async def _publish_order_to_stepan(order: Dict, from_name: str, from_id: str) -> None:
    order_number = None
    order_id = None
    total_amount = 0

    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text as sa_text

        async with get_session_ctx() as session:
            phone = order.get("phone", "")
            norm_phone = None
            if phone:
                digits = re.sub(r"[^\d]", "", str(phone))
                if digits:
                    if len(digits) == 9:
                        norm_phone = f"+998{digits}"
                    elif len(digits) == 12 and digits.startswith("998"):
                        norm_phone = f"+{digits}"
                    else:
                        norm_phone = (
                            f"+{digits}"
                            if not str(phone).startswith("+")
                            else str(phone)
                        )

            customer_id = None
            if norm_phone:
                res = await session.execute(
                    sa_text("SELECT id FROM customers WHERE phone = :phone LIMIT 1"),
                    {"phone": norm_phone},
                )
                row = res.fetchone()
                if row:
                    customer_id = row[0]

            if not customer_id:
                res = await session.execute(
                    sa_text("SELECT id FROM customers WHERE name = :name LIMIT 1"),
                    {"name": from_name},
                )
                row = res.fetchone()
                if row:
                    customer_id = row[0]

            if customer_id:
                if norm_phone:
                    await session.execute(
                        sa_text(
                            "UPDATE customers SET phone = COALESCE(phone, :phone) WHERE id = :cid"
                        ),
                        {"phone": norm_phone, "cid": customer_id},
                    )
            else:
                res = await session.execute(
                    sa_text(
                        "INSERT INTO customers (name, phone, status, notes, source, created_at) "
                        "VALUES (:name, :phone, 'active', 'Instagram DM', 'instagram', NOW()) RETURNING id"
                    ),
                    {"name": from_name, "phone": norm_phone or phone},
                )
                customer_id = res.fetchone()[0]

            product_name = order.get("product")
            quantity_str = order.get("quantity") or "1"

            qty_match = re.search(r"\d+", str(quantity_str))
            quantity = int(qty_match.group()) if qty_match else 1

            db_id = None
            storefront_id = None
            price = None
            if product_name:
                price_row = (
                    await session.execute(
                        sa_text(
                            "SELECT id, storefront_id, price FROM products WHERE is_active=true AND name_ru ILIKE :p LIMIT 1"
                        ),
                        {"p": f"%{product_name}%"},
                    )
                ).fetchone()
                if price_row:
                    db_id = price_row[0]
                    storefront_id = price_row[1]
                    price = float(price_row[2])
                    total_amount = int(price * quantity)

            storefront_success = False
            real_order_number = None

            if total_amount > 0:
                import aiohttp
                import os

                storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
                bot_secret = os.getenv("BOT_SECRET", "")

                payload = {
                    "name": from_name,
                    "phone": norm_phone or phone or "нет телефона",
                    "address": order.get("address", "") or "Самарканд",
                    "items": [
                        {
                            "productId": storefront_id or str(db_id),
                            "price": int(price),
                            "quantity": int(quantity),
                        }
                    ],
                    "paymentMethod": "cash",
                    "telegramId": None,
                }
                try:
                    async with aiohttp.ClientSession() as http_sess:
                        async with http_sess.post(
                            f"{storefront_url}/orders",
                            json=payload,
                            headers={
                                "x-bot-secret": bot_secret,
                                "Content-Type": "application/json",
                            },
                            timeout=10,
                        ) as response:
                            if response.status in (200, 201):
                                resp_data = await response.json()
                                order_data = resp_data.get("order", {})
                                real_order_number = order_data.get("orderNumber") or order_data.get("order_number")
                                if real_order_number:
                                    storefront_success = True
                except Exception as e:
                    logger.error(f"Failed to post order to storefront in instagram_dm: {e}")

            if storefront_success:
                order_number = real_order_number
                order["total"] = f"{total_amount} UZS"

                try:
                    res_local = await session.execute(
                        sa_text("SELECT id FROM orders WHERE order_number = :onum LIMIT 1"),
                        {"onum": order_number},
                    )
                    row_local = res_local.fetchone()
                    if row_local:
                        order_id = row_local[0]
                except Exception:
                    pass

                logger.info(f"📦 Заказ {order_number} (ID: {order_id}) успешно оформлен в реальном магазине для {from_name}")
            else:
                from shared.order_utils import generate_order_number
                order_num = await generate_order_number()

                order_notes = f"Instagram DM от {from_name}. Товар: {product_name} x {quantity_str}. Тел: {phone}"
                if price is None:
                    total_amount = 0
                    order_notes = "[СУММУ УТОЧНИТЬ] " + order_notes

                order["total"] = f"{total_amount} UZS" if total_amount > 0 else "уточнить (СУММУ УТОЧНИТЬ)"

                res = await session.execute(
                    sa_text(
                        "INSERT INTO orders (customer_id, order_number, total_amount, status, "
                        "payment_status, delivery_address, notes, created_at, updated_at) "
                        "VALUES (:cid, :onum, :total, 'new', 'pending', :addr, :notes, NOW(), NOW()) "
                        "RETURNING id"
                    ),
                    {
                        "cid": customer_id,
                        "onum": order_num,
                        "total": total_amount,
                        "addr": order.get("address", ""),
                        "notes": order_notes[:200],
                    },
                )
                order_row = res.fetchone()
                order_id = order_row[0] if order_row else None
                order_number = order_num
                await session.commit()

                logger.info(f"📦 Магазин недоступен, локальный черновик заказа {order_number} (ID: {order_id}) создан в БД для {from_name}")
    except Exception as db_err:
        logger.error(f"Ошибка создания заказа в БД: {db_err}")

    try:
        from shared.event_bus import event_bus, Events

        await event_bus.publish(
            Events.ORDER_CREATED,
            {
                "source": "instagram_dm",
                "customer_name": from_name,
                "customer_ig_id": from_id,
                "product": order.get("product", ""),
                "quantity": order.get("quantity", ""),
                "phone": order.get("phone", ""),
                "address": order.get("address", ""),
                "total": order.get("total", ""),
                "total_amount": total_amount,
                "order_number": order_number or "IG-???",
                "order_id": order_id,
                "timestamp": datetime.now().isoformat(),
            },
            "support_bot",
        )
        logger.info(f"📦 Заказ {order_number} от {from_name} передан Степану (от Support Bot)!")
    except Exception as e:
        logger.error(f"Ошибка публикации заказа в event bus: {e}")


async def _notify_admin_telegram(from_name: str, msg_text: str, reply_text: str, order: Optional[Dict] = None) -> None:
    if not order:
        return

    try:
        from aiogram import Bot as _Bot
        from aiogram.client.default import DefaultBotProperties as _DBP
        from aiogram.enums import ParseMode as _PM

        sales_group = getattr(settings, "sales_group_id", 0)
        target_id = (
            sales_group
            if sales_group
            else (settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None)
        )

        if not target_id:
            return

        _tg_bot = _Bot(token=settings.stepan_bot_token, default=_DBP(parse_mode=_PM.HTML))

        text = (
            f"📦 <b>НОВЫЙ ЗАКАЗ из Instagram</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"👤 Клиент: <b>{from_name}</b>\n"
            f"🛒 Товар: <b>{order.get('product', '?')}</b>\n"
            f"📊 Количество: <b>{order.get('quantity', '?')}</b>\n"
            f"📱 Телефон: <b>{order.get('phone', '?')}</b>\n"
            f"💰 Сумма: <b>{order.get('total', '?')}</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"⏳ Статус: ожидает обработки"
        )

        await _tg_bot.send_message(target_id, text)
        await _tg_bot.session.close()
        logger.info(f"📨 Заказ от {from_name} отправлен в группу Продажа")
    except Exception as tg_err:
        logger.error(f"Не удалось отправить уведомление: {tg_err}")
