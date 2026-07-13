"""
💰 SALES OPS — реальные операции продаж
========================================
Единственное место, где «продажа, о которой сообщил менеджер», превращается в
факты в БД: клиент → заказ → позиции → журнал → событие ORDER_CREATED.

Правила модуля:
1. НИЧЕГО НЕ ВЫДУМЫВАТЬ. Нет цены, товар неоднозначен, товара нет в каталоге —
   возвращаем status="clarify" с конкретным вопросом, а не подставляем «примерно».
2. КАЖДАЯ позиция обязана быть товаром каталога. Если товара нет — предлагаем
   добавить его в каталог (shared.catalog_ops.add_product), но только с одобрения
   руководителя. Заказ «на сумму без товара» больше не пишем: такие строки не
   попадают ни в остатки, ни в аналитику по товарам.
3. Одна продажа = один заказ, даже если позиций несколько («10 гороха и 13 редиса»).
"""

import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import String, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY

from shared.database import get_session_ctx
from shared.event_bus import event_bus, Events
from shared.text_match import query_variants
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


# Порог нечёткого совпадения (pg_trgm). Ниже — уже случайные созвучия.
FUZZY_THRESHOLD = 0.45


async def _find_products(session, query: Optional[str]) -> List[Dict[str, Any]]:
    """
    Ищем товар так, как его мог написать человек: «санго», «sango», «cfyuj»
    (кириллица в латинской раскладке), «сангоо» с опечаткой.

    Два прохода:
    1. Подстрока по всем вариантам написания (транслит + исправленная раскладка).
    2. Если пусто — нечёткий поиск через pg_trgm (ловит опечатки).
    """
    variants = query_variants(query or "")
    if not variants:
        return []

    patterns = [f"%{v}%" for v in variants]
    res = await session.execute(
        text(
            "SELECT id, name_ru, price, unit FROM products "
            "WHERE is_active = true "
            "AND (name_ru ILIKE ANY(:pats) OR name_uz ILIKE ANY(:pats)) "
            "ORDER BY sort_order, id LIMIT 10"
        ).bindparams(bindparam("pats", value=patterns, type_=ARRAY(String))),
    )
    rows = res.fetchall()

    # Несколько слов («санго микрозелень», порядок любой) — ищем товар, в
    # названии которого есть ВСЕ слова. Иначе поиск по всей строке не совпадёт,
    # а нечёткий вернёт всю микрозелень подряд.
    words = [w for w in re.split(r"\s+", str(query).strip()) if len(w) >= 3]
    if not rows and len(words) > 1:
        conditions, params = [], {}
        for idx, word in enumerate(words):
            word_patterns = [f"%{v}%" for v in query_variants(word)]
            if not word_patterns:
                continue
            key = f"w{idx}"
            conditions.append(f"(name_ru ILIKE ANY(:{key}) OR name_uz ILIKE ANY(:{key}))")
            params[key] = word_patterns
        if conditions:
            stmt = text(
                "SELECT id, name_ru, price, unit FROM products "
                "WHERE is_active = true AND " + " AND ".join(conditions) +
                " ORDER BY sort_order, id LIMIT 10"
            ).bindparams(*[
                bindparam(key, value=value, type_=ARRAY(String)) for key, value in params.items()
            ])
            rows = (await session.execute(stmt)).fetchall()

    if not rows:
        # Опечатки: word_similarity сравнивает запрос с лучшим куском названия,
        # поэтому «сангоо» находит «Микрозелень Санго».
        try:
            res = await session.execute(
                text(
                    "SELECT id, name_ru, price, unit, "
                    "  (SELECT MAX(GREATEST(word_similarity(v, lower(p.name_ru)), "
                    "                       word_similarity(v, lower(p.name_uz)))) "
                    "   FROM unnest(:vars) AS v) AS sim "
                    "FROM products p "
                    "WHERE is_active = true "
                    "ORDER BY sim DESC NULLS LAST LIMIT 5"
                ).bindparams(bindparam("vars", value=variants, type_=ARRAY(String))),
            )
            rows = [r for r in res.fetchall() if (r[4] or 0) >= FUZZY_THRESHOLD]
        except Exception as exc:  # pg_trgm не установлен — молча остаёмся без fuzzy
            logger.warning("SALES_OPS: нечёткий поиск недоступен (%s)", exc)
            rows = []

    return [
        {"id": r[0], "name": r[1], "price": float(r[2]), "unit": r[3]}
        for r in rows
    ]


def _normalize_items(params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Приводим вход к списку позиций: items[] либо одиночные product/quantity."""
    raw = params.get("items")
    if not raw:
        raw = [{
            "product": params.get("product"),
            "quantity": params.get("quantity"),
            "unit_price": params.get("unit_price"),
        }]
    items = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        items.append({
            "product": str(entry.get("product") or "").strip() or None,
            "quantity": _to_float(entry.get("quantity")) or 1.0,
            "unit_price": _to_float(entry.get("unit_price")),
        })
    return items


async def _resolve_items(session, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Сопоставляем каждую позицию с каталогом.

    Возвращает {"resolved": [...]} либо {"questions": [...], "missing": [...]},
    где missing — товары, которых нет в каталоге (их можно добавить с одобрения).
    """
    resolved: List[Dict[str, Any]] = []
    questions: List[str] = []
    missing: List[Dict[str, Any]] = []

    for item in items:
        name = item["product"]
        if not name:
            questions.append("Что именно продали? Назовите товар — сам не догадаюсь.")
            continue

        matches = await _find_products(session, name)
        exact = [m for m in matches if m["name"].strip().lower() == name.strip().lower()]

        if exact:
            product = exact[0]
        elif len(matches) == 1:
            product = matches[0]
        elif len(matches) > 1:
            options = "\n".join(
                f"   • {m['name']} — {format_price(m['price'])} / {m['unit']}" for m in matches
            )
            questions.append(f"Под «{name}» подходит несколько позиций — какую именно продали?\n{options}")
            continue
        else:
            price = item["unit_price"]
            missing.append({"name": name, "quantity": item["quantity"], "unit_price": price})
            questions.append(
                f"Товара «{name}» нет в каталоге."
                + (f" Добавить его в каталог и магазин по цене {format_price(price)}?"
                   if price else " Назовите цену — и добавлю его в каталог и магазин.")
            )
            continue

        unit_price = item["unit_price"] if item["unit_price"] is not None else product["price"]
        resolved.append({
            "product_id": product["id"],
            "name": product["name"],
            "unit": product["unit"] or "piece",
            "quantity": item["quantity"],
            "unit_price": unit_price,
            "total_price": unit_price * item["quantity"],
        })

    if questions:
        return {"questions": questions, "missing": missing}
    return {"resolved": resolved}


async def register_sale(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Зарегистрировать состоявшуюся продажу (одну или несколько позиций).

    Параметры:
        customer_name   — кто купил (обязательно), напр. "Zarra Resort"
        phone           — телефон клиента
        items           — [{"product": ..., "quantity": ..., "unit_price": ...}, ...]
                          (или одиночные product/quantity/unit_price)
        customer_type   — 'b2b' (ресторан/кафе) | 'b2c'
        payment_status  — 'paid' (по умолчанию) | 'pending'
        status          — статус заказа: 'delivered' (по умолчанию) | 'new' | ...
        notes           — исходная формулировка менеджера
        registered_by   — кто зарегистрировал

    Возвращает:
        {"status": "ok",        ...}  — заказ создан
        {"status": "duplicate", ...}  — такая продажа уже записана
        {"status": "clarify",   ...}  — не хватает данных; в data.missing —
                                        товары, которых нет в каталоге
        {"status": "error",     ...}
    """
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
            # ── 1. Позиции: каждая обязана быть товаром каталога ──
            outcome = await _resolve_items(session, _normalize_items(params))
            if "questions" in outcome:
                head = "Продажу пока не записал — уточните:" if len(outcome["questions"]) > 1 else ""
                body = "\n\n".join(outcome["questions"])
                return {
                    "status": "clarify",
                    "message": f"{head}\n\n{body}".strip(),
                    "data": {"missing": outcome["missing"], "customer_name": customer_name,
                             "phone": phone},
                }

            lines = outcome["resolved"]
            total_amount = sum(line["total_price"] for line in lines)

            # ── 2. Клиент: ищем по телефону, затем по названию, иначе заводим ──
            customer_id = None
            if phone:
                customer_id = (await session.execute(
                    text("SELECT id FROM customers WHERE phone = :p ORDER BY id LIMIT 1"),
                    {"p": phone},
                )).scalar()
            if not customer_id:
                customer_id = (await session.execute(
                    text("SELECT id FROM customers WHERE name ILIKE :n OR company_name ILIKE :n "
                         "ORDER BY id LIMIT 1"),
                    {"n": customer_name},
                )).scalar()

            customer_created = False
            if customer_id:
                await session.execute(
                    text("UPDATE customers SET phone = COALESCE(phone, :p), "
                         "name = COALESCE(NULLIF(name, ''), :n) WHERE id = :cid"),
                    {"p": phone, "n": customer_name, "cid": customer_id},
                )
            else:
                customer_id = (await session.execute(
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
                )).scalar()
                customer_created = True

            # ── 3. Защита от дубля: та же продажа, тому же клиенту, только что ──
            dup = (await session.execute(
                text(
                    "SELECT id, order_number FROM orders "
                    "WHERE customer_id = :cid AND total_amount = :total "
                    "AND created_at > NOW() - (:mins || ' minutes')::interval "
                    "ORDER BY id DESC LIMIT 1"
                ),
                {"cid": customer_id, "total": total_amount, "mins": str(DEDUPE_WINDOW_MINUTES)},
            )).fetchone()
            if dup:
                return {
                    "status": "duplicate",
                    "message": (f"Эта продажа уже зарегистрирована — заказ {dup[1]} "
                                f"({customer_name}, {format_price(total_amount)}). "
                                f"Повторно не записываю."),
                    "data": {"order_id": dup[0], "order_number": dup[1]},
                }

            # ── 4. Заказ (order_number выдаст триггер) + позиции ──
            row = (await session.execute(
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
            )).fetchone()
            order_id, order_number = row[0], row[1]

            for line in lines:
                await session.execute(
                    text(
                        "INSERT INTO order_items (order_id, product_id, quantity, unit, "
                        "unit_price, total_price) VALUES (:oid, :pid, :qty, :unit, :price, :total)"
                    ),
                    {"oid": order_id, "pid": line["product_id"], "qty": line["quantity"],
                     "unit": line["unit"], "price": line["unit_price"], "total": line["total_price"]},
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
            items_summary = "; ".join(f"{l['name']} × {l['quantity']:g}" for l in lines)
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, order_id, channel, interaction_type, "
                    "bot_name, summary, resolved) "
                    "VALUES (:cid, :oid, 'telegram', 'order', :bot, :summary, true)"
                ),
                {"cid": customer_id, "oid": order_id, "bot": registered_by,
                 "summary": f"Продажа {order_number}: {items_summary} на {format_price(total_amount)}"},
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

    logger.info("SALES_OPS: продажа %s зарегистрирована (клиент #%s, %s)",
                order_number, customer_id, total_amount)

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
    lines.append("")
    for item in d.get("items", []):
        lines.append(
            f"🌱 {item['name']} × {item['quantity']:g} × {format_price(item['unit_price'])} "
            f"= {format_price(item['total_price'])}"
        )
    lines.append("")
    lines.append(f"💰 Итого: <b>{format_price(d['total_amount'])}</b>")
    lines.append("💳 Оплата: " + ("получена" if d.get("payment_status") == "paid" else "ожидается"))
    lines.append("")
    lines.append("Финансы учли доход, аналитика — метрику, PM видит заказ.")
    return "\n".join(lines)
