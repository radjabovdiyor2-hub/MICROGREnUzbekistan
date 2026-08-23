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

# Сколько раз метельщик переотправляет задачу, которую никто не взял.
# После этого проблема не в доставке, и дальнейшие повторы только шумят —
# а до появления счётчика они шли вечно, каждые три часа.
MAX_RETRIES = 2


def _row(row: Any) -> Dict[str, Any]:
    """Строка задачи в одинаковом виде для всех функций модуля.

    Порядок полей обязан совпадать со списком колонок в запросах:
    id, title, description, department, assignee, status, priority,
    deadline, created_at [, retry_count].

    `retry_count` необязателен: он нужен только метельщику зависших задач,
    и дописывать его в проекцию всех остальных запросов ради одного места
    незачем. Отсутствует — значит попыток не было.
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
        "retry_count": int(row[9]) if len(row) > 9 and row[9] is not None else 0,
    }


async def create(
    title: str,
    department: str,
    description: str = "",
    priority: str = "medium",
    assignee: Optional[str] = None,
    deadline_days: Optional[int] = None,
    chat_id: Optional[int] = None,
    notify_department: bool = True,
) -> Dict[str, Any]:
    """Завести задачу и РАЗБУДИТЬ отдел. Единственный правильный способ.

    Строка в `tasks` сама по себе не работа: пока не ушло `TASK_CREATED`,
    исполнителя у неё нет. Это забывали в пяти местах независимо
    (`escalate` в поддержке, эскалация брака в ОТК, PM-меню, инструмент
    `create_task`, `human_task`), и каждый раз задача создавалась мёртвой.

    `notify_department=False` — для задач, которые делает ЧЕЛОВЕК. Событие им
    не нужно: разбудить оно может только бота, а бот эту работу и не может
    выполнить — он её только что отдал. См. `tools/common.human_task`.

    `deadline_days` обязателен по смыслу для всего, что ждёт человека:
    дайджест просрочки ключуется по `deadline`, и задача без него не
    попадает в него никогда — то есть о ней не узнают вообще.

    Payload события — ПЛОСКИЙ: `publish()` оборачивает его сам.
    """
    dept = str(department or "").strip().lower() or "pm"

    async with get_session_ctx() as session:
        task_id = (
            await session.execute(
                text(
                    "INSERT INTO tasks (title, assignee, department, status, "
                    "priority, description, deadline, created_at, updated_at) "
                    "VALUES (:t, :a, :d, 'todo', :p, :descr, "
                    "CASE WHEN :days IS NULL THEN NULL "
                    "ELSE CURRENT_DATE + (INTERVAL '1 day' * :days) END, "
                    "NOW(), NOW()) RETURNING id"
                ),
                {
                    "t": str(title)[:500],
                    "a": assignee,
                    "d": dept,
                    "p": priority,
                    "descr": description,
                    "days": deadline_days,
                },
            )
        ).scalar()
        await session.commit()

    if not notify_department:
        # Задача для человека: события нет, будить некого. Видна она через
        # дайджест просрочки (для этого и нужен `deadline`) и через список задач.
        return {"ok": True, "task_id": task_id, "department": dept, "dispatched": False}

    try:
        from shared.config import settings
        from shared.event_bus import event_bus

        owner_ids = getattr(settings, "admin_telegram_ids", None) or []
        await event_bus.publish(
            "TASK_CREATED",
            {
                "task_id": task_id,
                "title": title,
                "description": description,
                "department": dept,
                "priority": priority,
                "chat_id": chat_id or (owner_ids[0] if owner_ids else None),
            },
            "office",
        )
        dispatched = True

        # Сказать открытым вкладкам админки, что список изменился.
        #
        # Задача, заведённая в Telegram, до сих пор не обновляла экран
        # «Задачи отделам»: шина офиса и SSE витрины не знали друг о друге.
        # Владелец смотрел на список, в котором её нет.
        from shared import storefront_realtime

        storefront_realtime.notify_later("tasks")
    except Exception as exc:
        logger.warning(
            "tasks_repo.create: событие не ушло, задача #%s без исполнителя: %s",
            task_id,
            exc,
        )
        dispatched = False

    return {"ok": True, "task_id": task_id, "department": dept, "dispatched": dispatched}


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


async def list_stuck(older_than_hours: int = 3, limit: int = 20) -> List[Dict[str, Any]]:
    """Задачи, которые никто не взял: `todo` старше N часов.

    Событие `TASK_CREATED` доставляется Redis Pub/Sub, а он не переигрывает:
    отдел, который в этот момент перезапускался, задачу не получит НИКОГДА.
    Прямой HTTP-фолбэк глотает ошибки в `except: pass`, поэтому «доставлено»
    и «бот лежал» неразличимы. Ни одного повторного вызова в системе не было —
    задача просто оставалась в `todo` и всплывала лишь в сводке просрочки.

    `retry_count < MAX_RETRIES` — то самое «две попытки», которое до сих пор
    было только в докстринге. Без него задача возвращалась вечно: сдвинутый
    `updated_at` выводил её из окна ровно на три часа, а потом всё повторялось.

    Задача, по которой уже висит заявка владельцу, «застрявшей» НЕ считается:
    она ждёт человека, а не потерялась в шине. Переоткрывать её значит заново
    звать тот же рискованный инструмент и заводить вторую карточку на то же
    действие — токены разные, и защита от двойного нажатия не спасает. Отсюда
    и брались десять одинаковых строк в дайджесте. Полагаться на перевод задачи
    в `in_progress` (task_executor) нельзя: он есть только на пути отдела, а из
    чата Стёпана заявка создаётся вовсе без `task_id`.
    """
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT id, title, description, department, assignee, "
                    "status, priority, deadline, created_at, retry_count "
                    "FROM tasks WHERE status = 'todo' "
                    "AND retry_count < :max_retries "
                    "AND created_at < NOW() - (INTERVAL '1 hour' * :hrs) "
                    "AND updated_at < NOW() - (INTERVAL '1 hour' * :hrs) "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM owner_approvals oa "
                    "  WHERE oa.task_id = tasks.id AND oa.status = 'pending'"
                    ") "
                    "ORDER BY created_at ASC LIMIT :lim"
                ),
                {
                    "hrs": max(1, int(older_than_hours)),
                    "lim": int(limit),
                    "max_retries": MAX_RETRIES,
                },
            )
        ).fetchall()
    return [_row(r) for r in rows]


async def mark_retried(task_id: int) -> None:
    """Отметить попытку переотправки — чтобы метельщик не крутил одно и то же.

    Считаем попытки и двигаем `updated_at`: счётчик закрывает задачу от
    повторов навсегда, метка разносит две разрешённые попытки во времени.
    """
    async with get_session_ctx() as session:
        await session.execute(
            text(
                "UPDATE tasks SET retry_count = retry_count + 1, updated_at = NOW() "
                "WHERE id = :tid"
            ),
            {"tid": int(task_id)},
        )
        await session.commit()


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
