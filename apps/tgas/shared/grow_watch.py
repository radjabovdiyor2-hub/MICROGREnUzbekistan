"""
🌱 GROW WATCH — что созрело, что вот-вот пропадёт
==================================================
Партия микрозелени живёт считанные дни: у редиса это 3 дня в темноте, 4 на
свету и 7 дней хранения. Пропустил окно — партия списывается, а убыток теперь
считается по настоящей себестоимости (семена + расходники), то есть виден в
деньгах.

До этого модуля напоминаний не было ни одного. Фазу партии умел считать
только экран «Посадки» в админке, то есть увидеть её можно было, лишь открыв
вкладку. Ни один планировщик посадок не касался.

Здесь — один расчёт на всех: утренняя сводка Стёпана, срочное предупреждение
за день до конца хранения и сигнал в колокольчик админки берут фазы отсюда.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from sqlalchemy import text

from shared.database import get_session_ctx
from shared.utils import format_price

logger = logging.getLogger(__name__)

# За сколько дней до конца хранения бить тревогу отдельно от общей сводки.
URGENT_DAYS_LEFT = 1


async def scan() -> Dict[str, List[Dict[str, Any]]]:
    """
    Разложить незакрытые партии по состояниям.

    Фаза вычисляется из дат, а не хранится: в базе лежит только необратимое
    `harvested`. Считаем в SQL — так же, как это делает экран «Посадки»,
    чтобы бот и админка не разошлись в оценке одной и той же партии.
    """
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT b.id, b.crop_type, b.trays, b.seed_date, "
                    "       b.dark_days, b.light_days, b.shelf_days, "
                    "       COALESCE(b.seed_cost, 0) + COALESCE(b.supplies_cost, 0) AS cost, "
                    "       b.planned_yield, b.product_name, "
                    "       (CURRENT_DATE - b.seed_date) AS elapsed, "
                    "       COALESCE(n.name_ru, b.crop_type) AS crop_name, "
                    # Единица посадки: лотки у микрозелени, стаканчики у салата.
                    # Без неё сводка описывала партию салата лотками, которых
                    # в ней нет вовсе.
                    "       COALESCE(n.planting_unit, 'tray') AS planting_unit "
                    "FROM grow_batches b "
                    "LEFT JOIN crop_norms n ON n.crop_type = b.crop_type "
                    "WHERE b.status <> 'harvested' "
                    "ORDER BY b.seed_date"
                )
            )
        ).fetchall()

    ready: List[Dict[str, Any]] = []
    urgent: List[Dict[str, Any]] = []
    expired: List[Dict[str, Any]] = []
    tomorrow: List[Dict[str, Any]] = []

    for r in rows:
        elapsed = int(r[10] or 0)
        dark, light, shelf = int(r[4] or 0), int(r[5] or 0), int(r[6] or 0)
        light_end = dark + light
        shelf_end = light_end + shelf

        batch = {
            "id": r[0],
            "crop": r[11],
            "trays": r[2],
            "units": f"{r[2]} {'стаканч.' if r[12] == 'cup' else 'лотк.'}",
            "seed_date": r[3],
            "cost": float(r[7] or 0),
            "planned_yield": float(r[8] or 0),
            "product_name": r[9],
            "days_left": shelf_end - elapsed,
        }

        if elapsed >= shelf_end:
            expired.append(batch)
        elif elapsed >= light_end:
            ready.append(batch)
            # Последний день — отдельная тревога, не в общей сводке.
            if batch["days_left"] <= URGENT_DAYS_LEFT:
                urgent.append(batch)
        elif elapsed == light_end - 1:
            tomorrow.append(batch)

    return {"ready": ready, "urgent": urgent, "expired": expired, "tomorrow": tomorrow}


def morning_text(state: Dict[str, List[Dict[str, Any]]]) -> str | None:
    """Утренняя сводка. None — писать не о чем, и молчание тут уместнее."""
    ready, expired, tomorrow = state["ready"], state["expired"], state["tomorrow"]
    if not (ready or expired or tomorrow):
        return None

    lines = ["🌱 <b>Посадки</b>\n"]

    if ready:
        lines.append(f"✅ <b>Готово к продаже ({len(ready)}):</b>")
        for b in ready:
            tail = (
                f", осталось {b['days_left']} дн."
                if b["days_left"] > 1
                else " — <b>последний день</b>"
            )
            lines.append(f"  • {b['crop']}, {b['units']}{tail}")
        lines.append("")

    if tomorrow:
        lines.append(f"⏳ <b>Дозреет завтра ({len(tomorrow)}):</b>")
        for b in tomorrow:
            lines.append(f"  • {b['crop']}, {b['units']}")
        lines.append("")

    if expired:
        loss = sum(b["cost"] for b in expired)
        lines.append(f"❌ <b>Просрочено ({len(expired)}):</b>")
        for b in expired:
            lines.append(f"  • {b['crop']}, {b['units']} — {format_price(b['cost'])}")
        if loss > 0:
            lines.append(f"  Убыток: <b>{format_price(loss)}</b>")
        lines.append("\nСпишите их в админке — иначе они так и висят в остатках.")

    return "\n".join(lines)


def urgent_text(urgent: List[Dict[str, Any]]) -> str | None:
    """Срочное: сегодня последний день продажи."""
    if not urgent:
        return None
    lines = ["🔴 <b>Продать сегодня</b>\n"]
    for b in urgent:
        lines.append(f"  • {b['crop']}, {b['units']} — завтра списывать")
    total = sum(b["cost"] for b in urgent)
    if total > 0:
        lines.append(f"\nВложено: {format_price(total)}. Завтра это станет убытком.")
    return "\n".join(lines)
