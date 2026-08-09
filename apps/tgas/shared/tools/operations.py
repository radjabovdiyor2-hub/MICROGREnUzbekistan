"""
Инструменты производства и склада — отделы без своего бота (их ведёт Стёпан).

Заводятся отдельно от `common.py`, потому что относятся к отделам `pm`,
`production`, `logistics`, у которых нет собственного бота: реестр отдаёт
руководителю все инструменты, и эти попадают к нему вместе с остальными.

ЗАЧЕМ `write_off_inventory` СУЩЕСТВУЕТ

Списание расходников было вшито в обработчик задач Стёпана подстрокой:

    if "посад" in title.lower() or "посев" in title.lower():
        UPDATE inventory SET quantity = quantity - 1 WHERE category = 'seeds'
        UPDATE inventory SET quantity = quantity - 5 WHERE category = 'substrate'

Числа одинаковы для любой посадки — что для одного лотка, что для сотни, — и
списывались с первой попавшейся строки категории, без указания позиции. При
этом руководителю сообщалось «автоматически списано: 1 кг семян, 5 субстратов»,
то есть выдуманная цифра подавалась как факт. Теперь это обычный инструмент с
явными аргументами: модель обязана назвать позицию и количество, а рискованная
запись проходит через подтверждение.

ПОЧЕМУ ПОСАДКА, УРОЖАЙ И ПРИХОД ИДУТ ЧЕРЕЗ HTTP, А СПИСАНИЕ СЫРЬЯ — SQL

`write_off_inventory` — простое вычитание с проверкой остатка в одном UPDATE,
и переносить его некуда. А посадка списывает сырьё по нормам культуры и
складывает себестоимость партии; приход пересчитывает средневзвешенную цену;
сбор урожая приходует товар и раскидывает себестоимость на единицу. Эта
арифметика живёт в `apps/web/src/lib/production/`, и вторая её копия на Python
неизбежно разойдётся с первой — так уже было с каталогом и заказами. Поэтому
всё, что сложнее вычитания, идёт через `shared/production_repo.py`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import text

from shared import production_repo
from shared.database import get_session_ctx
from shared.tools.registry import Tool, register

DEPTS = ["pm", "production", "logistics"]


async def get_inventory(category: Optional[str] = None) -> Dict[str, Any]:
    """Остатки сырья: семена, субстрат, лотки, упаковка."""
    where = "AND LOWER(kind) = :cat" if category else ""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT id, name, kind, stock, unit, min_stock, avg_cost, crop_type "
                    f"FROM raw_materials WHERE is_active = true {where} "
                    "ORDER BY stock ASC"
                ),
                {"cat": str(category).lower()} if category else {},
            )
        ).fetchall()
    return {
        "count": len(rows),
        "items": [
            {
                "id": r[0],
                "name": r[1],
                "category": r[2],
                "quantity": float(r[3] or 0),
                "unit": r[4],
                "min_stock": float(r[5] or 0),
                "avg_cost": float(r[6] or 0),
                "crop_type": r[7],
                "below_min": float(r[5] or 0) > 0 and float(r[3] or 0) <= float(r[5] or 0),
            }
            for r in rows
        ],
    }


async def write_off_inventory(
    item_name: str, quantity: float, reason: str = ""
) -> Dict[str, Any]:
    """Списать сырьё со склада по названию позиции."""
    try:
        amount = float(quantity)
    except (TypeError, ValueError):
        return {"ok": False, "message": "Количество не распознано."}
    if amount <= 0:
        return {"ok": False, "message": "Количество должно быть больше нуля."}

    async with get_session_ctx() as session:
        row = (
            await session.execute(
                text(
                    "SELECT id, name, stock, unit, avg_cost FROM raw_materials "
                    "WHERE is_active = true AND name ILIKE :n ORDER BY id LIMIT 1"
                ),
                {"n": f"%{item_name}%"},
            )
        ).fetchone()
        if not row:
            return {
                "ok": False,
                "message": f"Позиции «{item_name}» на складе сырья нет — списывать нечего.",
            }

        available = float(row[2] or 0)
        unit_cost = float(row[4] or 0)

        # Условное списание: проверка и запись одной операцией. Раньше
        # «хватает ли остатка» проверялось отдельным SELECT без блокировки,
        # и два одновременных списания оба его проходили, уводя остаток в минус.
        written = (
            await session.execute(
                text(
                    "UPDATE raw_materials SET stock = stock - :q, updated_at = NOW() "
                    "WHERE id = :iid AND stock >= :q RETURNING stock"
                ),
                {"q": amount, "iid": row[0]},
            )
        ).scalar()
        if written is None:
            # Уходить в минус нельзя: остаток — основание для закупки, и
            # отрицательное значение сделало бы её расчёт бессмысленным.
            return {
                "ok": False,
                "message": (
                    f"На складе только {available:g} {row[3]} «{row[1]}», "
                    f"а списать просят {amount:g}. Не списываю."
                ),
            }

        # Журнал сырья — остаток меняется только вместе с записью в него.
        await session.execute(
            text(
                "INSERT INTO raw_material_movements "
                "(id, material_id, type, quantity, unit_cost, total_cost, reason, performed_by, created_at) "
                "VALUES (gen_random_uuid()::text, :mid, 'WRITE_OFF', :q, :uc, :tc, :r, 'office_bot', NOW())"
            ),
            {
                "mid": row[0],
                "q": -amount,
                "uc": unit_cost,
                "tc": unit_cost * amount,
                "r": reason or "Списание через офис",
            },
        )
        await session.commit()

    left = float(written)
    return {
        "ok": True,
        "item": row[1],
        "written_off": amount,
        "unit": row[3],
        "left": left,
        "reason": reason,
        "message": f"Списано {amount:g} {row[3]} «{row[1]}», остаток {left:g}.",
    }


async def get_grow_batches(only_active: bool = True) -> Dict[str, Any]:
    """Посадки: что растёт, что готово, что просрочено."""
    where = "WHERE status <> 'harvested'" if only_active else ""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    # id обязателен: без него модель не может назвать партию
                    # для сбора или списания — инструменты работают по id.
                    "SELECT crop_type, trays, seed_date, dark_days, light_days, shelf_days, "
                    "       status, seed_cost, supplies_cost, planned_yield, "
                    "       CURRENT_DATE - seed_date AS elapsed, id "
                    f"FROM grow_batches {where} ORDER BY seed_date DESC LIMIT 100"
                )
            )
        ).fetchall()

    batches = []
    for r in rows:
        elapsed = int(r[10] or 0)
        dark, light, shelf = int(r[3] or 0), int(r[4] or 0), int(r[5] or 0)
        if r[6] == "harvested":
            phase = "собрано"
        elif elapsed < dark:
            phase = "тёмная фаза"
        elif elapsed < dark + light:
            phase = "на свету"
        elif elapsed < dark + light + shelf:
            phase = "готово к продаже"
        else:
            phase = "ПРОСРОЧЕНО"
        batches.append(
            {
                "id": r[11],
                "crop": r[0],
                "trays": r[1],
                "seed_date": str(r[2]),
                "days": elapsed,
                "phase": phase,
                "cost": float(r[7] or 0) + float(r[8] or 0),
                "planned_yield": float(r[9] or 0),
            }
        )

    return {
        "count": len(batches),
        "ready": sum(1 for b in batches if b["phase"] == "готово к продаже"),
        "expired": sum(1 for b in batches if b["phase"] == "ПРОСРОЧЕНО"),
        "batches": batches,
    }


# ── Производственный цикл: пишем через витрину ──────────────────────────
#
# Здесь нет ни одного INSERT/UPDATE. Посадка, сбор и приход — операции, а не
# записи строк: за каждой стоит списание по нормам, себестоимость и движения
# сырья. Считает их витрина, офис только просит (см. shared/production_repo.py).


def _fail(result: Dict[str, Any], what: str) -> Dict[str, Any]:
    """Отказ витрины — отказ операции. Модель обязана сказать это вслух."""
    return {
        "ok": False,
        "error": result.get("error", "неизвестная ошибка"),
        "note": f"{what} НЕ выполнено. Не сообщай, что получилось.",
    }


async def plant_batch(
    crop_type: str, trays: int, seed_date: str = "", note: str = ""
) -> Dict[str, Any]:
    """Посадить партию: списать сырьё по нормам и посчитать себестоимость."""
    trays = max(1, int(trays or 1))

    # Сначала спрашиваем расход. Витрина откажет и сама, но тогда владелец
    # увидит «не смог» вместо «не хватает 300 г семян гороха, есть 120».
    preview = await production_repo.plant_requirements(crop_type, trays)
    if not preview.get("ok"):
        details = preview.get("details") or {}
        return {
            "ok": False,
            "error": preview.get("error", ""),
            "needs": details.get("needs", []),
            "note": "Посадка НЕ выполнена — не хватает данных или сырья.",
        }

    data = preview.get("data") or {}
    short = [
        {
            "материал": n.get("label"),
            "нужно": n.get("required"),
            "хватает": n.get("enough"),
        }
        for n in (data.get("needs") or [])
    ]
    if any(n.get("хватает") is False for n in short):
        return {
            "ok": False,
            "error": "На складе не хватает сырья.",
            "needs": short,
            "note": "Посадка НЕ выполнена. Назови, чего и сколько не хватает.",
        }

    planted = await production_repo.plant(crop_type, trays, seed_date, note)
    if not planted.get("ok"):
        return _fail(planted, "Посадка")

    batch = (planted.get("data") or {}).get("batch") or {}
    return {
        "ok": True,
        "batch_id": batch.get("id"),
        "crop": crop_type,
        "trays": trays,
        "consumed": short,
        "estimated_cost": data.get("estimatedCost"),
        "summary": f"Посажено {trays} лотков «{crop_type}».",
    }


async def harvest_batch(
    batch_id: str, quantity: float, product_name: str = ""
) -> Dict[str, Any]:
    """Собрать урожай: оприходовать товар и посчитать себестоимость единицы."""
    if float(quantity or 0) <= 0:
        return {"ok": False, "error": "Количество урожая должно быть больше нуля."}

    result = await production_repo.harvest(batch_id, float(quantity), product_name)
    if not result.get("ok"):
        return _fail(result, "Сбор урожая")

    batch = (result.get("data") or {}).get("batch") or {}
    return {
        "ok": True,
        "batch_id": batch_id,
        "harvest_qty": batch.get("harvestQty", quantity),
        "unit_cost": batch.get("costPrice"),
        "summary": f"Партия {batch_id}: собрано {quantity}, товар оприходован.",
    }


async def write_off_batch(batch_id: str, reason: str = "") -> Dict[str, Any]:
    """Списать испорченную партию — зафиксировать реальный убыток."""
    result = await production_repo.write_off_batch(batch_id)
    if not result.get("ok"):
        return _fail(result, "Списание партии")
    return {
        "ok": True,
        "batch_id": batch_id,
        "reason": reason,
        "summary": f"Партия {batch_id} списана.",
    }


async def receive_material(
    material_id: str,
    quantity: float,
    unit_cost: float,
    supplier_id: str = "",
    on_credit: bool = False,
    due_date: str = "",
) -> Dict[str, Any]:
    """Оприходовать закупку сырья: приход на склад и пересчёт себестоимости."""
    if float(quantity or 0) <= 0:
        return {"ok": False, "error": "Количество прихода должно быть больше нуля."}
    if float(unit_cost or 0) < 0:
        return {"ok": False, "error": "Цена закупки не может быть отрицательной."}

    result = await production_repo.receive_material(
        material_id, float(quantity), float(unit_cost), supplier_id, on_credit, due_date
    )
    if not result.get("ok"):
        return _fail(result, "Приход сырья")

    receipt = (result.get("data") or {}).get("receipt") or {}
    return {
        "ok": True,
        "material_id": material_id,
        "quantity": quantity,
        "avg_cost_after": receipt.get("avgCostAfter"),
        "summary": f"Приход оприходован: {quantity} по {unit_cost} за единицу.",
    }


async def assign_shift(
    employee_id: str,
    date: str,
    shift_type: str = "work",
    start_time: str = "",
    end_time: str = "",
    note: str = "",
) -> Dict[str, Any]:
    """Поставить смену в график — строкой в `shifts`, а не задачей о смене."""
    result = await production_repo.assign_shift(
        employee_id, date, shift_type, start_time, end_time, note
    )
    if not result.get("ok"):
        return _fail(result, "Назначение смены")
    return {
        "ok": True,
        "employee_id": employee_id,
        "date": date,
        "type": shift_type,
        "summary": f"Смена на {date} поставлена ({shift_type}).",
    }


async def create_delivery_route(
    driver_id: str, date: str, stops: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Собрать маршрут курьера на дату из списка адресов."""
    prepared = [s for s in (stops or []) if s.get("address")]
    if not prepared:
        return {"ok": False, "error": "Нужен хотя бы один адрес доставки."}

    result = await production_repo.create_route(driver_id, date, prepared)
    if not result.get("ok"):
        return _fail(result, "Создание маршрута")

    route = result.get("data") or {}
    return {
        "ok": True,
        "route_id": route.get("id"),
        "stops": len(prepared),
        "summary": f"Маршрут на {date}: {len(prepared)} точек.",
    }


register(
    Tool(
        name="get_inventory",
        description=(
            "Остатки СЫРЬЯ на складе (семена, субстрат, лотки, упаковка): "
            "сколько осталось, средняя себестоимость, что ниже минимума. "
            "Это не готовый товар — остатки товара смотри в get_price_list."
        ),
        run=get_inventory,
        departments=DEPTS,
        params={
            "category": {
                "type": "string",
                "description": "Тип: SEED, SUBSTRATE, TRAY, PACKAGING. Пусто — всё.",
            }
        },
    )
)

register(
    Tool(
        name="get_grow_batches",
        description=(
            "Посадки: что растёт, в какой фазе, что готово к продаже и что "
            "просрочено. Вызывай на «что на выращивании», «что созрело», "
            "«сколько лотков посажено»."
        ),
        run=get_grow_batches,
        departments=DEPTS,
        params={
            "only_active": {
                "type": "boolean",
                "description": "Только несобранные партии (по умолчанию да).",
            }
        },
    )
)

register(
    Tool(
        name="write_off_inventory",
        description=(
            "Списать расходник со склада при посеве, сборке или упаковке. "
            "Обязательно назови КОНКРЕТНУЮ позицию и КОЛИЧЕСТВО — по умолчанию "
            "ничего не списывается. Не знаешь количества — сначала спроси."
        ),
        run=write_off_inventory,
        departments=DEPTS,
        params={
            "item_name": {"type": "string", "description": "Название позиции на складе"},
            "quantity": {"type": "number", "description": "Сколько списать"},
            "reason": {"type": "string", "description": "Основание: посев, сборка, брак"},
        },
        required=["item_name", "quantity"],
        risky=True,
        confirm=lambda a: (
            f"Списать со склада {a.get('quantity')} × «{a.get('item_name')}»"
            + (f" ({a.get('reason')})" if a.get("reason") else "")
        ),
    )
)

# ── Производственный цикл ───────────────────────────────────────────────

register(
    Tool(
        name="plant_batch",
        description=(
            "ПОСАДИТЬ партию: завести посадку, списать семена и субстрат по "
            "норме культуры и посчитать себестоимость. Вызывай на «посади», "
            "«посей», «поставь N лотков». Сначала сам проверит, хватает ли "
            "сырья, и откажется сажать в минус."
        ),
        run=plant_batch,
        departments=DEPTS,
        params={
            "crop_type": {"type": "string", "description": "Культура: redis, gorox, podsolnuh…"},
            "trays": {"type": "integer", "description": "Сколько лотков"},
            "seed_date": {"type": "string", "description": "Дата посева YYYY-MM-DD, пусто — сегодня"},
            "note": {"type": "string", "description": "Заметка к партии"},
        },
        required=["crop_type", "trays"],
        risky=True,
        confirm=lambda a: (
            f"Посадить {a.get('trays', '?')} лотков «{a.get('crop_type', '?')}» "
            f"со списанием семян и субстрата по норме"
        ),
    )
)

register(
    Tool(
        name="harvest_batch",
        description=(
            "СОБРАТЬ УРОЖАЙ с партии: оприходовать товар на склад и посчитать "
            "себестоимость единицы. Номер партии бери из get_grow_batches (поле id). "
            "Вызывай на «собрали», «срезали», «сняли урожай»."
        ),
        run=harvest_batch,
        departments=DEPTS,
        params={
            "batch_id": {"type": "string", "description": "id партии из get_grow_batches"},
            "quantity": {"type": "number", "description": "Сколько собрано (кг или шт)"},
            "product_name": {"type": "string", "description": "Под каким товаром приходовать"},
        },
        required=["batch_id", "quantity"],
        risky=True,
        confirm=lambda a: (
            f"Оприходовать урожай {a.get('quantity', '?')} с партии {a.get('batch_id', '?')}"
        ),
    )
)

register(
    Tool(
        name="write_off_batch",
        description=(
            "СПИСАТЬ партию целиком — она пропала, переросла или заражена. "
            "Фиксирует убыток. Не путай с write_off_inventory: тот списывает "
            "сырьё со склада, этот — выращенную партию."
        ),
        run=write_off_batch,
        departments=DEPTS,
        params={
            "batch_id": {"type": "string", "description": "id партии из get_grow_batches"},
            "reason": {"type": "string", "description": "Почему списываем"},
        },
        required=["batch_id"],
        risky=True,
        confirm=lambda a: (
            f"Списать партию {a.get('batch_id', '?')} целиком"
            + (f": {a.get('reason')}" if a.get("reason") else "")
        ),
    )
)

register(
    Tool(
        name="receive_material",
        description=(
            "ОПРИХОДОВАТЬ ЗАКУПКУ сырья: приход на склад с пересчётом "
            "средневзвешенной себестоимости. Вызывай на «привезли», «закупили», "
            "«пришли семена». id сырья бери из get_inventory."
        ),
        run=receive_material,
        departments=DEPTS,
        params={
            "material_id": {"type": "string", "description": "id позиции сырья из get_inventory"},
            "quantity": {"type": "number", "description": "Сколько пришло"},
            "unit_cost": {"type": "number", "description": "Цена закупки за единицу"},
            "supplier_id": {"type": "string", "description": "id поставщика, необязательно"},
            "on_credit": {"type": "boolean", "description": "Взято в долг"},
            "due_date": {"type": "string", "description": "Когда платить, YYYY-MM-DD"},
        },
        required=["material_id", "quantity", "unit_cost"],
        risky=True,
        confirm=lambda a: (
            f"Оприходовать {a.get('quantity', '?')} сырья по {a.get('unit_cost', '?')} за единицу"
            + (" в долг" if a.get("on_credit") else "")
        ),
    )
)

register(
    Tool(
        name="assign_shift",
        description=(
            "Поставить сотруднику СМЕНУ в график. Это график работы, а не "
            "поручение — для поручения есть create_task. Тип: work, sick, vacation."
        ),
        run=assign_shift,
        departments=DEPTS,
        params={
            "employee_id": {"type": "string", "description": "id сотрудника"},
            "date": {"type": "string", "description": "Дата смены YYYY-MM-DD"},
            "shift_type": {
                "type": "string",
                "enum": ["work", "sick", "vacation"],
                "description": "Тип смены",
            },
            "start_time": {"type": "string", "description": "Начало, ISO-время"},
            "end_time": {"type": "string", "description": "Конец, ISO-время"},
            "note": {"type": "string", "description": "Примечание"},
        },
        required=["employee_id", "date"],
    )
)

register(
    Tool(
        name="create_delivery_route",
        description=(
            "Собрать МАРШРУТ курьера на дату из списка адресов. "
            "stops — массив объектов {address, phone, orderId, note}."
        ),
        run=create_delivery_route,
        departments=DEPTS,
        params={
            "driver_id": {"type": "string", "description": "id курьера-сотрудника"},
            "date": {"type": "string", "description": "Дата маршрута YYYY-MM-DD"},
            "stops": {
                "type": "array",
                "items": {"type": "object"},
                "description": "Точки: [{address, phone, orderId, note}]",
            },
        },
        required=["driver_id", "date", "stops"],
    )
)
