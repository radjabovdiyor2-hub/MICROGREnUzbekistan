"""
Инструменты HR: состав команды, смены, KPI сотрудника.

Сотрудники офиса живут в `crm_employees` (имя, роль, статус, зарплата).
Одноимённая витринная таблица `employees` — это персонал точки продаж с PIN-кодом
и базовой ставкой; путать их нельзя, HR работает со своей.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import text

from shared.database import get_session_ctx
from shared.tools.registry import Tool, register
from shared.utils import format_price

DEPTS = ["hr"]


async def list_employees(status: Optional[str] = None) -> Dict[str, Any]:
    """Состав команды: кто есть, роль, статус."""
    where = "WHERE LOWER(status) = :st" if status else ""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    f"SELECT id, name, role, status, salary FROM crm_employees {where} "
                    "ORDER BY name"
                ),
                {"st": str(status).lower()} if status else {},
            )
        ).fetchall()
    return {
        "count": len(rows),
        "employees": [
            {
                "id": r[0],
                "name": r[1],
                "role": r[2],
                "status": r[3],
                "salary": float(r[4]) if r[4] is not None else None,
            }
            for r in rows
        ],
    }


async def get_payroll() -> Dict[str, Any]:
    """Фонд оплаты труда по активным сотрудникам."""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT name, role, salary FROM crm_employees "
                    "WHERE LOWER(status) = 'active' AND salary > 0 ORDER BY salary DESC"
                )
            )
        ).fetchall()
    total = sum(float(r[2] or 0) for r in rows)
    return {
        "total": total,
        "total_text": format_price(total),
        "employees": [
            {"name": r[0], "role": r[1], "salary": float(r[2] or 0)} for r in rows
        ],
    }


async def create_shift_task(
    employee: str, when: str, note: str = ""
) -> Dict[str, Any]:
    """Поставить сотруднику смену/поручение задачей отдела HR."""
    async with get_session_ctx() as session:
        task_id = (
            await session.execute(
                text(
                    "INSERT INTO tasks (title, assignee, department, status, priority, "
                    "description, deadline, created_at) "
                    "VALUES (:t, :a, 'hr', 'todo', 'medium', :descr, "
                    "CAST(NULLIF(:dl, '') AS DATE), NOW()) RETURNING id"
                ),
                {
                    "t": f"Смена: {employee} — {when}"[:255],
                    "a": employee,
                    "descr": note,
                    "dl": when if _looks_like_date(when) else "",
                },
            )
        ).scalar()
        await session.commit()
    return {"ok": True, "task_id": task_id, "employee": employee, "when": when}


def _looks_like_date(value: str) -> bool:
    raw = str(value or "").strip()
    return len(raw) == 10 and raw[4] == "-" and raw[7] == "-"


async def log_employee_kpi(
    employee: str, metric: str, value: float, comment: str = ""
) -> Dict[str, Any]:
    """Зафиксировать показатель сотрудника."""
    async with get_session_ctx() as session:
        await session.execute(
            text(
                "INSERT INTO tasks (title, assignee, department, status, priority, "
                "description, created_at) "
                "VALUES (:t, :a, 'hr', 'done', 'low', :descr, NOW())"
            ),
            {
                "t": f"KPI {employee}: {metric} = {value}"[:255],
                "a": employee,
                "descr": comment or f"{metric}={value}",
            },
        )
        await session.commit()
    return {"ok": True, "employee": employee, "metric": metric, "value": value}


register(
    Tool(
        name="list_employees",
        description="Состав команды: имена, роли, статусы.",
        run=list_employees,
        departments=DEPTS,
        params={"status": {"type": "string", "description": "Фильтр по статусу, напр. active"}},
    )
)

register(
    Tool(
        name="get_payroll",
        description="Фонд оплаты труда: кто сколько получает, итог по активным.",
        run=get_payroll,
        departments=DEPTS,
    )
)

register(
    Tool(
        name="create_shift_task",
        # Раньше описание гласило «смену или поручение», и модель выбирала
        # этот инструмент для назначения смены — а он пишет задачу в `tasks`,
        # и в графике смен она не появлялась. График ставит assign_shift.
        description=(
            "Поставить сотруднику ПОРУЧЕНИЕ задачей отдела HR. "
            "Это не график работы: чтобы поставить смену в график, "
            "есть assign_shift."
        ),
        run=create_shift_task,
        departments=DEPTS,
        params={
            "employee": {"type": "string", "description": "Имя сотрудника"},
            "when": {"type": "string", "description": "Дата YYYY-MM-DD или описание времени"},
            "note": {"type": "string", "description": "Что нужно сделать"},
        },
        required=["employee", "when"],
    )
)

register(
    Tool(
        name="log_employee_kpi",
        description="Зафиксировать показатель сотрудника (выработка, качество, продажи).",
        run=log_employee_kpi,
        departments=DEPTS,
        params={
            "employee": {"type": "string", "description": "Имя сотрудника"},
            "metric": {"type": "string", "description": "Название показателя"},
            "value": {"type": "number", "description": "Значение"},
            "comment": {"type": "string", "description": "Комментарий"},
        },
        required=["employee", "metric", "value"],
        risky=True,
        confirm=lambda a: (
            f"Записать KPI сотруднику {a.get('employee')}: "
            f"{a.get('metric')} = {a.get('value')}"
        ),
    )
)
