"""
🌱 PRODUCTION REPO — единственная дверь офиса к производственному контуру
=========================================================================
Партии (`grow_batches`), сырьё (`raw_materials`), смены (`shifts`), ОТК
(`quality_controls`), опыты (`experiments`), маршруты (`delivery_routes`).

ПОЧЕМУ НЕ SQL

Посадка — это не INSERT. `plantBatch` (`apps/web/src/lib/production/growBatch.ts`)
списывает семена и субстрат по нормам культуры из `crop_norms`, пишет движения
в `raw_material_movements` и складывает себестоимость партии. `receiveMaterial`
пересчитывает средневзвешенную цену закупки. `harvestBatch` одной транзакцией
приходует товар и раскидывает себестоимость на единицу — комментарий в
`api/admin/grow-batches/route.ts` объясняет, что раньше приход делал браузер
отдельным запросом и двойной клик давал двойной приход.

Повтори мы эту арифметику на Python — получим две копии, которые разойдутся.
Ровно так уже разъезжались каталог и заказы; отсюда `catalog_repo.py` и
`storefront_orders.py`, и отсюда же этот модуль.

Офис пишет производство ТОЛЬКО через витрину. Отказ витрины — это отказ
операции, а не тихий успех: бот обязан сказать руководителю правду, иначе
«посадил» превращается в партию, которой нет.

АУТЕНТИФИКАЦИЯ
Те же два заголовка, что и в `storefront_orders.py`: `x-bot-secret` для
`middleware.ts` и `Authorization: Bearer` для `botAuth.ts`. Роуты `/api/admin/*`
пускают бота через `isAuthorized` (`apps/web/src/lib/adminAuth.ts`).

PERFORMED_BY
Витрина проставляет `performedBy` в движения сырья и в журнал аудита. Офис
подписывается `ai_office`, чтобы «кто списал» отвечалось по данным, а не по
догадкам.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_API_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")

# Подпись офиса в движениях сырья и аудите витрины.
PERFORMED_BY = "ai_office"

DEFAULT_TIMEOUT = 30


def _headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if BOT_SECRET:
        headers["x-bot-secret"] = BOT_SECRET
        headers["Authorization"] = f"Bearer {BOT_SECRET}"
    return headers


def _url(path: str) -> str:
    return f"{STOREFRONT_API_URL.rstrip('/')}{path}"


async def _call(
    method: str,
    path: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    """Один запрос к витрине. Всегда {"ok": bool, ...} — никаких исключений наружу.

    Роуты витрины отвечают тремя разными формами: `{status:'ok', ...}`,
    `{success:true, ...}` и голым объектом с кодом 201. Разбираем все три
    здесь, чтобы вызывающие про это не знали.
    """
    try:
        async with aiohttp.ClientSession(headers=_headers()) as session:
            async with session.request(
                method,
                _url(path),
                json=payload,
                params=params,
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as resp:
                body = await resp.json(content_type=None)
                if resp.status not in (200, 201):
                    error = (body or {}).get("error") or f"HTTP {resp.status}"
                    logger.warning(
                        "PRODUCTION_REPO: %s %s отклонён витриной: %s", method, path, error
                    )
                    # Тело отказа несём наружу целиком: на 409 витрина кладёт
                    # в `needs` разбор «чего и сколько не хватает», и это
                    # единственный способ сказать владельцу цифры, а не «не смог».
                    return {
                        "ok": False,
                        "error": str(error),
                        "details": body if isinstance(body, dict) else {},
                    }
                if isinstance(body, dict) and body.get("error"):
                    return {"ok": False, "error": str(body["error"])}
                return {"ok": True, "data": body if isinstance(body, dict) else {}}
    except Exception as exc:
        logger.warning("PRODUCTION_REPO: витрина недоступна (%s %s): %s", method, path, exc)
        return {"ok": False, "error": f"витрина недоступна ({exc})"}


# ── Партии ──────────────────────────────────────────────────────────────


async def plant_requirements(crop_type: str, trays: int) -> Dict[str, Any]:
    """Сколько сырья спишет посадка и хватает ли его. Ничего не меняет.

    Витрина считает это по `crop_norms` тем же кодом, что и сама посадка,
    поэтому цифры в карточке подтверждения совпадут с фактическим списанием.
    """
    return await _call(
        "GET",
        "/admin/grow-batches",
        params={"requirements": str(crop_type), "trays": str(int(trays))},
    )


async def plant(
    crop_type: str,
    trays: int,
    seed_date: str = "",
    note: str = "",
    product_name: str = "",
) -> Dict[str, Any]:
    """Посадить партию: списывает сырьё по нормам и считает себестоимость."""
    payload: Dict[str, Any] = {
        "cropType": str(crop_type),
        "trays": int(trays),
        "performedBy": PERFORMED_BY,
    }
    if seed_date:
        payload["seedDate"] = str(seed_date)
    if note:
        payload["note"] = str(note)[:1000]
    if product_name:
        payload["productName"] = str(product_name)[:255]
    return await _call("POST", "/admin/grow-batches", payload=payload)


async def harvest(batch_id: str, quantity: float, product_name: str = "") -> Dict[str, Any]:
    """Собрать урожай: приход товара на склад + себестоимость единицы."""
    payload: Dict[str, Any] = {
        "id": str(batch_id),
        "harvestQty": float(quantity),
        "performedBy": PERFORMED_BY,
    }
    if product_name:
        payload["productName"] = str(product_name)[:255]
    return await _call("PATCH", "/admin/grow-batches", payload=payload)


async def write_off_batch(batch_id: str) -> Dict[str, Any]:
    """Списать испорченную партию."""
    return await _call(
        "PATCH",
        "/admin/grow-batches",
        payload={"id": str(batch_id), "action": "write_off", "performedBy": PERFORMED_BY},
    )


async def list_batches(include_harvested: bool = False) -> Dict[str, Any]:
    """Партии. По умолчанию без собранных — витрина фильтрует их сама."""
    params = {"all": "1"} if include_harvested else None
    return await _call("GET", "/admin/grow-batches", params=params)


# ── Сырьё ───────────────────────────────────────────────────────────────


async def list_materials() -> Dict[str, Any]:
    """Позиции сырья с id — нужны, чтобы оприходовать приход по названию."""
    return await _call("GET", "/admin/raw-materials")


async def receive_material(
    material_id: str,
    quantity: float,
    unit_cost: float,
    supplier_id: str = "",
    on_credit: bool = False,
    due_date: str = "",
    note: str = "",
) -> Dict[str, Any]:
    """Оприходовать приход сырья. Витрина пересчитает средневзвешенную цену."""
    payload: Dict[str, Any] = {
        "action": "receipt",
        "materialId": str(material_id),
        "quantity": float(quantity),
        "unitCost": float(unit_cost),
        "onCredit": bool(on_credit),
        "performedBy": PERFORMED_BY,
    }
    if supplier_id:
        payload["supplierId"] = str(supplier_id)
    if due_date:
        payload["dueDate"] = str(due_date)
    if note:
        payload["note"] = str(note)[:500]
    return await _call("POST", "/admin/raw-materials", payload=payload)


# ── Смены ───────────────────────────────────────────────────────────────


async def list_employees() -> Dict[str, Any]:
    """Сотрудники витрины с id — смена ставится по id, а не по имени."""
    return await _call("GET", "/inventory/employees")


async def assign_shift(
    employee_id: str,
    date: str,
    shift_type: str = "work",
    start_time: str = "",
    end_time: str = "",
    note: str = "",
) -> Dict[str, Any]:
    """Поставить смену в график (`shifts`), а не задачу «про смену»."""
    payload: Dict[str, Any] = {
        "employeeId": str(employee_id),
        "date": str(date),
        "type": str(shift_type or "work"),
    }
    if start_time:
        payload["startTime"] = str(start_time)
    if end_time:
        payload["endTime"] = str(end_time)
    if note:
        payload["note"] = str(note)[:500]
    return await _call("POST", "/admin/shifts", payload=payload)


# ── ОТК и опыты ─────────────────────────────────────────────────────────


async def log_quality(
    batch_id: str, status: str = "passed", defect_type: str = "", notes: str = ""
) -> Dict[str, Any]:
    """Запись ОТК в `quality_controls` — ту таблицу, которую читает админка."""
    payload: Dict[str, Any] = {"batchId": str(batch_id), "status": str(status)}
    if defect_type:
        payload["defectType"] = str(defect_type)[:255]
    if notes:
        payload["notes"] = str(notes)[:1000]
    return await _call("POST", "/admin/qa", payload=payload)


async def log_experiment(
    title: str, hypothesis: str = "", batch_id: str = "", status: str = "ongoing"
) -> Dict[str, Any]:
    """Опыт R&D в `experiments`."""
    payload: Dict[str, Any] = {"title": str(title)[:255], "status": str(status)}
    if hypothesis:
        payload["hypothesis"] = str(hypothesis)[:2000]
    if batch_id:
        payload["batchId"] = str(batch_id)
    return await _call("POST", "/admin/experiments", payload=payload)


# ── Маршруты доставки ───────────────────────────────────────────────────


async def create_route(
    driver_id: str, date: str, stops: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Маршрут курьера с точками. stops — [{address, phone, orderId, note}]."""
    prepared = [
        {
            "address": str(stop.get("address") or "")[:500],
            "phone": str(stop.get("phone") or "") or None,
            "orderId": str(stop.get("orderId") or "") or None,
            "orderIndex": index,
            "note": str(stop.get("note") or "") or None,
        }
        for index, stop in enumerate(stops or [])
        if stop.get("address")
    ]
    return await _call(
        "POST",
        "/admin/deliveries",
        payload={"driverId": str(driver_id), "date": str(date), "stops": prepared},
    )
