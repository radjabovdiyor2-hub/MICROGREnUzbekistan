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
    """Ведомость зарплаты: кому сколько начислено и сколько ещё отдать.

    ЧИТАЕМ ВИТРИНУ, А НЕ `crm_employees`. Здесь стоял
    `SELECT salary FROM crm_employees` — у этой колонки нет ни одного
    пишущего места во всём репозитории, поэтому инструмент годами отвечал
    «фонд ноль» и владельцу, и модели.

    Зарплата живёт на витрине: оклад, ставка за смену, выплаты и расчёт.
    Второй источник правды о деньгах человека и был причиной поломки.
    """
    from shared.storefront_payroll import get_payroll as fetch

    payroll = await fetch()
    if payroll is None:
        # Честный отказ, а не ноль: «фонд ноль» модель перескажет владельцу
        # как факт, и он примет решение по несуществующему числу.
        return {
            "found": False,
            "summary": "Ведомость недоступна — витрина не ответила.",
        }

    rows = payroll.get("rows") or []
    accrued = float(payroll.get("totalAccrued") or 0)
    remaining = float(payroll.get("totalRemaining") or 0)
    return {
        "found": True,
        "period": payroll.get("period"),
        "payday": payroll.get("payday"),
        "total_accrued": accrued,
        "total_accrued_text": format_price(accrued),
        "total_remaining": remaining,
        "total_remaining_text": format_price(remaining),
        "employees": [
            {
                "name": r.get("name"),
                "accrued": r.get("accrued"),
                "paid": r.get("paidTotal"),
                "remaining": r.get("remaining"),
            }
            for r in rows
        ],
    }


async def create_shift_task(
    employee: str, when: str, note: str = ""
) -> Dict[str, Any]:
    """Поставить сотруднику смену/поручение задачей отдела HR.

    Смену выполняет человек, поэтому событие отделу не шлём — иначе HR-бот
    возьмёт задачу «поставить Азизу смену», ничего с ней сделать не сможет и
    вернёт её же. Срок нужен обязательно: без `deadline` задача не попадает
    в дайджест просрочки никогда, а «завтра» словом (а не датой `YYYY-MM-DD`)
    раньше давало ровно такую задачу-невидимку.
    """
    from shared import tasks_repo

    deadline_days = _days_until(when) if _looks_like_date(when) else 1
    created = await tasks_repo.create(
        title=f"Смена: {employee} — {when}"[:255],
        department="hr",
        description=note or f"Смена сотрудника {employee}: {when}",
        priority="medium",
        assignee=employee,
        deadline_days=deadline_days,
        notify_department=False,
    )
    return {
        "ok": True,
        "task_id": created.get("task_id"),
        "employee": employee,
        "when": when,
    }


def _days_until(date_str: str) -> int:
    """Сколько дней от сегодня до «YYYY-MM-DD». Прошедшая дата — сегодня (0)."""
    from datetime import date

    try:
        year, month, day = (int(part) for part in date_str.split("-"))
        return max(0, (date(year, month, day) - date.today()).days)
    except (ValueError, TypeError):
        return 1


def _looks_like_date(value: str) -> bool:
    raw = str(value or "").strip()
    return len(raw) == 10 and raw[4] == "-" and raw[7] == "-"


async def log_employee_kpi(
    employee: str, metric: str, value: float, comment: str = ""
) -> Dict[str, Any]:
    """Зафиксировать показатель сотрудника в журнале KPI.

    В `employee_kpi`, а не строкой в `tasks`. Задача со статусом `done` не
    журнал: её никто не искал, прочитать показатель было нечем, а список
    задач она замусоривала. Тот же антипаттерн уже убрали у ОТК и опытов.
    """
    async with get_session_ctx() as session:
        record_id = (
            await session.execute(
                text(
                    "INSERT INTO employee_kpi (employee, metric, value, comment, created_at) "
                    "VALUES (:e, :m, :v, :c, NOW()) RETURNING id"
                ),
                {
                    "e": str(employee)[:255],
                    "m": str(metric)[:50],
                    "v": float(value),
                    "c": comment or None,
                },
            )
        ).scalar()
        await session.commit()
    return {
        "ok": True,
        "record_id": record_id,
        "employee": employee,
        "metric": metric,
        "value": value,
    }


async def get_employee_kpi(
    employee: str = "", metric: str = "", days: int = 30
) -> Dict[str, Any]:
    """Показатели сотрудников за период — то, что записал log_employee_kpi."""
    window = max(1, min(int(days or 30), 365))
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT employee, metric, value, comment, created_at "
                    "FROM employee_kpi "
                    "WHERE created_at > NOW() - (INTERVAL '1 day' * :days) "
                    "AND (:emp = '' OR LOWER(employee) LIKE :emp_like) "
                    "AND (:met = '' OR LOWER(metric) = :met) "
                    "ORDER BY created_at DESC LIMIT 50"
                ),
                {
                    "days": window,
                    "emp": str(employee or "").lower(),
                    "emp_like": f"%{str(employee or '').lower()}%",
                    "met": str(metric or "").lower(),
                },
            )
        ).fetchall()
    return {
        "count": len(rows),
        "days": window,
        "records": [
            {
                "employee": r[0],
                "metric": r[1],
                "value": float(r[2] or 0),
                "comment": r[3],
                "at": str(r[4]),
            }
            for r in rows
        ],
    }


register(
    Tool(
        name="list_employees",
        admin_tab="employees",
        description="Состав команды: имена, роли, статусы.",
        run=list_employees,
        departments=DEPTS,
        params={"status": {"type": "string", "description": "Фильтр по статусу, напр. active"}},
    )
)

register(
    Tool(
        name="get_payroll",
        # Экран зарплаты, а не сотрудников: раньше кнопка вела на список
        # персонала, который эту ведомость не показывает вовсе.
        admin_tab="payroll",
        description="Ведомость зарплаты: начислено, выдано, сколько найти к выплате.",
        run=get_payroll,
        departments=DEPTS,
    )
)

register(
    Tool(
        name="create_shift_task",
        admin_tab="tasks",
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
        admin_tab="employees",
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
        # Не risky: это запись во внутренний журнал показателей — обратимая,
        # никого наружу не касается и денег не двигает. Соседние журналы
        # (log_quality_check, log_experiment) подтверждения тоже не просят.
    )
)

register(
    Tool(
        name="get_employee_kpi",
        admin_tab="employees",
        description=(
            "Показатели сотрудников за период: что записывали через "
            "log_employee_kpi. Без него журнал KPI был бы только на запись — "
            "записать можно, а прочитать нечем."
        ),
        run=get_employee_kpi,
        departments=DEPTS,
        params={
            "employee": {"type": "string", "description": "Имя сотрудника, пусто — все"},
            "metric": {"type": "string", "description": "Показатель, пусто — все"},
            "days": {"type": "integer", "description": "За сколько дней, по умолчанию 30"},
        },
    )
)
