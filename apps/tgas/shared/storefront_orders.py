"""
🧾 STOREFRONT ORDERS — единственная дверь офиса к заказам витрины
==================================================================
Заказ создаёт витрина, и только она: `POST /api/orders` → `lib/orders/create.ts`.
За одним вызовом стоит всё, что офис своим INSERT'ом никогда не делал —
атомарное списание остатка, номер заказа, уведомление клиента и админов,
реферальный кэшбэк и зеркалирование в CRM через `/ingest/order`.

ПОЧЕМУ НЕ SQL

Раньше офис писал заказ сам: `INSERT INTO orders (customer_id, total_amount…)`.
После объединения баз имя `orders` принадлежит витрине, где обязательны
`user_id`, `subtotal`, `address`, `phone`, `payment_method`, а `order_number`
не имеет умолчания. Вставка падала, ошибка гасилась `except`, и продажа
«регистрировалась» в никуда. Даже почини мы колонки — заказ из Telegram не
появился бы на сайте, и «единой базы» опять бы не вышло.

Поэтому запись идёт по HTTP, и отказ витрины — это отказ операции. Записывать
в обход нельзя: именно так базы и разъезжаются.

АУТЕНТИФИКАЦИЯ
Витрина принимает два вида заголовка (`middleware.ts` — `x-bot-secret`,
`botAuth.ts` — `Authorization: Bearer`). Шлём оба: создание заказа секрета не
требует, а смена статуса требует, и один и тот же клиент должен уметь оба
вызова.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_API_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")

# Офисные статусы (нижний регистр) → enum витрины (верхний).
OFFICE_TO_STOREFRONT_STATUS = {
    "new": "PENDING",
    "confirmed": "CONFIRMED",
    "preparing": "PREPARING",
    "ready": "PREPARING",
    "delivering": "DELIVERING",
    "delivered": "DELIVERED",
    "cancelled": "CANCELLED",
}


def _headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if BOT_SECRET:
        headers["x-bot-secret"] = BOT_SECRET
        headers["Authorization"] = f"Bearer {BOT_SECRET}"
    return headers


def _url(path: str) -> str:
    return f"{STOREFRONT_API_URL.rstrip('/')}{path}"


async def create_order(
    *,
    customer_name: str,
    phone: str,
    address: str,
    items: List[Dict[str, Any]],
    payment_method: str = "cash",
    telegram_id: Optional[int] = None,
    note: Optional[str] = None,
    city: Optional[str] = None,
    performed_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Создать заказ на витрине.

    items — [{"id": <cuid товара>, "price": <цена за единицу>, "quantity": N}].
    Цена передаётся явно: витрина фиксирует её в позиции заказа, и продажа по
    договорной цене не должна тихо подмениться прайсовой.

    Количество может быть дробным (до двух знаков): салат продаётся за
    килограмм, и 1.3 кг — обычная позиция. Раньше витрина принимала только
    целые, и продажу ресторану приходилось округлять.

    performed_by — менеджер, оформивший продажу. Витрина принимает его только
    от доверенного вызывающего (общий секрет), как и договорную цену.

    Возвращает {"ok": True, "order": {...}} либо {"ok": False, "error": "..."}.
    Сетевой сбой — это отказ, а не пустой успех: вызывающий обязан сказать
    руководителю правду, иначе продажа «зарегистрируется» в никуда.
    """
    payload: Dict[str, Any] = {
        "name": customer_name,
        "phone": phone,
        "address": address,
        "paymentMethod": payment_method,
        "source": "ai_office",
        "items": items,
    }
    if telegram_id:
        payload["telegramId"] = str(telegram_id)
    if note:
        payload["note"] = note
    if city:
        payload["city"] = city
    if performed_by:
        payload["performedBy"] = performed_by

    try:
        async with aiohttp.ClientSession(headers=_headers()) as session:
            async with session.post(
                _url("/orders"), json=payload, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                body = await resp.json(content_type=None)
                if resp.status != 200 or not (body or {}).get("success"):
                    error = (body or {}).get("error") or f"HTTP {resp.status}"
                    logger.warning("STOREFRONT_ORDERS: заказ отклонён витриной: %s", error)
                    return {"ok": False, "error": str(error)}
                return {"ok": True, "order": body.get("order") or {}}
    except Exception as exc:
        logger.warning("STOREFRONT_ORDERS: витрина недоступна: %s", exc)
        return {"ok": False, "error": f"витрина недоступна ({exc})"}


async def update_status(
    order_id: str, status: Optional[str] = None, payment_status: Optional[str] = None
) -> Dict[str, Any]:
    """
    Сменить статус заказа витрины (`PUT /api/admin/orders/{id}`).

    Витрина сама уведомит клиента и отзеркалит статус в CRM (`syncOrderStatus`).
    Нужен для офлайн-продажи: заказ создаётся как PENDING, а по факту он уже
    отгружен и оплачен.
    """
    payload: Dict[str, Any] = {}
    if status:
        payload["status"] = OFFICE_TO_STOREFRONT_STATUS.get(
            str(status).lower(), str(status).upper()
        )
    if payment_status:
        payload["paymentStatus"] = str(payment_status).upper()
    if not payload:
        return {"ok": True, "order": {}}

    try:
        async with aiohttp.ClientSession(headers=_headers()) as session:
            async with session.put(
                _url(f"/admin/orders/{order_id}"),
                json=payload,
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                body = await resp.json(content_type=None)
                if resp.status != 200:
                    error = (body or {}).get("error") or f"HTTP {resp.status}"
                    logger.warning(
                        "STOREFRONT_ORDERS: статус заказа %s не сменён: %s",
                        order_id,
                        error,
                    )
                    return {"ok": False, "error": str(error)}
                return {"ok": True, "order": (body or {}).get("order") or {}}
    except Exception as exc:
        logger.warning("STOREFRONT_ORDERS: смена статуса недоступна: %s", exc)
        return {"ok": False, "error": f"витрина недоступна ({exc})"}


async def list_orders(
    limit: int = 10, status: Optional[str] = None
) -> Optional[List[Dict[str, Any]]]:
    """Последние заказы витрины (`GET /api/admin/orders`) — для отчётов ботов.

    `None` — витрина недоступна, `[]` — заказов действительно нет. Раньше обе
    ситуации давали пустой список, и модель, которой предписано считать данные
    инструмента фактом, уверенно отвечала «Заказов сегодня нет» в момент, когда
    контейнер витрины перезапускался. Владелец принимал решения по несуществующему
    провалу продаж.
    """
    params: Dict[str, Any] = {"limit": min(int(limit), 50)}
    if status:
        params["status"] = OFFICE_TO_STOREFRONT_STATUS.get(
            str(status).lower(), str(status).upper()
        )
    try:
        async with aiohttp.ClientSession(headers=_headers()) as session:
            async with session.get(
                _url("/admin/orders"),
                params=params,
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                if resp.status != 200:
                    logger.warning(
                        "STOREFRONT_ORDERS: список заказов недоступен (HTTP %s)",
                        resp.status,
                    )
                    return None
                body = await resp.json(content_type=None)
                return (body or {}).get("orders") or []
    except Exception as exc:
        logger.warning("STOREFRONT_ORDERS: список заказов недоступен: %s", exc)
        return None


async def drain_office_queue() -> Dict[str, Any]:
    """Попросить витрину разобрать очередь «витрина → офис».

    ЗАЧЕМ ЭТО ЗДЕСЬ. Очередь `office_outbox` на витрине хранит обещание
    отзеркалить заказ или чек и повторяет попытки — но толкает её только
    новая операция: каждая продажа после ответа зовёт `drainOffice`.
    Роут по расписанию (`/api/inventory/cron/office-sync`) для этого и
    написан, и не звал его НИКТО — ни рабочий процесс GitHub, ни офис.

    Из-за этого оставался ровно тот случай, который в самом роуте и описан:
    офис лёг под вечер, следующий чек будет утром — привязка чека к клиенту
    и заказ в CRM проваляются всю ночь, хотя чинить нечего, надо повторить.

    Ходим со стороны офиса, потому что расписание в проекте живёт здесь
    (`BotScheduler`), а на витрине планировщика нет вовсе.
    """
    url = _url("/inventory/cron/office-sync")
    try:
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=_headers()) as resp:
                if resp.status != 200:
                    body = (await resp.text())[:200]
                    logger.warning(
                        "Очередь зеркала не разобрана: витрина ответила %s (%s)",
                        resp.status,
                        body,
                    )
                    return {"ok": False, "status": resp.status}
                data = await resp.json()
                if data.get("sent"):
                    logger.info(
                        "Очередь зеркала: доставлено %s, осталось %s",
                        data.get("sent"),
                        data.get("pending"),
                    )
                return {"ok": True, **data}
    except Exception as exc:  # noqa: BLE001 — недоступная витрина не роняет офис
        logger.warning("Очередь зеркала не разобрана: %s", exc)
        return {"ok": False, "error": str(exc)}
