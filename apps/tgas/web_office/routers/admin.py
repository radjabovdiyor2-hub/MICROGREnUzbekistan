import logging
import os
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from shared.database import get_session_ctx
from shared.event_bus import event_bus

logger = logging.getLogger(__name__)

router = APIRouter()

INGEST_SECRET = os.getenv("INGEST_SECRET", "")

def _check_ingest_secret(request: Request) -> bool:
    return not INGEST_SECRET or request.headers.get("X-Ingest-Secret") == INGEST_SECRET

ADMIN_BOT_ACTIONS: dict[str, str] = {
    "daily_backup": "devops_bot",
    "daily_kpi_snapshot": "analytics_bot",
    "sync_publication_metrics": "content_bot",
    "sync_catalog_from_storefront": "sales_bot",
    "force_learning_cycle": "stepan_bot",
    "trigger_lead_audit": "marketing_bot",
    "get_report": "analytics_bot",
    "get_balance": "finance_bot",
    "get_top_products": "analytics_bot",
    "pick_restaurant_of_week": "marketing_bot",
    "send_broadcast": "marketing_bot",
    "b2b_outreach": "marketing_bot",
    "publish_post": "content_bot",
    "publish_story": "content_bot",
    "draft_magazine": "content_bot",
}

@router.post("/admin/sync-catalog")
async def sync_catalog(request: Request) -> Any:
    if INGEST_SECRET and request.headers.get("X-Ingest-Secret") != INGEST_SECRET:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        from shared.catalog_sync import sync_catalog_from_storefront

        result = await sync_catalog_from_storefront()
        return JSONResponse({"status": "ok", **result})
    except Exception as exc:
        logger.exception("Sync-catalog: ошибка: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=500)

@router.post("/api/admin/bot-action")
async def admin_bot_action(request: Request) -> Any:
    if not _check_ingest_secret(request):
        return JSONResponse(
            {"status": "error", "error": "unauthorized"}, status_code=401
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"status": "error", "error": "bad json"}, status_code=400)

    action = str(body.get("action") or "").strip()
    bot = str(body.get("bot") or "").strip()
    params = body.get("params") or {}

    if not action:
        return JSONResponse(
            {"status": "error", "error": "action required"}, status_code=400
        )

    target = ADMIN_BOT_ACTIONS.get(action)
    if not target:
        return JSONResponse(
            {"status": "error", "error": f"действие '{action}' не разрешено"},
            status_code=400,
        )
    if bot and bot != target and bot != "web_office":
        logger.warning(
            "bot-action: %s просили у %s, отправляю профильному %s", action, bot, target
        )

    from shared import bot_bus

    try:
        task_id = await bot_bus.send_task(
            from_bot="web_admin",
            to_bot=target,
            action=action,
            params=params,
        )
    except Exception as exc:
        logger.exception("bot-action: не удалось поставить задачу %s", action)
        return JSONResponse(
            {"status": "error", "error": f"очередь недоступна: {exc}"},
            status_code=503,
        )

    result = await bot_bus.get_result(task_id, timeout=90)

    if result is None:
        return JSONResponse(
            {
                "status": "pending",
                "task_id": task_id,
                "bot": target,
                "message": f"Задача поставлена, но {target} не ответил за 90 с. "
                f"Проверьте, запущен ли бот.",
            }
        )

    if result.get("status") == "error":
        return JSONResponse(
            {
                "status": "error",
                "task_id": task_id,
                "bot": target,
                "error": result.get("error") or "бот вернул ошибку",
            },
            status_code=502,
        )

    return JSONResponse(
        {
            "status": "ok",
            "task_id": task_id,
            "bot": target,
            "result": result.get("result"),
        }
    )

@router.get("/api/admin/bots")
async def admin_bots() -> Any:
    from shared.bot_registry import BOTS
    from shared.health import check_all_bots

    statuses = await check_all_bots()
    bots = []
    for info in BOTS:
        st = statuses.get(info.name, {})
        bots.append(
            {
                "name": info.name,
                "title": info.title,
                "container": info.container,
                "port": info.port,
                "department": info.department,
                "telegram": info.telegram,
                "alive": bool(st.get("alive")),
                "last_seen_ago": st.get("last_seen_ago", -1),
                "errors": st.get("errors", 0),
                "last_error": st.get("last_error", ""),
            }
        )

    alive = sum(1 for b in bots if b["alive"])
    return JSONResponse(
        {
            "status": "ok",
            "bots": bots,
            "alive": alive,
            "total": len(bots),
            "actions": sorted(ADMIN_BOT_ACTIONS.keys()),
        }
    )

@router.get("/api/admin/bot-jobs")
async def admin_bot_jobs() -> Any:
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT bot, name, kind, hour, minute, day_of_week, day_of_month, "
                    "seconds, enabled, last_run_at, last_status, last_error "
                    "FROM bot_jobs ORDER BY bot, name"
                )
            )
            jobs = [
                {
                    "bot": r[0],
                    "name": r[1],
                    "kind": r[2],
                    "hour": r[3],
                    "minute": r[4],
                    "dayOfWeek": r[5],
                    "dayOfMonth": r[6],
                    "seconds": r[7],
                    "enabled": r[8],
                    "lastRunAt": r[9].isoformat() if r[9] else None,
                    "lastStatus": r[10],
                    "lastError": r[11],
                }
                for r in res.fetchall()
            ]
        return JSONResponse({"status": "ok", "jobs": jobs})
    except Exception as exc:
        logger.warning("bot-jobs: чтение не удалось: %s", exc)
        return JSONResponse(
            {"status": "error", "error": f"расписания недоступны: {exc}", "jobs": []},
            status_code=503,
        )

@router.post("/api/admin/bot-jobs")
async def admin_bot_jobs_update(request: Request) -> Any:
    if not _check_ingest_secret(request):
        return JSONResponse(
            {"status": "error", "error": "unauthorized"}, status_code=401
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"status": "error", "error": "bad json"}, status_code=400)

    bot = str(body.get("bot") or "").strip()
    name = str(body.get("name") or "").strip()
    if not bot or not name:
        return JSONResponse(
            {"status": "error", "error": "bot и name обязательны"}, status_code=400
        )

    fields, values = [], {"bot": bot, "name": name}
    for key, col, lo, hi in (
        ("hour", "hour", 0, 23),
        ("minute", "minute", 0, 59),
        ("dayOfWeek", "day_of_week", 0, 6),
        ("dayOfMonth", "day_of_month", 1, 31),
        ("seconds", "seconds", 10, 86400),
    ):
        if key in body and body[key] is not None:
            try:
                num = int(body[key])
            except (TypeError, ValueError):
                return JSONResponse(
                    {"status": "error", "error": f"{key}: ожидается число"},
                    status_code=400,
                )
            if not lo <= num <= hi:
                return JSONResponse(
                    {"status": "error", "error": f"{key}: допустимо {lo}..{hi}"},
                    status_code=400,
                )
            fields.append(f"{col} = :{col}")
            values[col] = num

    if "enabled" in body:
        fields.append("enabled = :enabled")
        values["enabled"] = bool(body["enabled"])

    if not fields:
        return JSONResponse(
            {"status": "error", "error": "нечего менять"}, status_code=400
        )

    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    f"UPDATE bot_jobs SET {', '.join(fields)}, updated_at = NOW() "
                    "WHERE bot = :bot AND name = :name"
                ),
                values,
            )
        if res.rowcount == 0:
            return JSONResponse(
                {
                    "status": "error",
                    "error": "задача не найдена — бот ещё не регистрировал её",
                },
                status_code=404,
            )
    except Exception as exc:
        logger.exception("bot-jobs: обновление не удалось")
        return JSONResponse({"status": "error", "error": str(exc)}, status_code=500)

    try:
        await event_bus.publish(
            "config_updated", {"bot": bot, "job": name}, "web_admin"
        )
    except Exception as exc:
        logger.warning("bot-jobs: событие config_updated не ушло: %s", exc)

    return JSONResponse({"status": "ok", "bot": bot, "name": name})

@router.post("/api/admin/dispatch-task")
async def admin_dispatch_task(request: Request) -> Any:
    if not _check_ingest_secret(request):
        return JSONResponse(
            {"status": "error", "error": "unauthorized"}, status_code=401
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"status": "error", "error": "bad json"}, status_code=400)

    department = str(body.get("department") or "").strip().lower()
    if not department:
        return JSONResponse(
            {"status": "error", "error": "department required"}, status_code=400
        )

    try:
        await event_bus.publish(
            "TASK_CREATED",
            {
                "task_id": body.get("task_id"),
                "title": body.get("title") or "",
                "description": body.get("description") or body.get("title") or "",
                "department": department,
                "priority": body.get("priority") or "medium",
                "deadline": body.get("deadline"),
            },
            "web_admin",
        )
        return JSONResponse({"status": "ok", "department": department})
    except Exception as exc:
        logger.exception("dispatch-task: событие не ушло")
        return JSONResponse({"status": "error", "error": str(exc)}, status_code=503)

@router.post("/api/admin/config-updated")
async def admin_config_updated(request: Request) -> Any:
    if not _check_ingest_secret(request):
        return JSONResponse(
            {"status": "error", "error": "unauthorized"}, status_code=401
        )
    try:
        await event_bus.publish("config_updated", {"source": "web_admin"}, "web_admin")
        return JSONResponse({"status": "ok"})
    except Exception as exc:
        logger.error("config_updated не опубликован: %s", exc)
        return JSONResponse(
            {"status": "error", "error": "не удалось разослать сигнал ботам"},
            status_code=503,
        )
