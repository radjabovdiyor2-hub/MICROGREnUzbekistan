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
    """Остатки расходников: семена, субстрат, упаковка."""
    where = "WHERE LOWER(category) = :cat" if category else ""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    f"SELECT id, item_name, category, quantity, unit, min_stock "
                    f"FROM inventory {where} ORDER BY quantity ASC"
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
                "below_min": float(r[3] or 0) < float(r[5] or 0),
            }
            for r in rows
        ],
    }


async def write_off_inventory(
    item_name: str, quantity: float, reason: str = ""
) -> Dict[str, Any]:
    """Списать расходник со склада по названию позиции."""
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
                    "SELECT id, item_name, quantity, unit FROM inventory "
                    "WHERE item_name ILIKE :n ORDER BY id LIMIT 1"
                ),
                {"n": f"%{item_name}%"},
            )
        ).fetchone()
        if not row:
            return {
                "ok": False,
                "message": f"Позиции «{item_name}» на складе нет — списывать нечего.",
            }

        available = float(row[2] or 0)
        if available < amount:
            # Уходить в минус нельзя: остаток — основание для закупки, и
            # отрицательное значение сделало бы её расчёт бессмысленным.
            return {
                "ok": False,
                "message": (
                    f"На складе только {available:g} {row[3]} «{row[1]}», "
                    f"а списать просят {amount:g}. Не списываю."
                ),
            }

        await session.execute(
            text(
                "UPDATE inventory SET quantity = quantity - :q, updated_at = NOW() "
                "WHERE id = :iid"
            ),
            {"q": amount, "iid": row[0]},
        )
        await session.commit()

    return {
        "ok": True,
        "item": row[1],
        "written_off": amount,
        "unit": row[3],
        "left": available - amount,
        "reason": reason,
        "message": f"Списано {amount:g} {row[3]} «{row[1]}», остаток {available - amount:g}.",
    }


register(
    Tool(
        name="get_inventory",
        description=(
            "Остатки расходников на складе (семена, субстрат, упаковка): "
            "что заканчивается, что ниже минимума."
        ),
        run=get_inventory,
        departments=DEPTS,
        params={"category": {"type": "string", "description": "Категория, необязательно"}},
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
