"""
💰 SALES OPS — реальные операции продаж
========================================
Единственное место, где «продажа, о которой сообщил менеджер», превращается в
факты: клиент → заказ витрины → карточка клиента в CRM → журнал → ORDER_CREATED.

Правила модуля:
1. НИЧЕГО НЕ ВЫДУМЫВАТЬ. Нет цены, товар неоднозначен, товара нет в каталоге —
   возвращаем status="clarify" с конкретным вопросом, а не подставляем «примерно».
2. КАЖДАЯ позиция обязана быть товаром каталога. Если товара нет — предлагаем
   добавить его в каталог (shared.catalog_ops.add_product), но только с одобрения
   руководителя. Заказ «на сумму без товара» больше не пишем: такие строки не
   попадают ни в остатки, ни в аналитику по товарам.
3. Одна продажа = один заказ, даже если позиций несколько («10 гороха и 13 редиса»).
4. Заказ создаёт ВИТРИНА (shared.storefront_orders), а не наш INSERT. Тогда
   продажа из Telegram и заказ с сайта — одна и та же строка в одной таблице,
   с общим номером, списанием остатка и зеркалом в CRM. Витрина недоступна —
   продажа НЕ регистрируется, и об этом говорится прямо.

Поиск товара живёт в shared.catalog_repo: каталог-мастер витринный, и его
колонки знает только он.
"""

import hashlib
import logging
import re
from typing import Any, Dict, List, Optional

from shared import catalog_repo, customer_repo, storefront_orders
from shared.phone import normalize as normalize_phone
from shared.utils import format_price

logger = logging.getLogger(__name__)

# Окно, в котором повторная регистрация той же продажи считается дублем.
# Нужен, потому что каждое сообщение в чате проходит через LLM независимо, и
# «Степан зарегистрируй продажу…» + «мы уже продали» легко порождают два вызова.
DEDUPE_WINDOW_MINUTES = 15


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


def _normalize_items(params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Приводим вход к списку позиций: items[] либо одиночные product/quantity."""
    raw = params.get("items")
    if not raw:
        raw = [
            {
                "product": params.get("product"),
                "quantity": params.get("quantity"),
                "unit_price": params.get("unit_price"),
            }
        ]
    items = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        items.append(
            {
                # product_id проставляется, когда руководитель выбрал позицию кнопкой —
                # тогда искать по названию уже не нужно.
                "product_id": entry.get("product_id"),
                "product": str(entry.get("product") or "").strip() or None,
                # НЕ подставляем единицу вместо «не сказали».
                #
                # Здесь стояло `or 1.0`, и «продажа ресторану Жасмин микрозелень
                # гороха» записывалась как один лоток: доход учтён, остаток
                # списан, всё на выдуманном числе. Это хуже отказа — отказ
                # видно, а выдумка выглядит успехом. Дальше по коду количество
                # проверяется и превращается в вопрос руководителю.
                "quantity": _to_float(entry.get("quantity")),
                "unit_price": _to_float(entry.get("unit_price")),
            }
        )
    return items


async def _resolve_items(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Сопоставляем каждую позицию с каталогом.

    Возвращает {"resolved": [...]} либо {"ambiguous": [...], "missing": [...]}
    — структурой, по которой Степан рисует кнопки выбора (см. handlers/sale_ui.py).
    """
    resolved: List[Dict[str, Any]] = []
    ambiguous: List[Dict[str, Any]] = []
    missing: List[Dict[str, Any]] = []

    for index, item in enumerate(items):
        product: Optional[Dict[str, Any]] = None

        if item.get("product_id"):
            product = await catalog_repo.by_id(item["product_id"])

        if not product:
            name = item["product"]
            if not name:
                missing.append(
                    {
                        "index": index,
                        "name": None,
                        "quantity": item["quantity"],
                        "unit_price": item["unit_price"],
                    }
                )
                continue

            outcome = await catalog_repo.resolve(name)
            if outcome.get("product"):
                product = outcome["product"]
            elif outcome.get("candidates"):
                ambiguous.append(
                    {"index": index, "query": name, "candidates": outcome["candidates"]}
                )
                continue
            else:
                missing.append(
                    {
                        "index": index,
                        "name": name,
                        "quantity": item["quantity"],
                        "unit_price": item["unit_price"],
                    }
                )
                continue

        unit_price = (
            item["unit_price"] if item["unit_price"] is not None else product["price"]
        )
        quantity = item["quantity"]
        resolved.append(
            {
                "product_id": product["id"],
                "name": product["name"],
                "unit": product["unit"] or "piece",
                # Количество может быть неизвестно: его не назвали. Позицию всё
                # равно сопоставляем — чтобы спросить «сколько ЛОТКОВ ГОРОХА»,
                # а не «сколько того, что вы там сказали».
                "quantity": quantity,
                "unit_price": unit_price,
                "total_price": None if quantity is None else unit_price * quantity,
            }
        )

    if ambiguous or missing:
        return {"ambiguous": ambiguous, "missing": missing}
    return {"resolved": resolved}


def _sale_fingerprint(customer_name: str, phone: Optional[str], total: float) -> str:
    """Отпечаток продажи: тот же клиент на ту же сумму — та же продажа."""
    raw = f"{(phone or customer_name).strip().lower()}|{round(float(total), 2)}"
    return "sale:dedupe:" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


async def _redis():
    import redis.asyncio as aioredis

    from shared.config import settings

    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def _seen_recently(fingerprint: str) -> Optional[str]:
    """Номер заказа, если такая же продажа уже прошла в окне дедупликации.

    Redis недоступен — дедупликации нет, но продажу это не блокирует: лучше
    редкий дубль, который видно, чем незаписанная продажа.
    """
    try:
        client = await _redis()
        return await client.get(fingerprint)
    except Exception as exc:
        logger.warning("SALES_OPS: дедупликация недоступна (%s)", exc)
        return None


async def _remember_sale(fingerprint: str, order_number: Optional[str]) -> None:
    try:
        client = await _redis()
        await client.set(
            fingerprint, order_number or "—", ex=DEDUPE_WINDOW_MINUTES * 60
        )
    except Exception as exc:
        logger.warning("SALES_OPS: не смог запомнить продажу для дедупликации (%s)", exc)


async def _upsert_customer(
    customer_name: str,
    phone: Optional[str],
    customer_type: str,
    registered_by: str,
    customer_id: Optional[int] = None,
    match_by_name: bool = True,
) -> tuple[Optional[int], bool, Optional[str]]:
    """Завести карточку клиента продажи. Возвращает (id, создана ли, телефон).

    Сам поиск живёт в `shared/customer_repo` — он один на весь офис. Здесь
    остаётся только то, что знает именно продажа: тип клиента (b2b/b2c),
    статус «активный» вместо лида и пометка, кто продажу зарегистрировал.
    """
    saved = await customer_repo.upsert(
        customer_id=customer_id,
        name=customer_name,
        raw_phone=phone,
        customer_type=customer_type,
        status="active",
        source="manual",
        notes=f"Заведён при регистрации продажи ({registered_by})",
        match_by_name=match_by_name,
    )
    return saved["id"], saved["created"], saved["phone"]


# Витрина отвечает по-узбекски (её язык интерфейса), а сообщение уходит
# русскоязычному руководителю. Раньше код ошибки подставлялся в текст как есть:
# «Продажу НЕ записал: Shaxsiy ma'lumotlar to'liq emas» не говорит, какого поля
# не хватает, и на уточняющий вопрос модель отвечала отказом по приватности —
# она прочитала «личные данные» как просьбу их выдать, а не как код валидации.
_STOREFRONT_ERRORS = {
    "Shaxsiy ma'lumotlar to'liq emas": "витрине не хватило данных клиента (имя, телефон или адрес)",
    "Savat bo'sh": "в заказе нет ни одной позиции",
    "Noto'g'ri ma'lumot formati": "витрина не разобрала формат заказа",
    "Xatolik yuz berdi": "витрина ответила внутренней ошибкой",
}


def _storefront_refusal_message(error: str) -> str:
    """Объяснить отказ витрины и подсказать, повтор тут поможет или нет.

    Различие существенное: при 400 повтор даёт ровно тот же результат, и совет
    «повторите позже» отправляет руководителя по кругу — так и вышло с продажей
    ресторану, где два вызова подряд вернули одинаковый отказ.
    """
    reason = _STOREFRONT_ERRORS.get(str(error).strip(), str(error))
    transient = str(error).startswith("витрина недоступна") or "HTTP 5" in str(error)
    tail = (
        "Витрина сейчас недоступна — повторите через несколько минут."
        if transient
        else "Повтор с теми же данными даст тот же отказ — нужно исправить данные."
    )
    return (
        f"Продажу НЕ записал: {reason}. "
        f"Заказы заводит витрина — мимо неё писать нельзя, иначе продажи не "
        f"будет ни на сайте, ни в остатках. {tail}"
    )


async def _known_customer(
    params: Dict[str, Any],
    customer_name: str,
    phone: Optional[str],
    customer_type: str,
    payment_status: str,
    order_status: str,
    notes: str,
    items: List[Dict[str, Any]],
) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Опознать клиента до создания чего-либо.

    Возвращает (карточка или None, ответ-уточнение или None). Уточнение
    возникает ровно в одном случае — под запрос подходит несколько карточек.
    Выбрать первую было бы хуже всего: продажа ушла бы не тому клиенту молча,
    и заметили бы это только при разборе долгов.
    """
    # Руководитель уже выбрал карточку кнопкой — второй раз не ищем: поиск по
    # тому же имени снова дал бы список, и уточнение зациклилось бы.
    picked = params.get("customer_id")
    if picked:
        try:
            found = await customer_repo.by_id(int(picked))
        except (TypeError, ValueError):
            found = None
        if found:
            return found, None

    # «Это новый клиент» — тоже ответ руководителя. Без этого флага поиск снова
    # нашёл бы те же карточки и задал бы тот же вопрос по кругу.
    if params.get("force_new_customer"):
        return None, None

    match = await customer_repo.resolve(customer_name, phone)
    if "customer" in match:
        return match["customer"], None

    candidates = match.get("candidates") or []

    # Совпадений нет — но прежде чем заводить карточку, смотрим, нет ли
    # ПОХОЖЕЙ. 10.08.2026 рядом с «Жасмин» появился «ресторан жасмин»: поиск
    # промахнулся, и вторая карточка создалась молча. С этого момента история
    # заказов и долги одного ресторана разъезжаются на два лица, и замечают
    # это на сверке — то есть месяцем позже.
    #
    # Спрашиваем только когда сами не уверены: нашлось похожее — вопрос,
    # не нашлось ничего — заводим молча, как и раньше.
    if not candidates:
        candidates = await customer_repo.similar(customer_name)

    if candidates:
        one = len(candidates) == 1
        return None, {
            "status": "clarify",
            "message": (
                f"«{customer_name}» — это {candidates[0]['name']}? "
                f"Или новый клиент? Выберите ниже 👇"
                if one
                else f"Под «{customer_name}» подходит несколько клиентов. "
                f"Кому продали? Выберите ниже 👇"
            ),
            "data": {
                "needs": "customer",
                "candidates": [
                    {
                        "id": c["id"],
                        "name": c["name"],
                        "phone": c["phone_display"],
                        "customer_type": c["customer_type"],
                        "orders_count": c["orders_count"],
                    }
                    for c in candidates
                ],
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

    return None, None


def _clarify_message(
    ambiguous: List[Dict[str, Any]], missing: List[Dict[str, Any]]
) -> str:
    """Короткий вопрос. Список вариантов уходит в кнопки, а не в текст."""
    parts = []
    for amb in ambiguous:
        parts.append(f"Какую «{amb['query']}» продали? Выберите ниже 👇")
    for miss in missing:
        if not miss.get("name"):
            parts.append("Что именно продали? Назовите товар.")
        elif miss.get("unit_price"):
            parts.append(
                f"Товара «{miss['name']}» нет в каталоге. "
                f"Добавить в магазин и CRM по {format_price(miss['unit_price'])}?"
            )
        else:
            parts.append(
                f"Товара «{miss['name']}» нет в каталоге. "
                f"Назовите цену — заведу его в магазин и CRM."
            )
    head = "Продажу пока не записал.\n\n" if len(parts) > 1 else ""
    return head + "\n\n".join(parts)


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
    customer_type = (
        "b2b" if str(params.get("customer_type") or "").lower() == "b2b" else "b2c"
    )
    payment_status = (
        "pending"
        if str(params.get("payment_status") or "").lower() == "pending"
        else "paid"
    )
    order_status = str(params.get("status") or "delivered").lower()
    if order_status not in (
        "new",
        "confirmed",
        "preparing",
        "ready",
        "delivering",
        "delivered",
    ):
        order_status = "delivered"
    notes = str(params.get("notes") or "").strip()
    registered_by = str(params.get("registered_by") or "sales_bot")

    try:
        # ── 1. Позиции: каждая обязана быть товаром каталога ──
        items = _normalize_items(params)
        outcome = await _resolve_items(items)
        if "ambiguous" in outcome:
            # Отдаём «незакрытую» продажу целиком: Степан покажет кнопки выбора
            # и после ответа руководителя вызовет register_sale снова.
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

        # ── Количество не назвали — спрашиваем, а не ставим единицу ──
        #
        # 10.08.2026 «Продажа ресторан жасмин микрозелень гороха» записалась как
        # ОДИН лоток: количество в тексте не звучало, а код подставлял 1.0.
        # Продажа ушла в базу, доход учёлся, остаток списался — всё на
        # выдуманном числе, и выглядело это как успешно выполненная работа.
        #
        # Спрашиваем ровно так же, как про дробное количество ниже: назвать
        # цифру дешевле, чем потом искать, откуда в кассе лишние 15 000.
        unknown = [line for line in lines if line["quantity"] is None]
        if unknown:
            names = ", ".join(f"{line['name']} ({line['unit']})" for line in unknown)
            return {
                "status": "clarify",
                "message": (
                    f"Сколько продали? Не назвали количество: {names}.\n"
                    f"Скажите число — запишу продажу."
                ),
                "data": {
                    "needs": "quantity",
                    "unknown": [
                        {
                            "index": index,
                            "name": line["name"],
                            "unit": line["unit"],
                            "unit_price": line["unit_price"],
                        }
                        for index, line in enumerate(lines)
                        if line["quantity"] is None
                    ],
                    "pending": {
                        "customer_name": customer_name,
                        "customer_id": params.get("customer_id"),
                        "phone": phone,
                        "customer_type": customer_type,
                        "payment_status": payment_status,
                        "status": order_status,
                        "notes": notes,
                        # Позиции уже сопоставлены с каталогом: при дозаписи
                        # искать товар заново не придётся, и «горох» не
                        # превратится вдруг в другую позицию.
                        "items": [
                            {
                                "product_id": line["product_id"],
                                "product": line["name"],
                                "quantity": line["quantity"],
                                "unit_price": line["unit_price"],
                            }
                            for line in lines
                        ],
                    },
                },
            }

        total_amount = sum(line["total_price"] for line in lines)

        # Витрина считает позиции в целых единицах (OrderItem.quantity — Int).
        # Дробное количество молча превратилось бы в отказ витрины с непонятной
        # ошибкой, поэтому спрашиваем прямо, а не подгоняем цифры за менеджера:
        # округление количества исказило бы и остаток, и сумму.
        fractional = [
            line for line in lines if not float(line["quantity"]).is_integer()
        ]
        if fractional:
            names = ", ".join(
                f"{line['name']} × {line['quantity']:g} {line['unit']}"
                for line in fractional
            )
            return {
                "status": "clarify",
                "message": (
                    f"Дробное количество записать не могу: {names}.\n"
                    f"Назовите в целых единицах — например, в граммах или в "
                    f"количестве упаковок."
                ),
                "data": {"fractional": fractional},
            }

        # ── 2. Защита от дубля ──
        # Раньше дубль искали в таблице заказов. Теперь заказ создаёт витрина, а
        # зеркало в CRM приходит асинхронно — на момент второго вызова его может
        # ещё не быть. Поэтому отпечаток продажи держим в Redis: он появляется
        # сразу и живёт ровно окно дедупликации.
        fingerprint = _sale_fingerprint(customer_name, phone, total_amount)
        already = await _seen_recently(fingerprint)
        if already:
            return {
                "status": "duplicate",
                "message": (
                    f"Эта продажа уже зарегистрирована — заказ {already} "
                    f"({customer_name}, {format_price(total_amount)}). "
                    f"Повторно не записываю."
                ),
                "data": {"order_number": already},
            }

        # ── 3. Клиент: сначала ОПОЗНАТЬ, потом заводить ──
        # Порядок здесь важнее, чем кажется. Раньше карточка заводилась первой,
        # а искалась точным совпадением имени: «Ресторан Жасмин» не находил
        # «Жасмин», и каждая продажа тому же ресторану плодила новую карточку и
        # заново спрашивала телефон. Теперь поиск идёт через customer_repo —
        # нечёткий, с транслитерацией и по значащим словам названия.
        known, ask_which = await _known_customer(
            params, customer_name, phone, customer_type, payment_status,
            order_status, notes, items,
        )
        if ask_which:
            return ask_which

        # ── 3a. Телефон обязателен для витрины ──
        # По нему она связывает заказ с пользователем (`user.upsert where phone`),
        # поэтому пустой номер = отказ 400. Менеджер диктует продажу постоянному
        # клиенту без номера, и это нормально: берём его из карточки CRM.
        # Спрашиваем ДО создания карточки: отказ на этом шаге раньше оставлял в
        # базе клиента без телефона, и следующая попытка с чуть иным написанием
        # имени добавляла к нему второго такого же сироту.
        phone = phone or (known or {}).get("phone")
        if not phone:
            return {
                "status": "clarify",
                "message": (
                    f"Назовите телефон клиента «{customer_name}» — без него "
                    f"витрина не примет заказ, она связывает продажу с клиентом "
                    f"именно по номеру. Спрошу один раз: дальше он останется "
                    f"в карточке."
                ),
                "data": {
                    "needs": "phone",
                    "pending": {
                        "customer_name": customer_name,
                        "customer_type": customer_type,
                        "payment_status": payment_status,
                        "status": order_status,
                        "notes": notes,
                        "items": items,
                    },
                },
            }

        # ── 3b. Карточка клиента в CRM ──
        # Заводим ДО заказа: зеркало витрины ищет клиента по телефону и, найдя
        # нашу карточку, дополнит её вместо создания второй, уже как b2c.
        # Тип клиента и компания известны только здесь.
        customer_id, customer_created, _ = await _upsert_customer(
            customer_name,
            phone,
            customer_type,
            registered_by,
            customer_id=(known or {}).get("id"),
            match_by_name=not params.get("force_new_customer"),
        )

        # ── 4. Заказ создаёт витрина ──
        # Один вызов даёт номер, списание остатка, уведомления и зеркало в CRM
        # через /ingest/order. Заказ виден и на сайте, и в Telegram.
        created = await storefront_orders.create_order(
            customer_name=customer_name,
            phone=phone,
            address=str(params.get("address") or "").strip()
            or "Продажа оформлена AI-офисом",
            items=[
                {
                    "id": line["product_id"],
                    "price": int(round(line["unit_price"])),
                    "quantity": int(line["quantity"]),
                }
                for line in lines
            ],
            note=(notes or f"Продажа зарегистрирована вручную ({registered_by})")[:500],
        )
        if not created["ok"]:
            return {
                "status": "error",
                "message": _storefront_refusal_message(created["error"]),
            }

        order = created["order"]
        order_id, order_number = order.get("id"), order.get("orderNumber")
        await _remember_sale(fingerprint, order_number)

        # ── 5. Факт продажи: уже отгружено и оплачено ──
        # Витрина создаёт заказ как PENDING — это верно для покупки на сайте, но
        # менеджер сообщает об УЖЕ состоявшейся продаже. Статус правим тем же
        # путём, что и админка: она уведомит клиента и отзеркалит статус в CRM.
        #
        # Результат ПРОВЕРЯЕМ. `update_status` возвращает `{"ok": False, …}` при
        # любой HTTP-ошибке, и это молча выбрасывалось: отчёт печатал статус из
        # ЗАПРОСА, а не из факта. Менеджер читал «💳 Оплата: получена», а в базе
        # заказ оставался PENDING/UNPAID — дальше `get_sales_today` показывал его
        # неоплаченным, через сутки автозадача требовала «обработать» уже
        # отгруженный заказ, а клиенту не уходило уведомление о доставке.
        status_applied = True
        if order_id and (order_status != "new" or payment_status == "paid"):
            applied = await storefront_orders.update_status(
                order_id,
                status=order_status,
                payment_status=payment_status,
            )
            status_applied = bool((applied or {}).get("ok", False))
            if not status_applied:
                logger.error(
                    "SALES_OPS: заказ %s создан, но статус/оплату витрина не приняла: %s",
                    order_number,
                    applied,
                )

    except Exception as exc:
        logger.exception("SALES_OPS: не удалось зарегистрировать продажу: %s", exc)
        return {"status": "error", "message": f"Не смог зарегистрировать продажу: {exc}"}

    # ORDER_CREATED здесь НЕ публикуем: его разошлёт зеркало /ingest/order, когда
    # витрина передаст ему заказ. Два события подряд означали бы двойной доход
    # в финансах и удвоенную метрику в аналитике.

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
            # Отчёт печатает статус только если витрина его действительно
            # приняла — иначе «Оплата: получена» была бы выдумкой.
            "status_applied": status_applied,
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

    # Статус печатаем как ФАКТ, только если витрина его приняла. Раньше здесь
    # стояло значение из запроса, и при отказе витрины отчёт уверенно сообщал
    # «Оплата: получена» по заказу, который в базе висел неоплаченным.
    if d.get("status_applied", True):
        lines.append(
            "💳 Оплата: "
            + ("получена" if d.get("payment_status") == "paid" else "ожидается")
        )
        lines.append("")
        lines.append("Финансы учли доход, аналитика — метрику, PM видит заказ.")
    else:
        lines.append("")
        lines.append(
            "⚠️ Статус и оплату витрина не приняла — заказ висит как новый и "
            "неоплаченный. Поправьте в админке, иначе через сутки придёт "
            "напоминание «заказ не обработан»."
        )
    return "\n".join(lines)
