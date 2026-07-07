"""
Microgreen Uzbekistan — AI Virtual Office
FastAPI Web Dashboard Backend
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import text

from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

# ── FastAPI App ──────────────────────────────────────────────
app = FastAPI(
    title="MG AI Virtual Office",
    docs_url=None,
    redoc_url=None,
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# ── AI Bots (static config) ─────────────────────────────────
AI_BOTS: list[dict[str, str]] = [
    {"name": "Степан", "role": "Оркестратор / PM", "status": "online", "icon": "🤖"},
    {"name": "Sales Bot", "role": "Продажи", "status": "online", "icon": "🛒"},
    {"name": "Support Bot", "role": "Поддержка", "status": "online", "icon": "🎧"},
    {"name": "Marketing Bot", "role": "Маркетинг", "status": "online", "icon": "📢"},
    {"name": "HR Bot", "role": "Персонал", "status": "online", "icon": "👥"},
    {"name": "Finance Bot", "role": "Финансы", "status": "online", "icon": "💰"},
    {"name": "PM Bot", "role": "Задачи", "status": "online", "icon": "📋"},
    {"name": "Analytics Bot", "role": "Аналитика", "status": "online", "icon": "📊"},
    {"name": "Content Bot", "role": "Контент", "status": "online", "icon": "✍️"},
]


def _safe_str(value: Any) -> str:
    """Convert a value to string, handling dates and None."""
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.strftime("%d.%m.%Y")
    return str(value)


def _safe_float(value: Any) -> float:
    """Safely convert to float."""
    try:
        return float(value) if value is not None else 0.0
    except (ValueError, TypeError):
        return 0.0


def _safe_int(value: Any) -> int:
    """Safely convert to int."""
    try:
        return int(value) if value is not None else 0
    except (ValueError, TypeError):
        return 0


# ── Dashboard Route ──────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Render the main dashboard page with live data from PostgreSQL."""

    # Default empty data
    tasks: list[dict[str, Any]] = []
    finances: list[dict[str, Any]] = []
    recent_orders: list[dict[str, Any]] = []
    customers: list[dict[str, Any]] = []
    inventory: list[dict[str, Any]] = []
    interactions: list[dict[str, Any]] = []
    funnel: dict[str, int] = {"lead": 0, "active": 0, "vip": 0, "churned": 0}
    stats: dict[str, Any] = {
        "total_tasks": 0,
        "done_tasks": 0,
        "active_tasks": 0,
        "overdue_tasks": 0,
        "total_orders": 0,
        "total_revenue": 0,
        "total_customers": 0,
        "total_employees": 0,
    }

    try:
        async with get_session_ctx() as session:
            # ── Tasks ────────────────────────────────────────
            result = await session.execute(
                text(
                    "SELECT id, title, assignee, department, status, priority, "
                    "deadline, created_at "
                    "FROM tasks ORDER BY created_at DESC LIMIT 50"
                )
            )
            rows = result.fetchall()
            tasks = [
                {
                    "id": row[0],
                    "title": row[1] or "—",
                    "assignee": row[2] or "—",
                    "department": row[3] or "—",
                    "status": row[4] or "todo",
                    "priority": row[5] or "medium",
                    "deadline": _safe_str(row[6]),
                    "created_at": _safe_str(row[7]),
                }
                for row in rows
            ]

            # ── Task Stats ───────────────────────────────────
            result = await session.execute(
                text("SELECT COUNT(*) FROM tasks")
            )
            stats["total_tasks"] = _safe_int(result.scalar())

            result = await session.execute(
                text("SELECT COUNT(*) FROM tasks WHERE status = 'done'")
            )
            stats["done_tasks"] = _safe_int(result.scalar())

            result = await session.execute(
                text("SELECT COUNT(*) FROM tasks WHERE status = 'in_progress'")
            )
            stats["active_tasks"] = _safe_int(result.scalar())

            result = await session.execute(
                text(
                    "SELECT COUNT(*) FROM tasks "
                    "WHERE status NOT IN ('done', 'cancelled') "
                    "AND deadline < CURRENT_DATE"
                )
            )
            stats["overdue_tasks"] = _safe_int(result.scalar())

            # ── Orders ───────────────────────────────────────
            result = await session.execute(
                text("SELECT COUNT(*) FROM orders")
            )
            stats["total_orders"] = _safe_int(result.scalar())

            result = await session.execute(
                text("SELECT COALESCE(SUM(total_amount), 0) FROM orders")
            )
            stats["total_revenue"] = _safe_int(result.scalar())

            result = await session.execute(
                text(
                    "SELECT o.id, o.order_number, c.name AS customer_name, "
                    "o.total_amount, o.status, o.created_at "
                    "FROM orders o "
                    "LEFT JOIN customers c ON o.customer_id = c.id "
                    "ORDER BY o.created_at DESC LIMIT 20"
                )
            )
            rows = result.fetchall()
            recent_orders = [
                {
                    "id": row[0],
                    "order_number": row[1] or "—",
                    "customer_name": row[2] or "—",
                    "total_amount": _safe_float(row[3]),
                    "status": row[4] or "new",
                    "created_at": _safe_str(row[5]),
                }
                for row in rows
            ]

            # ── Customers ────────────────────────────────────
            result = await session.execute(
                text("SELECT COUNT(*) FROM customers")
            )
            stats["total_customers"] = _safe_int(result.scalar())

            # ── Employees ────────────────────────────────────
            result = await session.execute(
                text("SELECT COUNT(*) FROM employees")
            )
            stats["total_employees"] = _safe_int(result.scalar())

            # ── Finances ─────────────────────────────────────
            result = await session.execute(
                text(
                    "SELECT type, amount, category, description, date "
                    "FROM finances ORDER BY date DESC LIMIT 20"
                )
            )
            rows = result.fetchall()
            finances = [
                {
                    "type": row[0] or "expense",
                    "amount": _safe_float(row[1]),
                    "category": row[2] or "—",
                    "description": row[3] or "—",
                    "date": _safe_str(row[4]),
                }
                for row in rows
            ]

            # ── Customers ────────────────────────────────────
            result = await session.execute(
                text(
                    "SELECT id, name, phone, telegram_username, customer_type, "
                    "company_name, status, total_spent, orders_count, city, created_at, bonus_balance "
                    "FROM customers ORDER BY created_at DESC LIMIT 50"
                )
            )
            rows = result.fetchall()
            customers = [
                {
                    "id": row[0],
                    "name": row[1] or "—",
                    "phone": row[2] or "—",
                    "telegram": f"@{row[3]}" if row[3] else "—",
                    "type": row[4] or "b2c",
                    "company": row[5] or "—",
                    "status": row[6] or "lead",
                    "total_spent": _safe_float(row[7]),
                    "orders_count": _safe_int(row[8]),
                    "city": row[9] or "—",
                    "created_at": _safe_str(row[10]),
                    "bonus_balance": _safe_float(row[11]) if len(row) > 11 else 0.0
                }
                for row in rows
            ]

            # ── Inventory ────────────────────────────────────
            try:
                result = await session.execute(
                    text(
                        "SELECT item_name, category, quantity, unit, min_stock "
                        "FROM inventory ORDER BY category"
                    )
                )
                inventory = [
                    {
                        "item_name": row[0],
                        "category": row[1],
                        "quantity": _safe_float(row[2]),
                        "unit": row[3],
                        "min_stock": _safe_float(row[4])
                    }
                    for row in result.fetchall()
                ]
            except Exception:
                # If inventory table doesn't exist yet
                inventory = []

            # ── Funnel ───────────────────────────────────────
            result = await session.execute(
                text("SELECT status, COUNT(*) FROM customers GROUP BY status")
            )
            for status, cnt in result.fetchall():
                funnel[status] = cnt

            # ── Interactions ─────────────────────────────────
            result = await session.execute(
                text(
                    "SELECT i.id, c.name, i.interaction_type, i.bot_name, "
                    "i.summary, i.created_at "
                    "FROM interactions i "
                    "LEFT JOIN customers c ON i.customer_id = c.id "
                    "ORDER BY i.created_at DESC LIMIT 30"
                )
            )
            rows = result.fetchall()
            interactions = [
                {
                    "id": row[0],
                    "customer_name": row[1] or "—",
                    "type": row[2] or "—",
                    "bot_name": row[3] or "—",
                    "summary": (row[4] or "—")[:100],
                    "created_at": _safe_str(row[5]),
                }
                for row in rows
            ]

    except Exception as exc:
        logger.exception("Failed to load dashboard data: %s", exc)

    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "tasks": tasks,
            "bots": AI_BOTS,
            "stats": stats,
            "finances": finances,
            "recent_orders": recent_orders,
            "customers": customers,
            "inventory": inventory,
            "interactions": interactions,
            "funnel": funnel,
        },
    )


# ── API: Создание задачи ────────────────────────────────────
@app.post("/api/tasks")
async def create_task(
    title: str = Form(...),
    department: str = Form(...),
    priority: str = Form("medium"),
    description: str = Form(""),
    assignee: str = Form(""),
    deadline: str = Form(""),
):
    """Создать задачу из веб-интерфейса и отправить боту через EventBus."""
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

        # Публикуем в EventBus для автовыполнения ботом
        try:
            import redis.asyncio as aioredis
            import json as _json
            from datetime import datetime as _dt
            from shared.config import settings as _s

            r = aioredis.from_url(_s.redis_url, decode_responses=True)
            await r.publish(
                "mg_events",
                _json.dumps({
                    "event": "TASK_CREATED",
                    "data": {
                        "task_id": task_id,
                        "title": title,
                        "description": description or title,
                        "department": department,
                        "priority": priority,
                    },
                    "source": "web_office",
                    "timestamp": _dt.now().isoformat(),
                }, ensure_ascii=False),
            )
            await r.close()
        except Exception as e:
            logger.warning(f"EventBus publish failed: {e}")

        return JSONResponse({"ok": True, "task_id": task_id})

    except Exception as exc:
        logger.exception("Failed to create task: %s", exc)
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


# ── API: Meta Webhooks (Instagram & Facebook) ──────────────────
import os
from fastapi import Query

META_VERIFY_TOKEN = os.getenv("META_VERIFY_TOKEN", "microgreen_secure_token_2026")

@app.get("/webhooks/meta")
async def verify_meta_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    """Verify webhook subscription for Meta (Instagram/Facebook)."""
    if hub_mode == "subscribe" and hub_verify_token == META_VERIFY_TOKEN:
        logger.info("Meta Webhook Verified Successfully!")
        return int(hub_challenge)
    return JSONResponse({"error": "Forbidden"}, status_code=403)

@app.post("/webhooks/meta")
async def handle_meta_webhook(request: Request):
    """Handle incoming messages from Instagram/Facebook."""
    try:
        data = await request.json()
        logger.info(f"Received Meta Webhook: {data}")
        
        if data.get("object") in ["instagram", "page"]:
            for entry in data.get("entry", []):
                for messaging_event in entry.get("messaging", []):
                    sender_id = messaging_event["sender"]["id"]
                    message_data = messaging_event.get("message")
                    
                    if message_data and "text" in message_data:
                        text_content = message_data["text"]
                        logger.info(f"New IG message from {sender_id}: {text_content}")
                        
                        # Публикуем событие для Marketing Bot / Support Bot
                        try:
                            import redis.asyncio as aioredis
                            import json as _json
                            from shared.config import settings as _s
                            from datetime import datetime as _dt
                            
                            r = aioredis.from_url(_s.redis_url, decode_responses=True)
                            await r.publish(
                                "mg_events",
                                _json.dumps({
                                    "event": "IG_MESSAGE_RECEIVED",
                                    "data": {
                                        "sender_id": sender_id,
                                        "text": text_content,
                                        "source": data.get("object")
                                    },
                                    "source": "web_office",
                                    "timestamp": _dt.now().isoformat(),
                                }, ensure_ascii=False),
                            )
                            await r.close()
                        except Exception as e:
                            logger.error(f"Failed to publish IG message: {e}")
                            
        return JSONResponse({"status": "ok"}, status_code=200)
    except Exception as exc:
        logger.exception("Failed to process Meta webhook: %s", exc)
        return JSONResponse({"status": "error"}, status_code=500)



# ── B2B Funnel Dashboard ─────────────────────────────────────
@app.get("/funnel", response_class=HTMLResponse)
async def b2b_funnel(request: Request):
    """Самодостаточная страница воронки B2B (рестораны)."""
    total_b2b = new_today = contacted = converted = 0
    by_channel: list = []
    by_source: list = []
    try:
        async with get_session_ctx() as session:
            total_b2b = _safe_int((await session.execute(text(
                "SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b'"))).scalar())
            new_today = _safe_int((await session.execute(text(
                "SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b' "
                "AND DATE(created_at) = CURRENT_DATE"))).scalar())
            contacted = _safe_int((await session.execute(text(
                "SELECT COUNT(DISTINCT customer_id) FROM interactions "
                "WHERE interaction_type = 'b2b_offer_sent'"))).scalar())
            converted = _safe_int((await session.execute(text(
                "SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b' "
                "AND status IN ('active','vip')"))).scalar())
            by_channel = (await session.execute(text(
                "SELECT COALESCE(channel,'—'), COUNT(DISTINCT customer_id) FROM interactions "
                "WHERE interaction_type = 'b2b_offer_sent' GROUP BY channel"))).fetchall()
            by_source = (await session.execute(text(
                "SELECT COALESCE(source,'не указан'), COUNT(*) FROM customers "
                "WHERE customer_type = 'b2b' GROUP BY source ORDER BY COUNT(*) DESC"))).fetchall()
    except Exception as exc:
        logger.exception("funnel error: %s", exc)

    conv = (converted / contacted * 100) if contacted else 0
    ch_names = {"email": "📧 Email", "phone_task": "📞 Обзвон"}
    def bar(part, whole):
        pct = int((part / whole * 100)) if whole else 0
        return pct
    stages = [
        ("📥 Собрано лидов", total_b2b, total_b2b),
        ("📨 Отправлено КП/задач", contacted, total_b2b),
        ("✅ Конвертировано", converted, total_b2b),
    ]
    stage_html = "".join(
        f'<div class="stage"><div class="lbl">{name}<span>{val}</span></div>'
        f'<div class="track"><div class="fill" style="width:{max(bar(val,whole),2)}%"></div></div></div>'
        for name, val, whole in stages)
    ch_html = "".join(f'<li>{ch_names.get(c,c)}: <b>{n}</b></li>' for c, n in by_channel) or '<li>—</li>'
    src_html = "".join(f'<li>{s}: <b>{n}</b></li>' for s, n in by_source) or '<li>—</li>'
    html = f"""
<!doctype html><html lang=ru><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>B2B Воронка — Microgreen</title><style>
*{{box-sizing:border-box}}body{{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;
background:#0f1419;color:#e6edf3;padding:24px}}
.wrap{{max-width:760px;margin:0 auto}}h1{{font-size:22px;margin:0 0 4px}}
.sub{{color:#8b98a5;margin:0 0 24px;font-size:14px}}
.card{{background:#1a2430;border:1px solid #2a3746;border-radius:14px;padding:20px;margin-bottom:16px}}
.stage{{margin:14px 0}}.lbl{{display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px}}
.lbl span{{font-weight:700}}.track{{height:14px;background:#0f1419;border-radius:8px;overflow:hidden}}
.fill{{height:100%;background:linear-gradient(90deg,#2ea043,#3fb950);border-radius:8px;transition:width .4s}}
.kpi{{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}}
.kpi div{{flex:1;min-width:120px;background:#0f1419;border-radius:10px;padding:14px;text-align:center}}
.kpi b{{display:block;font-size:26px;color:#3fb950}}.kpi small{{color:#8b98a5}}
ul{{list-style:none;padding:0;margin:0}}li{{padding:6px 0;border-bottom:1px solid #2a3746;font-size:14px}}
h3{{font-size:15px;margin:0 0 8px;color:#8b98a5;text-transform:uppercase;letter-spacing:.5px}}
a{{color:#58a6ff;text-decoration:none}}</style></head><body><div class=wrap>
<h1>🍽 Воронка B2B — рестораны</h1><p class=sub>Собрано за сегодня: +{new_today} · <a href=/>← дашборд</a></p>
<div class=card>{stage_html}
<div class=kpi><div><b>{conv:.1f}%</b><small>конверсия</small></div>
<div><b>{total_b2b}</b><small>всего лидов</small></div>
<div><b>{contacted}</b><small>контактов</small></div></div></div>
<div class=card><h3>По каналам</h3><ul>{ch_html}</ul></div>
<div class=card><h3>По источникам</h3><ul>{src_html}</ul></div>
</div></body></html>"""
    return HTMLResponse(html)
