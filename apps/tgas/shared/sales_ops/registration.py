import logging
from typing import Dict
from sqlalchemy import text

from shared.database import get_session_ctx
from shared.event_bus import event_bus, Events
from shared.utils import format_price
from shared.sales_ops.core import normalize_phone, _clarify_message, DEDUPE_WINDOW_MINUTES
from shared.sales_ops.items import _normalize_items, _resolve_items

logger = logging.getLogger(__name__)

async def register_sale(params: Dict[str]) -> Dict[str]:
    customer_name = str(params.get("customer_name") or "").strip()
    if not customer_name:
        return {
            "status": "clarify",
            "message": "Не понял, кому продали. Назовите клиента (ресторан/человека).",
        }

    phone = normalize_phone(params.get("phone"))
    customer_type = "b2b" if str(params.get("customer_type") or "").lower() == "b2b" else "b2c"
    payment_status = "pending" if str(params.get("payment_status") or "").lower() == "pending" else "paid"
    order_status = str(params.get("status") or "delivered").lower()
    if order_status not in ("new", "confirmed", "preparing", "ready", "delivering", "delivered"):
        order_status = "delivered"
    notes = str(params.get("notes") or "").strip()
    registered_by = str(params.get("registered_by") or "sales_bot")

    try:
        async with get_session_ctx() as session:
            items = _normalize_items(params)
            outcome = await _resolve_items(session, items)
            if "ambiguous" in outcome:
                return {
                    "status": "clarify",
                    "message": _clarify_message(outcome["ambiguous"], outcome["missing"]),
                    "data": {
                        "ambiguous": outcome["ambiguous"],
                        "missing": outcome["missing"],
                        "pending": {
                            "customer_name": customer_name,
                            "phone": phone,
                            "customer_type": customer_type,
                            "payment_status": payment_status,
                            "status": order_status,
                            "notes": notes,
                            "items": items,
                        },
                    },
                }

            lines = outcome["resolved"]
            total_amount = sum(line["total_price"] for line in lines)

            customer_id = None
            if phone:
                customer_id = (
                    await session.execute(
                        text("SELECT id FROM customers WHERE phone = :p ORDER BY id LIMIT 1"),
                        {"p": phone},
                    )
                ).scalar()
            if not customer_id:
                customer_id = (
                    await session.execute(
                        text("SELECT id FROM customers WHERE name ILIKE :n OR company_name ILIKE :n ORDER BY id LIMIT 1"),
                        {"n": customer_name},
                    )
                ).scalar()

            customer_created = False
            if customer_id:
                await session.execute(
                    text(
                        "UPDATE customers SET phone = COALESCE(phone, :p), "
                        "name = COALESCE(NULLIF(name, ''), :n) WHERE id = :cid"
                    ),
                    {"p": phone, "n": customer_name, "cid": customer_id},
                )
            else:
                customer_id = (
                    await session.execute(
                        text(
                            "INSERT INTO customers (name, company_name, phone, customer_type, "
                            "company_type, status, source, notes) "
                            "VALUES (:n, :company, :p, :ctype, :company_type, 'active', 'manual', :notes) "
                            "RETURNING id"
                        ),
                        {
                            "n": customer_name,
                            "company": customer_name if customer_type == "b2b" else None,
                            "p": phone,
                            "ctype": customer_type,
                            "company_type": "restaurant" if customer_type == "b2b" else None,
                            "notes": f"Заведён при регистрации продажи ({registered_by})",
                        },
                    )
                ).scalar()
                customer_created = True

            dup = (
                await session.execute(
                    text(
                        "SELECT id, order_number FROM orders "
                        "WHERE customer_id = :cid AND total_amount = :total "
                        "AND created_at > NOW() - (:mins || ' minutes')::interval "
                        "ORDER BY id DESC LIMIT 1"
                    ),
                    {
                        "cid": customer_id,
                        "total": total_amount,
                        "mins": str(DEDUPE_WINDOW_MINUTES),
                    },
                )
            ).fetchone()
            if dup:
                return {
                    "status": "duplicate",
                    "message": (
                        f"Эта продажа уже зарегистрирована — заказ {dup[1]} "
                        f"({customer_name}, {format_price(total_amount)}). "
                        f"Повторно не записываю."
                    ),
                    "data": {"order_id": dup[0], "order_number": dup[1]},
                }

            row = (
                await session.execute(
                    text(
                        "INSERT INTO orders (customer_id, total_amount, status, payment_status, "
                        "notes, created_at, updated_at) "
                        "VALUES (:cid, :total, :status, :pay, :notes, NOW(), NOW()) "
                        "RETURNING id, order_number"
                    ),
                    {
                        "cid": customer_id,
                        "total": total_amount,
                        "status": order_status,
                        "pay": payment_status,
                        "notes": (notes or f"Продажа зарегистрирована вручную ({registered_by})")[:500],
                    },
                )
            ).fetchone()
            order_id, order_number = row[0], row[1]

            for line in lines:
                await session.execute(
                    text(
                        "INSERT INTO order_items (order_id, product_id, quantity, unit, "
                        "unit_price, total_price) VALUES (:oid, :pid, :qty, :unit, :price, :total)"
                    ),
                    {
                        "oid": order_id,
                        "pid": line["product_id"],
                        "qty": line["quantity"],
                        "unit": line["unit"],
                        "price": line["unit_price"],
                        "total": line["total_price"],
                    },
                )

            await session.execute(
                text(
                    "UPDATE customers SET orders_count = orders_count + 1, "
                    "total_spent = total_spent + :amount, last_order_date = NOW(), "
                    "status = CASE WHEN orders_count >= 5 THEN 'vip' ELSE 'active' END "
                    "WHERE id = :cid"
                ),
                {"amount": total_amount, "cid": customer_id},
            )
            items_summary = "; ".join(f"{item['name']} × {item['quantity']:g}" for item in lines)
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, order_id, channel, interaction_type, "
                    "bot_name, summary, resolved) "
                    "VALUES (:cid, :oid, 'telegram', 'order', :bot, :summary, true)"
                ),
                {
                    "cid": customer_id,
                    "oid": order_id,
                    "bot": registered_by,
                    "summary": f"Продажа {order_number}: {items_summary} на {format_price(total_amount)}",
                },
            )
            await session.commit()

    except Exception as exc:
        logger.exception("SALES_OPS: не удалось зарегистрировать продажу: %s", exc)
        return {"status": "error", "message": f"Не смог записать продажу в БД: {exc}"}

    await event_bus.publish(
        Events.ORDER_CREATED,
        {
            "order_id": order_id,
            "order_number": order_number,
            "total_amount": total_amount,
            "customer_id": customer_id,
            "items_summary": items_summary,
            "source": "manual_sale",
        },
        registered_by,
    )

    logger.info(
        "SALES_OPS: продажа %s зарегистрирована (клиент #%s, %s)",
        order_number,
        customer_id,
        total_amount,
    )

    return {
        "status": "ok",
        "message": f"Заказ {order_number} на {format_price(total_amount)} записан.",
        "data": {
            "order_id": order_id,
            "order_number": order_number,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "customer_created": customer_created,
            "phone": phone,
            "items": lines,
            "total_amount": total_amount,
            "payment_status": payment_status,
            "order_status": order_status,
        },
    }
