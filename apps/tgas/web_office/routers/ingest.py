import logging
import os
import re
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from shared.database import get_session_ctx
from shared.event_bus import event_bus, Events
from shared.utils import format_price

logger = logging.getLogger(__name__)

router = APIRouter()

INGEST_SECRET = os.getenv("INGEST_SECRET", "")
_ALLOWED_PAYMENT = {"cash", "card", "click", "payme", "transfer"}
_ALLOWED_ORDER_STATUS = {
    "new",
    "confirmed",
    "preparing",
    "ready",
    "delivering",
    "delivered",
    "cancelled",
}
STOREFRONT_STATUS_URL = os.getenv("STOREFRONT_STATUS_URL", "")
_WEBAPP_MARKER = re.compile(r"\[webapp:([^\]]+)\]")

def _check_ingest_secret(request: Request) -> bool:
    return not INGEST_SECRET or request.headers.get("X-Ingest-Secret") == INGEST_SECRET

def _safe_float(value: Any) -> float:
    try:
        return float(value) if value is not None else 0.0
    except (ValueError, TypeError):
        return 0.0

async def _find_customer(session: Any, tid: Any, phone: Any) -> Any:
    if tid:
        cid = (
            await session.execute(
                text("SELECT id FROM customers WHERE telegram_id = :tid"),
                {"tid": tid},
            )
        ).scalar()
        if cid:
            return cid
    if phone:
        return (
            await session.execute(
                text(
                    "SELECT id FROM customers WHERE phone = :phone ORDER BY id LIMIT 1"
                ),
                {"phone": phone},
            )
        ).scalar()
    return None

@router.post("/ingest/order")
async def ingest_order(request: Request) -> Any:
    if not INGEST_SECRET:
        if os.getenv("ENVIRONMENT", "development") == "production":
            logger.error("FATAL: INGEST_SECRET is missing in production!")
            return JSONResponse({"error": "unauthorized"}, status_code=401)
    elif request.headers.get("X-Ingest-Secret") != INGEST_SECRET:
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    ext_number = str(body.get("order_number") or "").strip()
    if not ext_number:
        return JSONResponse({"error": "order_number required"}, status_code=400)

    customer = body.get("customer") or {}
    name = (customer.get("name") or "").strip() or "Клиент из приложения"
    phone = (customer.get("phone") or "").strip() or None
    try:
        raw_tid = customer.get("telegram_id")
        tid = int(raw_tid) if raw_tid not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        tid = None
    bonus_balance = _safe_float(customer.get("bonus_balance"))

    total = _safe_float(body.get("total_amount"))
    delivery_fee = _safe_float(body.get("delivery_fee"))
    discount = _safe_float(body.get("discount_amount"))
    pay_method = str(body.get("payment_method") or "cash").lower()
    if pay_method not in _ALLOWED_PAYMENT:
        pay_method = "cash"
    address = str(body.get("delivery_address") or "").strip()
    items_summary = str(body.get("items_summary") or "").strip()
    extra_notes = str(body.get("notes") or "").strip()

    marker = f"[webapp:{ext_number}]"
    notes = marker
    if items_summary:
        notes += f" {items_summary}"
    if extra_notes:
        notes += f" | {extra_notes}"

    try:
        async with get_session_ctx() as session:
            dup = (
                await session.execute(
                    text("SELECT id FROM orders WHERE notes LIKE :m LIMIT 1"),
                    {"m": marker + "%"},
                )
            ).scalar()
            if dup:
                return JSONResponse({"status": "duplicate", "order_id": dup})

            customer_id = None
            if tid:
                customer_id = (
                    await session.execute(
                        text("SELECT id FROM customers WHERE telegram_id = :tid"),
                        {"tid": tid},
                    )
                ).scalar()
            if not customer_id and phone:
                customer_id = (
                    await session.execute(
                        text(
                            "SELECT id FROM customers WHERE phone = :phone ORDER BY id LIMIT 1"
                        ),
                        {"phone": phone},
                    )
                ).scalar()
            if not customer_id:
                customer_id = (
                    await session.execute(
                        text(
                            "INSERT INTO customers (name, phone, telegram_id, bonus_balance, source, "
                            "status, customer_type, city) VALUES (:name, :phone, :tid, :bonus, 'webapp', "
                            "'active', 'b2c', 'Samarqand') RETURNING id"
                        ),
                        {
                            "name": name,
                            "phone": phone,
                            "tid": tid,
                            "bonus": bonus_balance,
                        },
                    )
                ).scalar()
            else:
                await session.execute(
                    text(
                        "UPDATE customers SET telegram_id = COALESCE(telegram_id, :tid), "
                        "phone = COALESCE(phone, :phone), "
                        "name = COALESCE(NULLIF(name, ''), :name), "
                        "bonus_balance = :bonus WHERE id = :cid"
                    ),
                    {
                        "tid": tid,
                        "phone": phone,
                        "name": name,
                        "bonus": bonus_balance,
                        "cid": customer_id,
                    },
                )

            new = (
                await session.execute(
                    text(
                        "INSERT INTO orders (customer_id, total_amount, delivery_fee, discount_amount, "
                        "status, payment_status, payment_method, delivery_address, notes, created_at, "
                        "updated_at) VALUES (:cid, :total, :delivery, :discount, 'new', 'pending', "
                        ":pmethod, :addr, :notes, NOW(), NOW()) RETURNING id, order_number"
                    ),
                    {
                        "cid": customer_id,
                        "total": total,
                        "delivery": delivery_fee,
                        "discount": discount,
                        "pmethod": pay_method,
                        "addr": address,
                        "notes": notes,
                    },
                )
            ).fetchone()
            order_id, order_number = new[0], new[1]

            for line in body.get("items") or []:
                sid = str(line.get("storefront_id") or "").strip()
                qty = _safe_float(line.get("quantity")) or 1
                price = _safe_float(line.get("price"))
                if not sid:
                    continue
                prod = (
                    await session.execute(
                        text(
                            "SELECT id, unit FROM products WHERE storefront_id = :sid"
                        ),
                        {"sid": sid},
                    )
                ).fetchone()
                if not prod:
                    pname = str(
                        line.get("name") or line.get("nameRu") or "Неизвестный товар"
                    ).strip()
                    pid = (
                        await session.execute(
                            text(
                                "INSERT INTO products (name_uz, name_ru, category, price, unit, stock_qty, is_active, storefront_id) "
                                "VALUES (:n, :n, 'sets', :price, 'piece', 0, TRUE, :sid) RETURNING id"
                            ),
                            {"n": pname, "price": price, "sid": sid},
                        )
                    ).scalar()
                    prod = (pid, "piece")
                await session.execute(
                    text(
                        "INSERT INTO order_items (order_id, product_id, quantity, unit, unit_price, "
                        "total_price) VALUES (:oid, :pid, :qty, :unit, :price, :total)"
                    ),
                    {
                        "oid": order_id,
                        "pid": prod[0],
                        "qty": qty,
                        "unit": prod[1] or "piece",
                        "price": price,
                        "total": price * qty,
                    },
                )

            await session.execute(
                text(
                    "UPDATE customers SET orders_count = orders_count + 1, "
                    "total_spent = total_spent + :amount, last_order_date = NOW(), "
                    "status = CASE WHEN orders_count >= 5 THEN 'vip' "
                    "WHEN orders_count >= 1 THEN 'active' ELSE 'active' END WHERE id = :cid"
                ),
                {"amount": total, "cid": customer_id},
            )
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, order_id, channel, interaction_type, "
                    "bot_name, summary) VALUES (:cid, :oid, 'webapp', 'order', 'web_office', :summary)"
                ),
                {
                    "cid": customer_id,
                    "oid": order_id,
                    "summary": f"Заказ {order_number} (витрина {ext_number}) на "
                    f"{format_price(total)}: {items_summary[:150]}",
                },
            )
    except Exception as exc:
        logger.exception("Ingest: не удалось перенести заказ %s: %s", ext_number, exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.ORDER_CREATED,
        {
            "order_id": order_id,
            "order_number": order_number,
            "total_amount": total,
            "customer_id": customer_id,
            "items_summary": items_summary or extra_notes,
            "telegram_id": tid,
            "source": "webapp",
            "external_number": ext_number,
        },
        source_bot="web_office",
    )
    logger.info(
        "Ingest: заказ витрины %s → CRM #%s (%s), ORDER_CREATED разослан",
        ext_number,
        order_id,
        order_number,
    )
    return JSONResponse(
        {"status": "ok", "order_id": order_id, "order_number": order_number}
    )

@router.post("/ingest/order-status")
async def ingest_order_status(request: Request) -> Any:
    if not INGEST_SECRET:
        if os.getenv("ENVIRONMENT", "development") == "production":
            logger.error("FATAL: INGEST_SECRET is missing in production!")
            return JSONResponse({"error": "unauthorized"}, status_code=401)
    elif request.headers.get("X-Ingest-Secret") != INGEST_SECRET:
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    ext_number = str(body.get("order_number") or "").strip()
    if not ext_number:
        return JSONResponse({"error": "order_number required"}, status_code=400)
    status = body.get("status") or None
    payment_status = body.get("payment_status") or None
    if not status and not payment_status:
        return JSONResponse({"error": "nothing to update"}, status_code=400)

    marker = f"[webapp:{ext_number}]"
    try:
        async with get_session_ctx() as session:
            row = (
                await session.execute(
                    text(
                        "UPDATE orders SET status = COALESCE(:status, status), "
                        "payment_status = COALESCE(:pstatus, payment_status), updated_at = NOW() "
                        "WHERE notes LIKE :m RETURNING id, order_number, status"
                    ),
                    {"status": status, "pstatus": payment_status, "m": marker + "%"},
                )
            ).fetchone()
    except Exception as exc:
        logger.exception(
            "Ingest-status: не удалось обновить заказ %s: %s", ext_number, exc
        )
        return JSONResponse({"error": "update failed"}, status_code=500)

    if not row:
        logger.warning("Ingest-status: заказ витрины %s в CRM не найден", ext_number)
        return JSONResponse({"status": "not_found"}, status_code=404)

    order_id, order_number, new_status = row[0], row[1], row[2]
    await event_bus.publish(
        Events.ORDER_STATUS_CHANGED,
        {
            "order_id": order_id,
            "order_number": order_number,
            "external_number": ext_number,
            "status": new_status,
            "payment_status": payment_status,
            "source": "webapp",
        },
        source_bot="web_office",
    )
    logger.info(
        "Ingest-status: заказ %s (%s) → %s", order_number, ext_number, new_status
    )
    return JSONResponse(
        {"status": "ok", "order_id": order_id, "order_number": order_number}
    )

@router.post("/orders/{order_id}/status")
async def change_order_status(order_id: int, request: Request) -> Any:
    try:
        body = await request.json()
    except Exception:
        body = {}
    status = str(body.get("status") or "").strip().lower()
    if status not in _ALLOWED_ORDER_STATUS:
        return JSONResponse({"error": "invalid status"}, status_code=400)

    try:
        async with get_session_ctx() as session:
            row = (
                await session.execute(
                    text(
                        "UPDATE orders SET status = :s, updated_at = NOW() "
                        "WHERE id = :id RETURNING order_number, notes"
                    ),
                    {"s": status, "id": order_id},
                )
            ).fetchone()
    except Exception as exc:
        logger.exception(
            "Order-status: не удалось обновить заказ #%s: %s", order_id, exc
        )
        return JSONResponse({"error": "update failed"}, status_code=500)

    if not row:
        return JSONResponse({"error": "not found"}, status_code=404)
    order_number, notes = row[0], row[1] or ""

    await event_bus.publish(
        Events.ORDER_STATUS_CHANGED,
        {
            "order_id": order_id,
            "order_number": order_number,
            "status": status,
            "source": "office",
        },
        source_bot="web_office",
    )

    m = _WEBAPP_MARKER.search(notes)
    if m and STOREFRONT_STATUS_URL:
        ext_number = m.group(1)
        try:
            async with get_session_ctx() as session:
                await session.execute(
                    text(
                        "INSERT INTO storefront_outbox (order_number, status) VALUES (:num, :stat)"
                    ),
                    {"num": ext_number, "stat": status},
                )
                await session.commit()
        except Exception as exc:
            logger.warning(
                "Order-status: не удалось сохранить в outbox (%s): %s", ext_number, exc
            )

    logger.info("Order-status: заказ #%s (%s) → %s", order_id, order_number, status)
    return JSONResponse(
        {"status": "ok", "order_number": order_number, "new_status": status}
    )

@router.post("/ingest/customer")
async def ingest_customer(request: Request) -> Any:
    if INGEST_SECRET and request.headers.get("X-Ingest-Secret") != INGEST_SECRET:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    name = (body.get("name") or "").strip() or "Клиент из приложения"
    phone = (body.get("phone") or "").strip() or None
    try:
        raw_tid = body.get("telegram_id")
        tid = int(raw_tid) if raw_tid not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        tid = None
    bonus = _safe_float(body.get("bonus_balance"))
    language = (body.get("language") or "ru").strip()[:5]
    if not tid and not phone:
        return JSONResponse({"error": "telegram_id or phone required"}, status_code=400)

    try:
        async with get_session_ctx() as session:
            customer_id = None
            if tid:
                customer_id = (
                    await session.execute(
                        text("SELECT id FROM customers WHERE telegram_id = :tid"),
                        {"tid": tid},
                    )
                ).scalar()
            if not customer_id and phone:
                customer_id = (
                    await session.execute(
                        text(
                            "SELECT id FROM customers WHERE phone = :phone ORDER BY id LIMIT 1"
                        ),
                        {"phone": phone},
                    )
                ).scalar()
            is_new = customer_id is None
            if is_new:
                customer_id = (
                    await session.execute(
                        text(
                            "INSERT INTO customers (name, phone, telegram_id, bonus_balance, language, "
                            "source, status, customer_type, city) VALUES (:name, :phone, :tid, :bonus, "
                            ":lang, 'webapp', 'lead', 'b2c', 'Samarqand') RETURNING id"
                        ),
                        {
                            "name": name,
                            "phone": phone,
                            "tid": tid,
                            "bonus": bonus,
                            "lang": language,
                        },
                    )
                ).scalar()
            else:
                await session.execute(
                    text(
                        "UPDATE customers SET telegram_id = COALESCE(telegram_id, :tid), "
                        "phone = COALESCE(phone, :phone), name = COALESCE(NULLIF(name, ''), :name), "
                        "bonus_balance = :bonus WHERE id = :cid"
                    ),
                    {
                        "tid": tid,
                        "phone": phone,
                        "name": name,
                        "bonus": bonus,
                        "cid": customer_id,
                    },
                )
    except Exception as exc:
        logger.exception("Ingest-customer: ошибка (%s): %s", phone or tid, exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    if is_new:
        await event_bus.publish(
            Events.CUSTOMER_REGISTERED,
            {
                "customer_id": customer_id,
                "telegram_id": tid,
                "name": name,
                "phone": phone,
                "source": "webapp",
            },
            source_bot="web_office",
        )
    logger.info(
        "Ingest-customer: %s клиент #%s", "новый" if is_new else "обновлён", customer_id
    )
    return JSONResponse({"status": "ok", "customer_id": customer_id, "is_new": is_new})

@router.post("/ingest/support")
async def ingest_support(request: Request) -> Any:
    if not _check_ingest_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    message = (body.get("message") or "").strip()
    if not message:
        return JSONResponse({"error": "message required"}, status_code=400)
    name = (body.get("name") or "").strip() or "Клиент с сайта"
    phone = (body.get("phone") or "").strip() or None
    try:
        raw_tid = body.get("telegram_id")
        tid = int(raw_tid) if raw_tid not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        tid = None

    try:
        async with get_session_ctx() as session:
            customer_id = await _find_customer(session, tid, phone)
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                    "VALUES (:cid, 'website', 'complaint', 'web_office', :s)"
                ),
                {"cid": customer_id, "s": f"Обращение от {name}: {message[:400]}"},
            )
    except Exception as exc:
        logger.exception("Ingest-support: ошибка: %s", exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.COMPLAINT_RECEIVED,
        {
            "customer_name": name,
            "phone": phone,
            "summary": message,
            "source": "website",
        },
        source_bot="web_office",
    )
    logger.info("Ingest-support: обращение с сайта от %s", name)
    return JSONResponse({"status": "ok"})

@router.post("/ingest/lead")
async def ingest_lead(request: Request) -> Any:
    if not _check_ingest_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    company = (body.get("company_name") or "").strip() or None
    contact = (body.get("contact_name") or "").strip() or None
    phone = (body.get("phone") or "").strip() or None
    message = (body.get("message") or "").strip()
    if not (company or contact or phone):
        return JSONResponse({"error": "contact required"}, status_code=400)

    try:
        async with get_session_ctx() as session:
            customer_id = await _find_customer(session, None, phone)
            if not customer_id:
                customer_id = (
                    await session.execute(
                        text(
                            "INSERT INTO customers (name, company_name, phone, customer_type, status, "
                            "source, city) VALUES (:name, :company, :phone, 'b2b', 'lead', 'website', "
                            "'Samarqand') RETURNING id"
                        ),
                        {
                            "name": contact or company or "B2B-лид",
                            "company": company,
                            "phone": phone,
                        },
                    )
                ).scalar()
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                    "VALUES (:cid, 'website', 'b2b_lead', 'web_office', :s)"
                ),
                {
                    "cid": customer_id,
                    "s": f"B2B-заявка: {company or contact}. {message[:300]}",
                },
            )
    except Exception as exc:
        logger.exception("Ingest-lead: ошибка: %s", exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.B2B_LEAD_CREATED,
        {
            "customer_id": customer_id,
            "company_name": company,
            "contact_name": contact,
            "phone": phone,
            "summary": message,
            "source": "website",
        },
        source_bot="web_office",
    )
    logger.info("Ingest-lead: B2B-заявка с сайта (%s)", company or contact)
    return JSONResponse({"status": "ok", "customer_id": customer_id})

@router.post("/ingest/feedback")
async def ingest_feedback(request: Request) -> Any:
    if not _check_ingest_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    try:
        rating = int(body.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0
    product = (body.get("product") or "").strip() or "товар"
    comment = (body.get("comment") or "").strip()
    name = (body.get("name") or "").strip() or "Клиент"
    try:
        raw_tid = body.get("telegram_id")
        tid = int(raw_tid) if raw_tid not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        tid = None

    try:
        async with get_session_ctx() as session:
            customer_id = await _find_customer(session, tid, None)
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                    "VALUES (:cid, 'website', 'feedback', 'web_office', :s)"
                ),
                {
                    "cid": customer_id,
                    "s": f"Отзыв {rating}★ на «{product}»: {comment[:300]}",
                },
            )
    except Exception as exc:
        logger.exception("Ingest-feedback: ошибка: %s", exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.FEEDBACK_RECEIVED,
        {
            "customer_name": name,
            "product": product,
            "rating": rating,
            "comment": comment,
            "source": "website",
        },
        source_bot="web_office",
    )
    logger.info("Ingest-feedback: отзыв %s★ на %s", rating, product)
    return JSONResponse({"status": "ok"})
