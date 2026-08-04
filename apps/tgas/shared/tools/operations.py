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
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import text

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
                    "SELECT crop_type, trays, seed_date, dark_days, light_days, shelf_days, "
                    "       status, seed_cost, supplies_cost, planned_yield, "
                    "       CURRENT_DATE - seed_date AS elapsed "
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


register(
    Tool(
        name="get_inventory",
        description=(
            "Остатки СЫРЬЯ на складе (семена, субстрат, лотки, упаковка): "
            "сколько осталось, средняя себестоимость, что ниже минимума. "
            "Это не готовый товар — для него get_inventory_status."
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
