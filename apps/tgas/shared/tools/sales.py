"""
Инструменты отдела продаж: регистрация продажи, каталог, статусы, дожим.

Логика здесь не пишется — она уже есть в `shared/sales_ops.py` и
`shared/catalog_ops.py`, и ей же пользуется Стёпан. Это обёртки, чтобы отдел
продаж мог сделать ровно то же самое сам, а не «сгенерировать текст о продаже».
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from shared import capabilities, catalog_ops, sales_ops, storefront_orders
from shared.tools.registry import Tool, from_capability, register
from shared.utils import format_price

DEPTS = ["sales"]


async def register_sale(
    customer_name: str,
    items: Optional[List[Dict[str, Any]]] = None,
    phone: Optional[str] = None,
    customer_type: str = "b2c",
    payment_status: str = "paid",
    notes: str = "",
    customer_id: Optional[int] = None,
    force_new_customer: bool = False,
    registered_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Зарегистрировать состоявшуюся продажу.

    `customer_id`, `force_new_customer` и `items[].product_id` — это ответы на
    уточнения, которые `sales_ops` умеет задавать: «какую рукколу продали?» и
    «этот клиент или новый?». В сигнатуре и схеме их не было, поэтому ответить
    на уточнение модель физически не могла: кнопки рисует только UI Стёпана, а
    у sales_bot такого роутера нет — задача уходила в тупик и через три часа
    возвращалась с тем же вопросом.

    `items` НЕ обязателен намеренно. Пока он стоял в `required`, модель, решившая
    (пусть и ошибочно), что перед ней продажа, обязана была назвать хоть какой-то
    товар — и называла общее слово «микрозелень». Дальше цепочка уходила в «такого
    товара нет в каталоге» и не заводила ни клиента, ни заказ. Без позиций
    `sales_ops` честно спрашивает «Что именно продали?», и это видно.
    """
    return await sales_ops.register_sale(
        {
            "customer_name": customer_name,
            "items": items or [],
            "phone": phone,
            "customer_type": customer_type,
            "payment_status": payment_status,
            "notes": notes,
            "customer_id": customer_id,
            "force_new_customer": force_new_customer,
            # Имя менеджера, если вызывающий его знает. Здесь стояла строка
            # "sales_bot", из-за чего авторство продажи терялось.
            "registered_by": registered_by,
        }
    )


async def add_product(
    name: str,
    price: float,
    unit: str = "piece",
    category: str = "microgreens",
    stock: float = 0,
) -> Dict[str, Any]:
    """Завести новый товар — и в магазин, и в CRM."""
    return await catalog_ops.add_product(
        {
            "name": name,
            "price": price,
            "unit": unit,
            "category": category,
            "stock": stock,
        }
    )


async def update_order_status(
    order_id: str, status: Optional[str] = None, payment_status: Optional[str] = None
) -> Dict[str, Any]:
    """Сменить статус заказа: клиента уведомит витрина."""
    result = await storefront_orders.update_status(order_id, status, payment_status)
    if not result["ok"]:
        return {"ok": False, "message": result["error"]}
    return {"ok": True, "message": f"Статус заказа {order_id} обновлён."}


async def notify_customers(segment: str = "all", message: str = "") -> Dict[str, Any]:
    """Написать клиентам по сегменту: Telegram → email → задача на звонок."""
    result = await capabilities.run_capability(
        "notify_customers", {"segment": segment, "message": message}
    )
    return from_capability(result)


async def push_stale_orders() -> Dict[str, Any]:
    """Дожать зависшие заказы (не закрыты и давно не двигались)."""
    result = await capabilities.run_capability("push_stale_orders", {})
    return from_capability(result)


register(
    Tool(
        name="register_sale",
        description=(
            "Зарегистрировать СОСТОЯВШУЮСЯ продажу: клиент, позиции, оплата. "
            "Заводит заказ в магазине, списывает остаток и заносит клиента в CRM. "
            "Вызывай, когда сообщают «продали», «купили», «отгрузили». "
            "Одна продажа = один вызов со списком позиций."
        ),
        run=register_sale,
        departments=DEPTS,
        params={
            "customer_name": {"type": "string", "description": "Кому продали"},
            "phone": {"type": "string", "description": "Телефон клиента, если назван"},
            "items": {
                "type": "array",
                "description": (
                    "Позиции продажи. Товар НЕ назван — оставь список пустым: "
                    "отдел спросит сам. Выдумывать позицию, лишь бы вызов "
                    "прошёл, ЗАПРЕЩЕНО."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "product": {"type": "string", "description": "Название товара"},
                        "product_id": {
                            "type": "integer",
                            "description": (
                                "Номер товара из уточнения «какой именно» — "
                                "подставь его, если отдел прислал варианты."
                            ),
                        },
                        "quantity": {
                            "type": "number",
                            "description": (
                                "Количество — ТОЛЬКО если названо. Не назвали — "
                                "НЕ СТАВЬ 1 и не угадывай: пропусти поле, отдел "
                                "продаж сам спросит у руководителя."
                            ),
                        },
                        "unit_price": {
                            "type": "number",
                            "description": "Цена за единицу — только если названа явно",
                        },
                    },
                    # quantity намеренно НЕ обязателен: пока он стоял в required,
                    # модель дописывала единицу, лишь бы вызов прошёл валидацию.
                    "required": ["product"],
                },
            },
            "customer_type": {
                "type": "string",
                "enum": ["b2b", "b2c"],
                "description": "Ресторан/кафе/отель → b2b",
            },
            "payment_status": {
                "type": "string",
                "enum": ["paid", "pending"],
                "description": "Оплачено или ждём оплату",
            },
            "notes": {"type": "string", "description": "Как сформулировал менеджер"},
            "customer_id": {
                "type": "integer",
                "description": (
                    "Номер клиента из уточнения «этот или этот» — подставь, "
                    "если отдел прислал список карточек."
                ),
            },
            "force_new_customer": {
                "type": "boolean",
                "description": (
                    "true — завести НОВУЮ карточку клиента, даже если есть "
                    "похожие. Ответ на уточнение о тёзках."
                ),
            },
        },
        # items НЕ обязателен: см. докстринг обёртки выше. Требование позиции
        # заставляло модель выдумывать товар, когда продажи не было вовсе.
        required=["customer_name"],
        risky=True,
        # Заказа ещё нет — он появится после «Одобрить», поэтому выделять
        # нечего: ссылка ведёт на список заказов, где он и возникнет.
        admin_tab="orders",
        confirm=lambda a: (
            f"Зарегистрировать продажу «{a.get('customer_name')}»: "
            f"{len(a.get('items') or [])} позиц. — заказ появится в магазине "
            f"и спишет остаток"
        ),
    )
)

register(
    Tool(
        name="add_product",
        description="Добавить новый товар в каталог магазина и в CRM.",
        run=add_product,
        departments=DEPTS,
        params={
            "name": {"type": "string", "description": "Название товара"},
            "price": {"type": "number", "description": "Цена за единицу в сумах"},
            "unit": {
                "type": "string",
                "enum": ["piece", "kg", "g", "pack", "set"],
                "description": "Единица измерения",
            },
            "category": {
                "type": "string",
                "enum": [
                    "microgreens",
                    "baby-leaf",
                    "salads",
                    "flowers",
                    "seeds",
                    "substrate",
                    "equipment",
                    "sets",
                ],
                "description": "Категория каталога",
            },
            "stock": {"type": "number", "description": "Остаток, если известен"},
        },
        required=["name", "price"],
        risky=True,
        admin_tab="products",
        confirm=lambda a: (
            f"Добавить товар «{a.get('name')}» по {format_price(float(a.get('price') or 0))} "
            f"в магазин и CRM"
        ),
    )
)

register(
    Tool(
        name="update_order_status",
        description="Изменить статус заказа или его оплаты. Клиент получит уведомление.",
        run=update_order_status,
        departments=DEPTS,
        params={
            "order_id": {"type": "string", "description": "ID заказа магазина"},
            "status": {
                "type": "string",
                "enum": [
                    "new",
                    "confirmed",
                    "preparing",
                    "delivering",
                    "delivered",
                    "cancelled",
                ],
                "description": "Новый статус заказа",
            },
            "payment_status": {
                "type": "string",
                "enum": ["pending", "paid", "refunded"],
                "description": "Статус оплаты",
            },
        },
        required=["order_id"],
        risky=True,
        admin_tab="orders",
        admin_focus_arg="order_id",
        confirm=lambda a: (
            f"Заказ {a.get('order_id')} → статус {a.get('status') or '—'}, "
            f"оплата {a.get('payment_status') or '—'} (клиенту уйдёт уведомление)"
        ),
    )
)

register(
    Tool(
        name="notify_customers",
        description=(
            "Связаться с клиентами по сегменту (all, b2b, b2c, vip, leads, "
            "stale_orders, inactive): Telegram → email → задача человеку на звонок."
        ),
        run=notify_customers,
        departments=DEPTS,
        params={
            "segment": {
                "type": "string",
                "enum": ["all", "b2b", "b2c", "vip", "leads", "stale_orders", "inactive"],
                "description": "Кому пишем",
            },
            "message": {"type": "string", "description": "Текст сообщения"},
        },
        required=["segment", "message"],
        risky=True,
        admin_tab="customers",
        confirm=lambda a: (
            f"Разослать сообщение сегменту «{a.get('segment')}» — это уйдёт живым клиентам"
        ),
    )
)

register(
    Tool(
        name="push_stale_orders",
        description="Дожать зависшие заказы: связаться с клиентами по незакрытым заказам.",
        run=push_stale_orders,
        departments=DEPTS,
        risky=True,
        admin_tab="orders",
        confirm=lambda a: "Написать клиентам по зависшим заказам",
    )
)
