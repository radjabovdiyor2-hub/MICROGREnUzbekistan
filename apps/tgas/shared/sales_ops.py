"""
💰 SALES OPS — реальные операции продаж
========================================
Единственное место, где «продажа, о которой сообщил менеджер», превращается в
факты в БД: клиент → заказ → позиции → журнал → событие ORDER_CREATED.

Раньше такой продажи не существовало как действия: Степан мог только создать
задачу отделу, а отдел в ответ генерировал текст «свяжусь с клиентом» — в БД не
появлялось ничего. Этот модуль закрывает дыру.

Правило модуля: НИЧЕГО НЕ ВЫДУМЫВАТЬ. Если не хватает данных (нет цены, товар не
опознан, непонятно кто клиент) — возвращаем status="clarify" с вопросом, а не
подставляем «примерно 50 000».
"""

import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from shared.database import get_session_ctx
from shared.event_bus import event_bus, Events
from shared.utils import format_price

logger = logging.getLogger(__name__)

# Окно, в котором повторная регистрация той же продажи считается дублем.
# Нужен, потому что каждое сообщение в чате проходит через LLM независимо, и
# «Степан зарегистрируй продажу…» + «мы уже продали» легко порождают два вызова.
DEDUPE_WINDOW_MINUTES = 15


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """+998 88 155-25-57 → +998881552557. Возвращает None, если это не телефон."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) < 7:
        return None
    if len(digits) == 9:  # 881552557 — узбекский номер без кода страны
        digits = "998" + digits
    return "+" + digits


def _to_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^\d.,]", "", str(value)).replace(",", ".")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


async def _find_products(session, query: Optional[str]) -> List[Dict[str, Any]]:
    """Ищем товар по названию (ru/uz). Пустой запрос → пустой список."""
    if not query:
        return []
    q = str(query).strip()
    if not q:
        return []
    res = await session.execute(
        text(
            "SELECT id, name_ru, price, unit FROM products "
            "WHERE is_active = true AND (name_ru ILIKE :q OR name_uz ILIKE :q) "
            "ORDER BY sort_order, id LIMIT 10"
        ),
        {"q": f"%{q}%"},
    )
    return [
        {"id": r[0], "name": r[1], "price": float(r[2]), "unit": r[3]}
        for r in res.fetchall()
    ]


async def register_sale(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Зарегистрировать состоявшуюся продажу.

    Параметры:
        customer_name   — кто купил (обязательно), напр. "Zarra Resort"
        phone           — телефон клиента (для поиска/создания карточки)
        product         — что продали, свободным текстом ("микрозелень", "руккола")
        quantity        — сколько (по умолчанию 1)
        unit_price      — цена за единицу, если менеджер её назвал
        total_amount    — итоговая сумма, если менеджер назвал сразу её
        customer_type   — 'b2b' (ресторан/кафе) или 'b2c'
        payment_status  — 'paid' (по умолчанию) | 'pending'
        status          — статус заказа: 'delivered' (по умолчанию) | 'new' | 'confirmed'
        notes           — исходная формулировка менеджера
        registered_by   — кто зарегистрировал (имя бота/сотрудника)

    Возвращает:
        {"status": "ok",        "message": ..., "data": {...}}       — заказ создан
        {"status": "duplicate", "message": ..., "data": {...}}       — такая продажа уже записана
        {"status": "clarify",   "message": <вопрос>, "data": {...}}  — не хватает данных, НЕ выдумываем
        {"status": "error",     "message": ...}
    """
    customer_name = str(params.get("customer_name") or "").strip()
    if not customer_name:
        return {
            "status": "clarify",
            "message": "Не понял, кому продали. Назовите клиента (ресторан/человека).",
        }

    phone = normalize_phone(params.get("phone"))
    product_query = str(params.get("product") or "").strip() or None
    quantity = _to_float(params.get("quantity")) or 1.0
    unit_price = _to_float(params.get("unit_price"))
    total_amount = _to_float(params.get("total_amount"))
    customer_type = "b2b" if str(params.get("customer_type") or "").lower() == "b2b" else "b2c"
    payment_status = "pending" if str(params.get("payment_status") or "").lower() == "pending" else "paid"
    order_status = str(params.get("status") or "delivered").lower()
    if order_status not in ("new", "confirmed", "preparing", "ready", "delivering", "delivered"):
        order_status = "delivered"
    notes = str(params.get("notes") or "").strip()
    registered_by = str(params.get("registered_by") or "sales_bot")

    try:
        async with get_session_ctx() as session:
            # ── 1. Цена: из каталога или со слов менеджера. Не угадываем. ──
            matches = await _find_products(session, product_query)
            product: Optional[Dict[str, Any]] = None

            if len(matches) == 1:
                product = matches[0]
            elif len(matches) > 1 and unit_price is None and total_amount is None:
                options = "\n".join(
                    f"• {m['name']} — {format_price(m['price'])} / {m['unit']}" for m in matches
                )
                return {
                    "status": "clarify",
                    "message": (
                        f"Под «{product_query}» подходит несколько позиций каталога — "
                        f"какую именно продали?\n\n{options}"
                    ),
                    "data": {"candidates": matches},
                }
            elif len(matches) > 1:
                product = matches[0]  # цену менеджер назвал сам — берём первую как ссылку на товар

            if total_amount is None:
                if unit_price is None and product:
                    unit_price = product["price"]
                if unit_price is None:
                    return {
                        "status": "clarify",
                        "message": (
                            f"Не нашёл «{product_query or 'товар'}» в каталоге и не знаю цену. "
                            f"Скажите цену за единицу или точное название товара — "
                            f"сам сумму придумывать не буду."
                        ),
                    }
                total_amount = unit_price * quantity
            elif unit_price is None and quantity:
                unit_price = total_amount / quantity

            # ── 2. Клиент: ищем по телефону, затем по названию, иначе заводим ──
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
                        text(
                            "SELECT id FROM customers "
                            "WHERE name ILIKE :n OR company_name ILIKE :n ORDER BY id LIMIT 1"
                        ),
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

            # ── 3. Защита от дубля: та же продажа, тому же клиенту, только что ──
            dup = (
                await session.execute(
                    text(
                        "SELECT id, order_number FROM orders "
                        "WHERE customer_id = :cid AND total_amount = :total "
                        "AND created_at > NOW() - (:mins || ' minutes')::interval "
                        "ORDER BY id DESC LIMIT 1"
                    ),
                    {"cid": customer_id, "total": total_amount, "mins": str(DEDUPE_WINDOW_MINUTES)},
                )
            ).fetchone()
            if dup:
                return {
                    "status": "duplicate",
                    "message": (
                        f"Эта продажа уже зарегистрирована — заказ {dup[1]} "
                        f"({customer_name}, {format_price(total_amount)}). Повторно не записываю."
                    ),
                    "data": {"order_id": dup[0], "order_number": dup[1]},
                }

            # ── 4. Заказ (order_number выдаст триггер) + позиция ──
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

            if product:
                await session.execute(
                    text(
                        "INSERT INTO order_items (order_id, product_id, quantity, unit, "
                        "unit_price, total_price) VALUES (:oid, :pid, :qty, :unit, :price, :total)"
                    ),
                    {
                        "oid": order_id,
                        "pid": product["id"],
                        "qty": quantity,
                        "unit": product["unit"] or "piece",
                        "price": unit_price,
                        "total": total_amount,
                    },
                )

            # ── 5. Статистика клиента + журнал взаимодействия ──
            await session.execute(
                text(
                    "UPDATE customers SET orders_count = orders_count + 1, "
                    "total_spent = total_spent + :amount, last_order_date = NOW(), "
                    "status = CASE WHEN orders_count >= 5 THEN 'vip' ELSE 'active' END "
                    "WHERE id = :cid"
                ),
                {"amount": total_amount, "cid": customer_id},
            )
            items_summary = (
                f"{product['name'] if product else (product_query or 'Товар')} × {quantity:g}"
            )
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

    # ── 6. Событие в шину: Finance учтёт доход, Analytics — метрику, PM — производство ──
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
        order_number, customer_id, total_amount,
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
            "product": product["name"] if product else (product_query or None),
            "product_matched": bool(product),
            "quantity": quantity,
            "unit_price": unit_price,
            "total_amount": total_amount,
            "payment_status": payment_status,
            "order_status": order_status,
        },
    }


def format_sale_report(result: Dict[str, Any]) -> str:
    """Человеческий отчёт о продаже — только факты, без обещаний."""
    if result.get("status") != "ok":
        return result.get("message", "Не удалось зарегистрировать продажу.")

    d = result.get("data", {})
    lines = [
        "✅ <b>Продажа зарегистрирована</b>",
        "",
        f"📦 Заказ: <b>{d['order_number']}</b>",
        f"🏢 Клиент: {d['customer_name']}"
        + (" (новая карточка в CRM)" if d.get("customer_created") else " (в CRM)"),
    ]
    if d.get("phone"):
        lines.append(f"📞 Телефон: {d['phone']}")
    if d.get("product"):
        qty = d.get("quantity") or 0
        lines.append(f"🌱 Товар: {d['product']} × {qty:g}")
    if d.get("unit_price"):
        lines.append(f"💵 Цена за единицу: {format_price(d['unit_price'])}")
    lines.append(f"💰 Сумма: <b>{format_price(d['total_amount'])}</b>")
    lines.append(
        "💳 Оплата: " + ("получена" if d.get("payment_status") == "paid" else "ожидается")
    )
    if not d.get("product_matched"):
        lines.append("")
        lines.append("⚠️ Товар не сопоставлен с каталогом — позиция записана только суммой.")
    lines.append("")
    lines.append("Финансы учли доход, аналитика — метрику, PM видит заказ.")
    return "\n".join(lines)
