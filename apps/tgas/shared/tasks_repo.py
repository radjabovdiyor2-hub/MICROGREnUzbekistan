"""
📋 TASKS REPO — единственная дверь офиса к таблице `tasks`
==========================================================

ЗАЧЕМ ЭТОТ МОДУЛЬ СУЩЕСТВУЕТ

Статус задачи писали десять разных инлайновых `UPDATE` в восьми файлах, и
из-за этого две поломки прожили в проекте месяцами, ни разу себя не выдав:

  · `handle_task_completed` в stepan_bot читал `SELECT message_id FROM tasks`.
    Такой колонки нет (см. `schema.prisma`, модель Task). Исключение летело ДО
    `UPDATE ... status='done'` и гасилось внешним `except`. В чат приходило
    «✅ Задача выполнена», в базе оставалось `todo`, и часовой дайджест
    просрочки продолжал показывать её вечно. Ровно это и накопило владельцу
    восемь «невыполнимых» задач.
  · Вечерняя сводка считала закрытые задачи по `DATE(updated_at)` — колонки
    тоже не было, и весь `evening_summary` падал на первом же запросе.

Обе невидимы при чтении кода и обе не ловились `scripts/check_schema.py`:
он разбирал колонки в сравнениях, агрегатах и списках INSERT, но не в
проекции SELECT. Сторож с тех пор расширен, а обращения к задачам собраны
здесь — по образцу `catalog_repo.py` и `storefront_orders.py`.

ПОЧЕМУ SQL ЗДЕСЬ ВЫПИСАН ЦЕЛИКОМ, А НЕ СОБРАН ИЗ КУСКОВ

`scripts/check_schema.py` берёт аргумент `text(...)` через `ast` и понимает
только строковый литерал: f-строка и склейка через `+` — это `JoinedStr`/
`BinOp`, и такой запрос сторож пропускает молча. Список колонок и фильтр
открытых статусов повторяются в каждой функции намеренно: так каждый запрос
этого модуля проверяем. Соседние строковые литералы `ast` склеивает сам.

СТАТУСЫ

`todo` → `in_progress` → `done`, плюс `cancelled`. Ограничения на уровне БД
нет (в `schema.prisma` это `VarChar(20)`), поэтому набор проверяется здесь:
опечатка в статусе иначе просто исчезла бы из всех выборок, которые фильтруют
по открытым статусам.

УДАЛЕНИЕ

`delete`/`delete_many` удаляют строку физически. Это безопасно: на `Task` в
схеме не ссылается ни одна связь, каскадов нет. Отмена (`cancelled`) строку
оставляет — она нужна, когда задача была осмысленной, но потеряла смысл;
удаление нужно для мусора вроде четырёх дублей одной и той же фразы.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import Integer, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY

from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

# Открытая задача — та, что ещё ждёт работы. Тот же смысл, что и у фильтра
# `status IN ('todo', 'in_progress')` в запросах ниже; держится здесь, чтобы
# вызывающим не приходилось перечислять статусы руками.
OPEN_STATUSES = ("todo", "in_progress")

STATUSES = ("todo", "in_progress", "done", "cancelled")


def _row(row: Any) -> Dict[str, Any]:
    """Строка задачи в одинаковом виде для всех функций модуля.

    Порядок полей обязан совпадать со списком колонок в запросах:
    id, title, description, department, assignee, status, priority,
    deadline, created_at.
    """
    return {
        "id": row[0],
        "title": row[1],
        "description": row[2],
        "department": row[3],
        "assignee": row[4],
        "status": row[5],
        "priority": row[6],
        "deadline": str(row[7]) if row[7] else None,
        "created_at": str(row[8]) if row[8] else None,
    }


async def get(task_id: int) -> Optional[Dict[str, Any]]:
    """Задача по номеру или None."""
    async with get_session_ctx() as session:
        row = (
            await session.execute(
                text(
                    "SELECT id, title, description, department, assignee, "
                    "status, priority, deadline, created_at "
                    "FROM tasks WHERE id = :tid"
                ),
                {"tid": int(task_id)},
            )
        ).fetchone()
    return _row(row) if row else None


async def set_status(task_id: int, status: str) -> bool:
    """Сменить статус задачи. False — такой задачи нет или статус неизвестен.

    `updated_at` пишется здесь и только здесь: `@updatedAt` у Prisma
    проставляется на стороне клиента, а офис ходит в базу сырым SQL.
    """
    if status not in STATUSES:
        logger.error(
            "Неизвестный статус «%s» для задачи #%s — допустимы %s",
            status,
            task_id,
            ", ".join(STATUSES),
        )
        return False

    async with get_session_ctx() as session:
        row = (
            await session.execute(
                text(
                    "UPDATE tasks SET status = :st, updated_at = NOW() "
                    "WHERE id = :tid RETURNING id"
                ),
                {"st": status, "tid": int(task_id)},
            )
        ).fetchone()
        await session.commit()

    if not row:
        logger.warning("Задача #%s не найдена — статус не изменён", task_id)
        return False
    return True


async def delete(task_id: int) -> Optional[Dict[str, Any]]:
    """Удалить задачу. Возвращает удалённую строку — её есть кому показать."""
    async with get_session_ctx() as session:
        row = (
            await session.execute(
                text(
                    "DELETE FROM tasks WHERE id = :tid "
                    "RETURNING id, title, description, department, assignee, "
                    "status, priority, deadline, created_at"
                ),
                {"tid": int(task_id)},
            )
        ).fetchone()
        await session.commit()

    if not row:
        logger.warning("Задача #%s не найдена — удалять нечего", task_id)
        return None
    logger.info("Задача #%s удалена: %s", task_id, row[1])
    return _row(row)


async def delete_many(task_ids: List[int]) -> List[int]:
    """Удалить пачку задач. Возвращает номера, которые реально удалились.

    Разница между запрошенным и возвращённым — это задачи, которых уже нет;
    вызывающий должен показать её владельцу, а не молчать.
    """
    ids = [int(t) for t in task_ids if str(t).lstrip("-").isdigit()]
    if not ids:
        return []

    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "DELETE FROM tasks WHERE id = ANY(:ids) RETURNING id"
                ).bindparams(bindparam("ids", value=ids, type_=ARRAY(Integer))),
            )
        ).fetchall()
        await session.commit()

    removed = [r[0] for r in rows]
    logger.info("Удалено задач: %s из %s запрошенных", len(removed), len(ids))
    return removed


async def list_open(
    department: Optional[str] = None, limit: int = 20
) -> List[Dict[str, Any]]:
    """Открытые задачи — все или по отделу, сначала срочные."""
    params: Dict[str, Any] = {"lim": int(limit)}
    if department:
        # LOWER: отделы приходят и как 'QA', и как 'qa' — сравнение в Postgres
        # регистрозависимое, и задача с 'QA' в выборку по 'qa' не попадала.
        params["dept"] = str(department).lower()
        stmt = text(
            "SELECT id, title, description, department, assignee, "
            "status, priority, deadline, created_at "
            "FROM tasks WHERE status IN ('todo', 'in_progress') "
            "AND LOWER(department) = :dept "
            "ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
            "WHEN 'medium' THEN 2 ELSE 3 END, deadline NULLS LAST, id DESC "
            "LIMIT :lim"
        )
    else:
        stmt = text(
            "SELECT id, title, description, department, assignee, "
            "status, priority, deadline, created_at "
            "FROM tasks WHERE status IN ('todo', 'in_progress') "
            "ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
            "WHEN 'medium' THEN 2 ELSE 3 END, deadline NULLS LAST, id DESC "
            "LIMIT :lim"
        )

    async with get_session_ctx() as session:
        rows = (await session.execute(stmt, params)).fetchall()
    return [_row(r) for r in rows]


async def list_overdue(limit: int = 10) -> List[Dict[str, Any]]:
    """Просроченные задачи — первые `limit` штук, самые старые сначала."""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT id, title, description, department, assignee, "
                    "status, priority, deadline, created_at "
                    "FROM tasks WHERE deadline < CURRENT_DATE "
                    "AND status IN ('todo', 'in_progress') "
                    "ORDER BY deadline ASC LIMIT :lim"
                ),
                {"lim": int(limit)},
            )
        ).fetchall()
    return [_row(r) for r in rows]


async def count_overdue() -> int:
    """Сколько задач просрочено ВСЕГО.

    Отдельно от `list_overdue`, потому что дайджест показывал `len(строк)`
    при `LIMIT 10` и всегда рапортовал «просрочено 10», сколько бы их
    ни было на самом деле.
    """
    async with get_session_ctx() as session:
        total = (
            await session.execute(
                text(
                    "SELECT COUNT(*) FROM tasks WHERE deadline < CURRENT_DATE "
                    "AND status IN ('todo', 'in_progress')"
                )
            )
        ).scalar()
    return int(total or 0)


async def find_recent_duplicate(
    title: str, department: str, within_hours: int = 1
) -> Optional[int]:
    """Номер открытой задачи с тем же заголовком и отделом, заведённой недавно.

    Модель дробит одно поручение на несколько вызовов `create_task` — так
    в базе появились четыре подряд идущие задачи с одним и тем же текстом.
    Такой же `NOT EXISTS` уже стоял в `auto_task_creation` у Стёпана, но
    только там; здесь он общий для всех, кто заводит задачи.
    """
    clean = " ".join(str(title or "").lower().split())
    if not clean:
        return None

    async with get_session_ctx() as session:
        row = (
            await session.execute(
                text(
                    "SELECT id FROM tasks "
                    "WHERE LOWER(TRIM(title)) = :t AND LOWER(department) = :d "
                    "AND status IN ('todo', 'in_progress') "
                    "AND created_at > NOW() - (INTERVAL '1 hour' * :hrs) "
                    "ORDER BY id DESC LIMIT 1"
                ),
                {
                    "t": clean,
                    "d": str(department or "").lower(),
                    "hrs": int(within_hours),
                },
            )
        ).fetchone()
    return row[0] if row else None
