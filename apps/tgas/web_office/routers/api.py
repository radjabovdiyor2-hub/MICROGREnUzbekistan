import json
import logging
from typing import Any
from pathlib import Path

from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
from sqlalchemy import text

from shared.database import get_session_ctx
from shared.event_bus import event_bus
from shared.trends import fetch_google_trends

logger = logging.getLogger(__name__)

router = APIRouter()

def _safe_str(value: Any) -> str:
    from datetime import date, datetime
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.strftime("%d.%m.%Y")
    return str(value)

def _safe_int(value: Any) -> int:
    try:
        return int(value) if value is not None else 0
    except (ValueError, TypeError):
        return 0

DEPARTMENT_META: dict[str, dict[str, str]] = {
    "marketing": {"name": "Маркетинг", "bot": "MG_Marketing_bot", "icon": "📢"},
    "content": {"name": "Контент", "bot": "MG_Finance1_bot", "icon": "✍️"},
    "hr": {"name": "Кадры (HR)", "bot": "MG_HR1_bot", "icon": "👥"},
    "finance": {"name": "Финансы", "bot": "MG_Content1_bot", "icon": "💰"},
    "devops": {"name": "DevOps / IT", "bot": "MG_PM1_bot", "icon": "⚙️"},
    "qa": {"name": "QA / Тесты", "bot": "MG_PM1_bot", "icon": "🔍"},
    "rnd": {"name": "R&D", "bot": "MG_PM1_bot", "icon": "💡"},
    "support": {"name": "Поддержка", "bot": "MicrogreenSupport_bot", "icon": "🎧"},
    "sales": {"name": "Продажи", "bot": "MicrogreenSales_bot", "icon": "🛒"},
    "analytics": {"name": "Аналитика", "bot": "MG_Analytics_bot", "icon": "📊"},
}

@router.post("/api/tasks")
async def create_task(
    title: str = Form(...),
    department: str = Form(...),
    priority: str = Form("medium"),
    description: str = Form(""),
    assignee: str = Form(""),
    deadline: str = Form(""),
) -> Any:
    try:
        async with get_session_ctx() as session:
            result = await session.execute(
                text(
                    "INSERT INTO tasks (title, department, priority, description, assignee, status, deadline) "
                    "VALUES (:title, :dept, :priority, :desc, :assignee, 'todo', :deadline) "
                    "RETURNING id"
                ),
                {
                    "title": title,
                    "dept": department,
                    "priority": priority,
                    "desc": description or title,
                    "assignee": assignee or f"Бот {department}",
                    "deadline": deadline if deadline else None,
                },
            )
            task_id = result.scalar()
            await session.commit()

        try:
            await event_bus.publish(
                "TASK_CREATED",
                {
                    "task_id": task_id,
                    "title": title,
                    "description": description or title,
                    "department": department,
                    "priority": priority,
                },
                "web_office",
            )
        except Exception as e:
            logger.warning(f"EventBus publish failed: {e}")

        return JSONResponse({"ok": True, "task_id": task_id})

    except Exception as exc:
        logger.exception("Failed to create task: %s", exc)
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)

@router.get("/api/learnings")
async def get_learnings() -> Any:
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT id, bot, metric, observation, inference, adjustment, applied_at "
                    "FROM bot_learnings WHERE is_active = TRUE ORDER BY applied_at DESC"
                )
            )
            rows = res.fetchall()
            learnings = [
                {
                    "id": row[0],
                    "bot": row[1],
                    "metric": row[2],
                    "observation": row[3],
                    "inference": row[4],
                    "adjustment": json.loads(row[5])
                    if isinstance(row[5], str)
                    else row[5],
                    "applied_at": _safe_str(row[6]),
                }
                for row in rows
            ]
            return JSONResponse({"status": "ok", "learnings": learnings})
    except Exception as exc:
        logger.exception("Learnings-API: ошибка: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=500)

@router.get("/api/departments/summary")
async def departments_summary() -> Any:
    departments = []
    try:
        async with get_session_ctx() as session:
            for dept_id, meta in DEPARTMENT_META.items():
                result = await session.execute(
                    text(
                        "SELECT status, COUNT(*) FROM tasks "
                        "WHERE LOWER(department) = :dept "
                        "GROUP BY status"
                    ),
                    {"dept": dept_id},
                )
                rows = result.fetchall()
                stats = {row[0]: row[1] for row in rows}
                total = sum(stats.values())
                departments.append(
                    {
                        "id": dept_id,
                        "name": meta["name"],
                        "bot": meta["bot"],
                        "icon": meta["icon"],
                        "status": "online",
                        "tasks_total": total,
                        "tasks_done": stats.get("done", 0),
                        "tasks_in_progress": stats.get("in_progress", 0),
                        "tasks_todo": stats.get("todo", 0),
                    }
                )
    except Exception as exc:
        logger.warning("departments_summary error: %s", exc)
        for dept_id, meta in DEPARTMENT_META.items():
            departments.append(
                {
                    "id": dept_id,
                    "name": meta["name"],
                    "bot": meta["bot"],
                    "icon": meta["icon"],
                    "status": "unknown",
                    "tasks_total": 0,
                    "tasks_done": 0,
                    "tasks_in_progress": 0,
                    "tasks_todo": 0,
                }
            )
    return JSONResponse({"success": True, "departments": departments})

@router.get("/api/department/{dept_id}")
async def department_detail(dept_id: str) -> Any:
    meta = DEPARTMENT_META.get(dept_id)
    if not meta:
        return JSONResponse({"error": "unknown department"}, status_code=404)

    tasks_list: list[dict[str, Any]] = []
    stats = {"total": 0, "done": 0, "in_progress": 0, "todo": 0, "overdue": 0}

    try:
        async with get_session_ctx() as session:
            result = await session.execute(
                text(
                    "SELECT id, title, assignee, status, priority, "
                    "deadline, created_at "
                    "FROM tasks WHERE LOWER(department) = :dept "
                    "ORDER BY created_at DESC LIMIT 50"
                ),
                {"dept": dept_id},
            )
            rows = result.fetchall()
            for row in rows:
                tasks_list.append(
                    {
                        "id": row[0],
                        "title": row[1] or "—",
                        "assignee": row[2] or "—",
                        "status": row[3] or "todo",
                        "priority": row[4] or "medium",
                        "deadline": _safe_str(row[5]),
                        "created_at": _safe_str(row[6]),
                    }
                )

            result = await session.execute(
                text(
                    "SELECT status, COUNT(*) FROM tasks "
                    "WHERE LOWER(department) = :dept GROUP BY status"
                ),
                {"dept": dept_id},
            )
            for row in result.fetchall():
                stats[row[0]] = row[1]
            stats["total"] = sum(v for k, v in stats.items() if k != "overdue")

            result = await session.execute(
                text(
                    "SELECT COUNT(*) FROM tasks "
                    "WHERE LOWER(department) = :dept "
                    "AND deadline < NOW() AND status != 'done'"
                ),
                {"dept": dept_id},
            )
            stats["overdue"] = _safe_int(result.scalar())
    except Exception as exc:
        logger.warning("department_detail(%s) error: %s", dept_id, exc)

    return JSONResponse(
        {
            "success": True,
            "department": {
                "id": dept_id,
                **meta,
                "stats": stats,
                "tasks": tasks_list,
            },
        }
    )

@router.get("/api/bots/kanban")
async def bots_kanban() -> Any:
    bus_tasks_dir = Path("bus_tasks")
    columns = ["pending", "processing", "completed"]
    tasks = []

    for col in columns:
        col_dir = bus_tasks_dir / col
        if not col_dir.exists():
            continue

        for file in col_dir.glob("*.json"):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    task_data = json.load(f)
                    task_data["column"] = col
                    task_data["file_id"] = file.stem
                    tasks.append(task_data)
            except Exception as e:
                logger.error(f"Error reading task {file}: {e}")

    return JSONResponse({"tasks": tasks})

@router.get("/api/magazine/brief")
async def get_magazine_brief() -> Any:
    trends = await fetch_google_trends(geo="UZ", limit=10)
    return JSONResponse({"google_trends": trends})
