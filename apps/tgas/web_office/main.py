"""
Microgreen Uzbekistan — AI Virtual Office
FastAPI Web Dashboard Backend
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, Form, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import text

from shared.database import get_session_ctx
from shared.event_bus import event_bus, Events
from shared.utils import format_price
from shared.trends import fetch_google_trends
import sentry_sdk

logger = logging.getLogger(__name__)

if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

# Общий секрет для приёма заказов из витрины (пусто = проверка выключена).
INGEST_SECRET = os.getenv("INGEST_SECRET", "")
# Способы оплаты, разрешённые CHECK-констрейнтом orders.payment_method.
_ALLOWED_PAYMENT = {"cash", "card", "click", "payme", "transfer"}
# Статусы заказа, разрешённые CHECK-констрейнтом orders.status.
_ALLOWED_ORDER_STATUS = {
    "new",
    "confirmed",
    "preparing",
    "ready",
    "delivering",
    "delivered",
    "cancelled",
}
# Куда синкать статус заказов витрины обратно (web /api/orders/status).
STOREFRONT_STATUS_URL = os.getenv("STOREFRONT_STATUS_URL", "")
# Маркер заказа витрины в notes: [webapp:<номер>].
_WEBAPP_MARKER = re.compile(r"\[webapp:([^\]]+)\]")

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
    {"name": "Степан", "role": "Менеджер / PM / COO", "status": "online", "icon": "🤖"},
    {"name": "Sales Bot", "role": "Продажи", "status": "online", "icon": "🛒"},
    {"name": "Support Bot", "role": "Поддержка", "status": "online", "icon": "🎧"},
    {"name": "Marketing Bot", "role": "Маркетинг", "status": "online", "icon": "📢"},
    {"name": "HR Bot", "role": "Персонал", "status": "online", "icon": "👥"},
    {"name": "Finance Bot", "role": "Финансы", "status": "online", "icon": "💰"},
    {"name": "Analytics Bot", "role": "Аналитика", "status": "online", "icon": "📊"},
    {"name": "Content Bot", "role": "Контент", "status": "online", "icon": "✍️"},
    {"name": "DevOps Bot", "role": "Инфраструктура", "status": "online", "icon": "🛠"},
    {"name": "QA Bot", "role": "Тестирование", "status": "online", "icon": "🧪"},
    {"name": "RnD Bot", "role": "Исследования", "status": "online", "icon": "🔬"},
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
            result = await session.execute(text("SELECT COUNT(*) FROM tasks"))
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
            result = await session.execute(text("SELECT COUNT(*) FROM orders"))
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
            result = await session.execute(text("SELECT COUNT(*) FROM customers"))
            stats["total_customers"] = _safe_int(result.scalar())

            # ── Employees ────────────────────────────────────
            result = await session.execute(text("SELECT COUNT(*) FROM employees"))
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
                    "bonus_balance": _safe_float(row[11]) if len(row) > 11 else 0.0,
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
                        "min_stock": _safe_float(row[4]),
                    }
                    for row in result.fetchall()
                ]
            except Exception as exc:
                # Таблицы inventory может не быть на свежей базе. Пустой
                # список на дашборде неотличим от «склад пуст», поэтому
                # причина обязана попасть в лог — иначе расхождение между
                # экраном и реальностью не с чем сопоставить.
                logger.warning("Сводка: таблица inventory не прочитана: %s", exc)
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
            from shared.event_bus import event_bus

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


# ── API: Meta Webhooks (Instagram & Facebook) ──────────────────
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
                            from shared.event_bus import event_bus

                            await event_bus.publish(
                                "IG_MESSAGE_RECEIVED",
                                {
                                    "sender_id": sender_id,
                                    "text": text_content,
                                    "source": data.get("object"),
                                },
                                "web_office",
                            )
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
            total_b2b = _safe_int(
                (
                    await session.execute(
                        text(
                            "SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b'"
                        )
                    )
                ).scalar()
            )
            new_today = _safe_int(
                (
                    await session.execute(
                        text(
                            "SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b' "
                            "AND DATE(created_at) = CURRENT_DATE"
                        )
                    )
                ).scalar()
            )
            contacted = _safe_int(
                (
                    await session.execute(
                        text(
                            "SELECT COUNT(DISTINCT customer_id) FROM interactions "
                            "WHERE interaction_type = 'b2b_offer_sent'"
                        )
                    )
                ).scalar()
            )
            converted = _safe_int(
                (
                    await session.execute(
                        text(
                            "SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b' "
                            "AND status IN ('active','vip')"
                        )
                    )
                ).scalar()
            )
            by_channel = (
                await session.execute(
                    text(
                        "SELECT COALESCE(channel,'—'), COUNT(DISTINCT customer_id) FROM interactions "
                        "WHERE interaction_type = 'b2b_offer_sent' GROUP BY channel"
                    )
                )
            ).fetchall()
            by_source = (
                await session.execute(
                    text(
                        "SELECT COALESCE(source,'не указан'), COUNT(*) FROM customers "
                        "WHERE customer_type = 'b2b' GROUP BY source ORDER BY COUNT(*) DESC"
                    )
                )
            ).fetchall()
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
        f'<div class="track"><div class="fill" style="width:{max(bar(val, whole), 2)}%"></div></div></div>'
        for name, val, whole in stages
    )
    ch_html = (
        "".join(f"<li>{ch_names.get(c, c)}: <b>{n}</b></li>" for c, n in by_channel)
        or "<li>—</li>"
    )
    src_html = (
        "".join(f"<li>{s}: <b>{n}</b></li>" for s, n in by_source) or "<li>—</li>"
    )
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


# ─── Мост «витрина → AI-офис» ────────────────────────────────
@app.post("/ingest/order")
async def ingest_order(request: Request):
    """Приём заказа из витрины (Next.js `/api/orders`) в CRM AI-офиса.

    Витрина и офис живут в РАЗНЫХ базах (`microgreen_db` ↔ `microgreen`), поэтому
    заказ из приложения сам по себе не виден ни ботам, ни дашборду. Этот эндпоинт —
    единственный мост: он зеркалит заказ в CRM-таблицы (`customers`/`orders`) и
    публикует `ORDER_CREATED`, чтобы Степан/PM/Finance/Analytics отработали его так
    же, как «родной» заказ из sales_bot.

    Номер витрины (`M-...`) кладём в `notes` как `[webapp:<номер>]`, а собственный
    `order_number` в `microgreen.orders` оставляем NULL — его выдаёт триггер в формате
    `MG-XXXXXX` (иначе ломается генерация номеров у sales_bot). Тот же маркер даёт
    идемпотентность: повторный вызов с тем же номером дубль не создаёт.
    """
    if not INGEST_SECRET:
        if os.getenv("ENVIRONMENT", "development") == "production":
            logger.error("FATAL: INGEST_SECRET is missing in production!")
            return JSONResponse({"error": "unauthorized"}, status_code=401)
    elif request.headers.get("X-Ingest-Secret") != INGEST_SECRET:
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    ext_number = str(body.get("order_number") or "").strip()
    if not ext_number:
        return JSONResponse({"error": "order_number required"}, status_code=400)

    customer = body.get("customer") or {}
    name = (customer.get("name") or "").strip() or "Клиент из приложения"
    phone = (customer.get("phone") or "").strip() or None
    try:
        raw_tid = customer.get("telegram_id")
        tid = int(raw_tid) if raw_tid not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        tid = None
    bonus_balance = _safe_float(customer.get("bonus_balance"))

    total = _safe_float(body.get("total_amount"))
    delivery_fee = _safe_float(body.get("delivery_fee"))
    discount = _safe_float(body.get("discount_amount"))
    pay_method = str(body.get("payment_method") or "cash").lower()
    if pay_method not in _ALLOWED_PAYMENT:
        pay_method = "cash"
    address = str(body.get("delivery_address") or "").strip()
    items_summary = str(body.get("items_summary") or "").strip()
    extra_notes = str(body.get("notes") or "").strip()

    marker = f"[webapp:{ext_number}]"
    notes = marker
    if items_summary:
        notes += f" {items_summary}"
    if extra_notes:
        notes += f" | {extra_notes}"

    try:
        async with get_session_ctx() as session:
            # Идемпотентность: заказ с этим номером витрины уже перенесён?
            dup = (
                await session.execute(
                    text("SELECT id FROM orders WHERE notes LIKE :m LIMIT 1"),
                    {"m": marker + "%"},
                )
            ).scalar()
            if dup:
                return JSONResponse({"status": "duplicate", "order_id": dup})

            # Upsert клиента: по telegram_id, затем по телефону, иначе создаём.
            customer_id = None
            if tid:
                customer_id = (
                    await session.execute(
                        text("SELECT id FROM customers WHERE telegram_id = :tid"),
                        {"tid": tid},
                    )
                ).scalar()
            if not customer_id and phone:
                customer_id = (
                    await session.execute(
                        text(
                            "SELECT id FROM customers WHERE phone = :phone ORDER BY id LIMIT 1"
                        ),
                        {"phone": phone},
                    )
                ).scalar()
            if not customer_id:
                customer_id = (
                    await session.execute(
                        text(
                            "INSERT INTO customers (name, phone, telegram_id, bonus_balance, source, "
                            "status, customer_type, city) VALUES (:name, :phone, :tid, :bonus, 'webapp', "
                            "'active', 'b2c', 'Samarqand') RETURNING id"
                        ),
                        {
                            "name": name,
                            "phone": phone,
                            "tid": tid,
                            "bonus": bonus_balance,
                        },
                    )
                ).scalar()
            else:
                # Дополняем недостающие контакты; баланс бонусов зеркалим из витрины.
                await session.execute(
                    text(
                        "UPDATE customers SET telegram_id = COALESCE(telegram_id, :tid), "
                        "phone = COALESCE(phone, :phone), "
                        "name = COALESCE(NULLIF(name, ''), :name), "
                        "bonus_balance = :bonus WHERE id = :cid"
                    ),
                    {
                        "tid": tid,
                        "phone": phone,
                        "name": name,
                        "bonus": bonus_balance,
                        "cid": customer_id,
                    },
                )

            # Заказ. order_number = NULL → триггер выдаст MG-XXXXXX.
            new = (
                await session.execute(
                    text(
                        "INSERT INTO orders (customer_id, total_amount, delivery_fee, discount_amount, "
                        "status, payment_status, payment_method, delivery_address, notes, created_at, "
                        "updated_at) VALUES (:cid, :total, :delivery, :discount, 'new', 'pending', "
                        ":pmethod, :addr, :notes, NOW(), NOW()) RETURNING id, order_number"
                    ),
                    {
                        "cid": customer_id,
                        "total": total,
                        "delivery": delivery_fee,
                        "discount": discount,
                        "pmethod": pay_method,
                        "addr": address,
                        "notes": notes,
                    },
                )
            ).fetchone()
            order_id, order_number = new[0], new[1]

            # Позиции заказа: матчим товар витрины к офисному по storefront_id
            # (каталог синкается shared.catalog_sync). Ненайденные строки просто
            # пропускаем — детализация всё равно есть в notes/items_summary.
            for line in body.get("items") or []:
                sid = str(line.get("storefront_id") or "").strip()
                qty = _safe_float(line.get("quantity")) or 1
                price = _safe_float(line.get("price"))
                if not sid:
                    continue
                prod = (
                    await session.execute(
                        text(
                            "SELECT id, unit FROM products WHERE storefront_id = :sid"
                        ),
                        {"sid": sid},
                    )
                ).fetchone()
                if not prod:
                    # Создаем заглушку, которую потом обновит catalog_sync
                    pname = str(
                        line.get("name") or line.get("nameRu") or "Неизвестный товар"
                    ).strip()
                    pid = (
                        await session.execute(
                            text(
                                "INSERT INTO products (name_uz, name_ru, category, price, unit, stock_qty, is_active, storefront_id) "
                                "VALUES (:n, :n, 'sets', :price, 'piece', 0, TRUE, :sid) RETURNING id"
                            ),
                            {"n": pname, "price": price, "sid": sid},
                        )
                    ).scalar()
                    prod = (pid, "piece")
                await session.execute(
                    text(
                        "INSERT INTO order_items (order_id, product_id, quantity, unit, unit_price, "
                        "total_price) VALUES (:oid, :pid, :qty, :unit, :price, :total)"
                    ),
                    {
                        "oid": order_id,
                        "pid": prod[0],
                        "qty": qty,
                        "unit": prod[1] or "piece",
                        "price": price,
                        "total": price * qty,
                    },
                )

            # Статистика клиента + журнал взаимодействия (как это делает sales_bot).
            await session.execute(
                text(
                    "UPDATE customers SET orders_count = orders_count + 1, "
                    "total_spent = total_spent + :amount, last_order_date = NOW(), "
                    "status = CASE WHEN orders_count >= 5 THEN 'vip' "
                    "WHEN orders_count >= 1 THEN 'active' ELSE 'active' END WHERE id = :cid"
                ),
                {"amount": total, "cid": customer_id},
            )
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, order_id, channel, interaction_type, "
                    "bot_name, summary) VALUES (:cid, :oid, 'webapp', 'order', 'web_office', :summary)"
                ),
                {
                    "cid": customer_id,
                    "oid": order_id,
                    "summary": f"Заказ {order_number} (витрина {ext_number}) на "
                    f"{format_price(total)}: {items_summary[:150]}",
                },
            )
    except Exception as exc:
        logger.exception("Ingest: не удалось перенести заказ %s: %s", ext_number, exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    # ORDER_CREATED → Степан (уведомит группу), PM (задача на производство),
    # Finance (доход), Analytics (журнал).
    await event_bus.publish(
        Events.ORDER_CREATED,
        {
            "order_id": order_id,
            "order_number": order_number,
            "total_amount": total,
            "customer_id": customer_id,
            "items_summary": items_summary or extra_notes,
            "telegram_id": tid,
            "source": "webapp",
            "external_number": ext_number,
        },
        source_bot="web_office",
    )
    logger.info(
        "Ingest: заказ витрины %s → CRM #%s (%s), ORDER_CREATED разослан",
        ext_number,
        order_id,
        order_number,
    )
    return JSONResponse(
        {"status": "ok", "order_id": order_id, "order_number": order_number}
    )


@app.post("/ingest/order-status")
async def ingest_order_status(request: Request):
    """Синхронизация смены статуса заказа витрины в CRM AI-офиса.

    Вызывается витриной, когда статус (или статус оплаты) заказа из приложения
    меняется. Находим зеркальный заказ по маркеру `[webapp:<номер>]` в notes,
    обновляем `status`/`payment_status` и публикуем `ORDER_STATUS_CHANGED`, чтобы
    Степан/Analytics видели актуальный жизненный цикл. Обратно на витрину не
    ходим — этот путь только storefront → office.
    """
    if not INGEST_SECRET:
        if os.getenv("ENVIRONMENT", "development") == "production":
            logger.error("FATAL: INGEST_SECRET is missing in production!")
            return JSONResponse({"error": "unauthorized"}, status_code=401)
    elif request.headers.get("X-Ingest-Secret") != INGEST_SECRET:
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    ext_number = str(body.get("order_number") or "").strip()
    if not ext_number:
        return JSONResponse({"error": "order_number required"}, status_code=400)
    status = body.get("status") or None
    payment_status = body.get("payment_status") or None
    if not status and not payment_status:
        return JSONResponse({"error": "nothing to update"}, status_code=400)

    marker = f"[webapp:{ext_number}]"
    try:
        async with get_session_ctx() as session:
            row = (
                await session.execute(
                    text(
                        "UPDATE orders SET status = COALESCE(:status, status), "
                        "payment_status = COALESCE(:pstatus, payment_status), updated_at = NOW() "
                        "WHERE notes LIKE :m RETURNING id, order_number, status"
                    ),
                    {"status": status, "pstatus": payment_status, "m": marker + "%"},
                )
            ).fetchone()
    except Exception as exc:
        logger.exception(
            "Ingest-status: не удалось обновить заказ %s: %s", ext_number, exc
        )
        return JSONResponse({"error": "update failed"}, status_code=500)

    if not row:
        # Заказ ещё не перенесён (например, ingest не сработал) — не ошибка потока.
        logger.warning("Ingest-status: заказ витрины %s в CRM не найден", ext_number)
        return JSONResponse({"status": "not_found"}, status_code=404)

    order_id, order_number, new_status = row[0], row[1], row[2]
    await event_bus.publish(
        Events.ORDER_STATUS_CHANGED,
        {
            "order_id": order_id,
            "order_number": order_number,
            "external_number": ext_number,
            "status": new_status,
            "payment_status": payment_status,
            "source": "webapp",
        },
        source_bot="web_office",
    )
    logger.info(
        "Ingest-status: заказ %s (%s) → %s", order_number, ext_number, new_status
    )
    return JSONResponse(
        {"status": "ok", "order_id": order_id, "order_number": order_number}
    )


@app.post("/orders/{order_id}/status")
async def change_order_status(order_id: int, request: Request):
    """Смена статуса заказа из дашборда офиса (office — источник правды).

    Обновляем `microgreen.orders`, публикуем `ORDER_STATUS_CHANGED` и, если это
    заказ витрины (в notes есть `[webapp:<номер>]`), синкаем статус обратно на
    витрину (`STOREFRONT_STATUS_URL`), которая обновит свою БД и уведомит клиента.
    Обратно витрина сюда не ходит — петли нет.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    status = str(body.get("status") or "").strip().lower()
    if status not in _ALLOWED_ORDER_STATUS:
        return JSONResponse({"error": "invalid status"}, status_code=400)

    try:
        async with get_session_ctx() as session:
            row = (
                await session.execute(
                    text(
                        "UPDATE orders SET status = :s, updated_at = NOW() "
                        "WHERE id = :id RETURNING order_number, notes"
                    ),
                    {"s": status, "id": order_id},
                )
            ).fetchone()
    except Exception as exc:
        logger.exception(
            "Order-status: не удалось обновить заказ #%s: %s", order_id, exc
        )
        return JSONResponse({"error": "update failed"}, status_code=500)

    if not row:
        return JSONResponse({"error": "not found"}, status_code=404)
    order_number, notes = row[0], row[1] or ""

    await event_bus.publish(
        Events.ORDER_STATUS_CHANGED,
        {
            "order_id": order_id,
            "order_number": order_number,
            "status": status,
            "source": "office",
        },
        source_bot="web_office",
    )

    # Заказ витрины → синкаем обратно (обновит microgreen_db + уведомит клиента).
    m = _WEBAPP_MARKER.search(notes)
    if m and STOREFRONT_STATUS_URL:
        ext_number = m.group(1)
        try:
            async with get_session_ctx() as session:
                await session.execute(
                    text(
                        "INSERT INTO storefront_outbox (order_number, status) VALUES (:num, :stat)"
                    ),
                    {"num": ext_number, "stat": status},
                )
                await session.commit()
        except Exception as exc:
            logger.warning(
                "Order-status: не удалось сохранить в outbox (%s): %s", ext_number, exc
            )

    logger.info("Order-status: заказ #%s (%s) → %s", order_id, order_number, status)
    return JSONResponse(
        {"status": "ok", "order_number": order_number, "new_status": status}
    )


@app.post("/ingest/customer")
async def ingest_customer(request: Request):
    """Регистрация клиента из витрины (Mini App / сайт) в CRM офиса.

    Раньше клиент попадал в CRM только при первом заказе. Теперь любой вход/
    регистрация на витрине заводит/обновляет запись в `customers` и публикует
    `CUSTOMER_REGISTERED` (Sales/Analytics видят новых лидов).
    """
    if INGEST_SECRET and request.headers.get("X-Ingest-Secret") != INGEST_SECRET:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    name = (body.get("name") or "").strip() or "Клиент из приложения"
    phone = (body.get("phone") or "").strip() or None
    try:
        raw_tid = body.get("telegram_id")
        tid = int(raw_tid) if raw_tid not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        tid = None
    bonus = _safe_float(body.get("bonus_balance"))
    language = (body.get("language") or "ru").strip()[:5]
    if not tid and not phone:
        return JSONResponse({"error": "telegram_id or phone required"}, status_code=400)

    try:
        async with get_session_ctx() as session:
            customer_id = None
            if tid:
                customer_id = (
                    await session.execute(
                        text("SELECT id FROM customers WHERE telegram_id = :tid"),
                        {"tid": tid},
                    )
                ).scalar()
            if not customer_id and phone:
                customer_id = (
                    await session.execute(
                        text(
                            "SELECT id FROM customers WHERE phone = :phone ORDER BY id LIMIT 1"
                        ),
                        {"phone": phone},
                    )
                ).scalar()
            is_new = customer_id is None
            if is_new:
                customer_id = (
                    await session.execute(
                        text(
                            "INSERT INTO customers (name, phone, telegram_id, bonus_balance, language, "
                            "source, status, customer_type, city) VALUES (:name, :phone, :tid, :bonus, "
                            ":lang, 'webapp', 'lead', 'b2c', 'Samarqand') RETURNING id"
                        ),
                        {
                            "name": name,
                            "phone": phone,
                            "tid": tid,
                            "bonus": bonus,
                            "lang": language,
                        },
                    )
                ).scalar()
            else:
                await session.execute(
                    text(
                        "UPDATE customers SET telegram_id = COALESCE(telegram_id, :tid), "
                        "phone = COALESCE(phone, :phone), name = COALESCE(NULLIF(name, ''), :name), "
                        "bonus_balance = :bonus WHERE id = :cid"
                    ),
                    {
                        "tid": tid,
                        "phone": phone,
                        "name": name,
                        "bonus": bonus,
                        "cid": customer_id,
                    },
                )
    except Exception as exc:
        logger.exception("Ingest-customer: ошибка (%s): %s", phone or tid, exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    if is_new:
        await event_bus.publish(
            Events.CUSTOMER_REGISTERED,
            {
                "customer_id": customer_id,
                "telegram_id": tid,
                "name": name,
                "phone": phone,
                "source": "webapp",
            },
            source_bot="web_office",
        )
    logger.info(
        "Ingest-customer: %s клиент #%s", "новый" if is_new else "обновлён", customer_id
    )
    return JSONResponse({"status": "ok", "customer_id": customer_id, "is_new": is_new})


def _check_ingest_secret(request: Request) -> bool:
    return not INGEST_SECRET or request.headers.get("X-Ingest-Secret") == INGEST_SECRET


async def _find_customer(session, tid, phone):
    """Найти клиента по telegram_id, затем по телефону (best-effort)."""
    if tid:
        cid = (
            await session.execute(
                text("SELECT id FROM customers WHERE telegram_id = :tid"),
                {"tid": tid},
            )
        ).scalar()
        if cid:
            return cid
    if phone:
        return (
            await session.execute(
                text(
                    "SELECT id FROM customers WHERE phone = :phone ORDER BY id LIMIT 1"
                ),
                {"phone": phone},
            )
        ).scalar()
    return None


@app.post("/ingest/support")
async def ingest_support(request: Request):
    """Обращение/жалоба с сайта → журнал + COMPLAINT_RECEIVED (PM ставит срочную задачу)."""
    if not _check_ingest_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    message = (body.get("message") or "").strip()
    if not message:
        return JSONResponse({"error": "message required"}, status_code=400)
    name = (body.get("name") or "").strip() or "Клиент с сайта"
    phone = (body.get("phone") or "").strip() or None
    try:
        raw_tid = body.get("telegram_id")
        tid = int(raw_tid) if raw_tid not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        tid = None

    try:
        async with get_session_ctx() as session:
            customer_id = await _find_customer(session, tid, phone)
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                    "VALUES (:cid, 'website', 'complaint', 'web_office', :s)"
                ),
                {"cid": customer_id, "s": f"Обращение от {name}: {message[:400]}"},
            )
    except Exception as exc:
        logger.exception("Ingest-support: ошибка: %s", exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.COMPLAINT_RECEIVED,
        {
            "customer_name": name,
            "phone": phone,
            "summary": message,
            "source": "website",
        },
        source_bot="web_office",
    )
    logger.info("Ingest-support: обращение с сайта от %s", name)
    return JSONResponse({"status": "ok"})


@app.post("/ingest/lead")
async def ingest_lead(request: Request):
    """B2B-заявка с сайта → клиент (b2b, lead) + B2B_LEAD_CREATED (Sales)."""
    if not _check_ingest_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    company = (body.get("company_name") or "").strip() or None
    contact = (body.get("contact_name") or "").strip() or None
    phone = (body.get("phone") or "").strip() or None
    message = (body.get("message") or "").strip()
    if not (company or contact or phone):
        return JSONResponse({"error": "contact required"}, status_code=400)

    try:
        async with get_session_ctx() as session:
            customer_id = await _find_customer(session, None, phone)
            if not customer_id:
                customer_id = (
                    await session.execute(
                        text(
                            "INSERT INTO customers (name, company_name, phone, customer_type, status, "
                            "source, city) VALUES (:name, :company, :phone, 'b2b', 'lead', 'website', "
                            "'Samarqand') RETURNING id"
                        ),
                        {
                            "name": contact or company or "B2B-лид",
                            "company": company,
                            "phone": phone,
                        },
                    )
                ).scalar()
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                    "VALUES (:cid, 'website', 'b2b_lead', 'web_office', :s)"
                ),
                {
                    "cid": customer_id,
                    "s": f"B2B-заявка: {company or contact}. {message[:300]}",
                },
            )
    except Exception as exc:
        logger.exception("Ingest-lead: ошибка: %s", exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.B2B_LEAD_CREATED,
        {
            "customer_id": customer_id,
            "company_name": company,
            "contact_name": contact,
            "phone": phone,
            "summary": message,
            "source": "website",
        },
        source_bot="web_office",
    )
    logger.info("Ingest-lead: B2B-заявка с сайта (%s)", company or contact)
    return JSONResponse({"status": "ok", "customer_id": customer_id})


@app.post("/ingest/feedback")
async def ingest_feedback(request: Request):
    """Отзыв о товаре с сайта → журнал + FEEDBACK_RECEIVED (Analytics/Stepan)."""
    if not _check_ingest_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    try:
        rating = int(body.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0
    product = (body.get("product") or "").strip() or "товар"
    comment = (body.get("comment") or "").strip()
    name = (body.get("name") or "").strip() or "Клиент"
    try:
        raw_tid = body.get("telegram_id")
        tid = int(raw_tid) if raw_tid not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        tid = None

    try:
        async with get_session_ctx() as session:
            customer_id = await _find_customer(session, tid, None)
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                    "VALUES (:cid, 'website', 'feedback', 'web_office', :s)"
                ),
                {
                    "cid": customer_id,
                    "s": f"Отзыв {rating}★ на «{product}»: {comment[:300]}",
                },
            )
    except Exception as exc:
        logger.exception("Ingest-feedback: ошибка: %s", exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.FEEDBACK_RECEIVED,
        {
            "customer_name": name,
            "product": product,
            "rating": rating,
            "comment": comment,
            "source": "website",
        },
        source_bot="web_office",
    )
    logger.info("Ingest-feedback: отзыв %s★ на %s", rating, product)
    return JSONResponse({"status": "ok"})


# ─── Learnings & AI Reasoning API & Dashboard ───────────────
@app.get("/api/learnings")
async def get_learnings():
    """Возвращает активные выводы и адаптации петель обратной связи всех ботов."""
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


@app.get("/learnings", response_class=HTMLResponse)
async def learnings_dashboard():
    """Визуальный дашборд интелекта и петель обучения ботов."""
    return HTMLResponse("""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Office — Интеллект и обучение ботов</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; }
        .card { background-color: #1e293b; border: 1px solid #334155; color: #f8fafc; border-radius: 12px; }
        .card-header { background-color: #334155; border-bottom: none; font-weight: 600; }
        .badge-bot { background-color: #3b82f6; }
        .badge-metric { background-color: #10b981; }
        pre { background: #090d16; padding: 10px; border-radius: 6px; color: #38bdf8; }
    </style>
</head>
<body class="p-4">
    <div class="container-fluid">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h2>🧠 AI Office — Петли обучения ботов (Action → Measurement → Inference → Behavior)</h2>
            <button class="btn btn-outline-light" onclick="loadLearnings()">🔄 Обновить</button>
        </div>
        <div id="learnings-list" class="row g-4">
            <div class="col-12"><p class="text-muted">Загрузка данных...</p></div>
        </div>
    </div>

    <script>
        async function loadLearnings() {
            const container = document.getElementById('learnings-list');
            try {
                const res = await fetch('/api/learnings');
                const data = await res.json();
                if (!data.learnings || data.learnings.length === 0) {
                    container.innerHTML = '<div class="col-12"><div class="alert alert-info">Активных петель обучения пока не зафиксировано.</div></div>';
                    return;
                }
                container.innerHTML = data.learnings.map(item => `
                    <div class="col-md-6 col-lg-4">
                        <div class="card h-100 shadow-sm">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span>🤖 ${item.bot}</span>
                                <span class="badge badge-metric">${item.metric}</span>
                            </div>
                            <div class="card-body">
                                <p class="small text-muted mb-2">Применено: ${item.applied_at}</p>
                                <h6>🔍 Измерение (Observation):</h6>
                                <p class="small">${item.observation}</p>
                                <h6>🧠 Вывод (Inference):</h6>
                                <p class="small text-warning">${item.inference}</p>
                                <h6>⚙️ Адаптация поведения (Adjustments):</h6>
                                <pre><code>${JSON.stringify(item.adjustment, null, 2)}</code></pre>
                            </div>
                        </div>
                    </div>
                `).join('');
            } catch (err) {
                container.innerHTML = `<div class="col-12"><div class="alert alert-danger">Ошибка загрузки: ${err}</div></div>`;
            }
        }
        loadLearnings();
    </script>
</body>
</html>""")


# ─── Синхронизация каталога витрина → офис ───────────────────
@app.post("/admin/sync-catalog")
async def sync_catalog(request: Request):
    """Ручной запуск синка каталога витрины в офис."""
    if INGEST_SECRET and request.headers.get("X-Ingest-Secret") != INGEST_SECRET:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        from shared.catalog_sync import sync_catalog_from_storefront

        result = await sync_catalog_from_storefront()
        return JSONResponse({"status": "ok", **result})
    except Exception as exc:
        logger.exception("Sync-catalog: ошибка: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=500)


# ── Department API ───────────────────────────────────────────
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


@app.get("/api/departments/summary")
async def departments_summary():
    """Сводка по всем отделам: кол-во задач и статусы."""
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
        # Fallback: return meta without stats
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


@app.get("/api/department/{dept_id}")
async def department_detail(dept_id: str):
    """Детали конкретного отдела: задачи + метрики."""
    meta = DEPARTMENT_META.get(dept_id)
    if not meta:
        return JSONResponse({"error": "unknown department"}, status_code=404)

    tasks_list: list[dict[str, Any]] = []
    stats = {"total": 0, "done": 0, "in_progress": 0, "todo": 0, "overdue": 0}

    try:
        async with get_session_ctx() as session:
            # Tasks for this department
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

            # Stats
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

            # Overdue
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


async def _outbox_processor_loop() -> None:
    """Фоновая отправка статусов из outbox на витрину (каждые 10 секунд)."""
    await asyncio.sleep(5)
    import aiohttp

    while True:
        try:
            if not STOREFRONT_STATUS_URL:
                await asyncio.sleep(10)
                continue

            headers = {"Content-Type": "application/json"}
            if INGEST_SECRET:
                headers["X-Ingest-Secret"] = INGEST_SECRET

            async with get_session_ctx() as session:
                rows = (
                    await session.execute(
                        text(
                            "SELECT id, order_number, status FROM storefront_outbox ORDER BY id ASC LIMIT 50"
                        )
                    )
                ).fetchall()

                if rows:
                    async with aiohttp.ClientSession() as s:
                        for row in rows:
                            outbox_id, ext_number, status = row[0], row[1], row[2]
                            try:
                                resp = await s.post(
                                    STOREFRONT_STATUS_URL,
                                    json={"order_number": ext_number, "status": status},
                                    headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=5),
                                )
                                # Если успешно отправлено, удаляем из outbox
                                if resp.status < 500:
                                    await session.execute(
                                        text(
                                            "DELETE FROM storefront_outbox WHERE id = :id"
                                        ),
                                        {"id": outbox_id},
                                    )
                                    await session.commit()
                            except Exception as exc:
                                logger.warning(
                                    "Outbox: синк на витрину не удался (%s): %s",
                                    ext_number,
                                    exc,
                                )
                                break  # Stop processing and retry later
        except Exception as exc:
            logger.warning("Outbox loop error: %s", exc)
        await asyncio.sleep(10)


async def _catalog_sync_loop() -> None:
    """Фоновая периодическая синхронизация каталога (раз в 30 минут)."""
    from shared.catalog_sync import sync_catalog_from_storefront

    await asyncio.sleep(20)  # дать витрине подняться
    while True:
        try:
            await sync_catalog_from_storefront()
        except Exception as exc:
            logger.warning("Catalog sync loop: %s", exc)
        await asyncio.sleep(1800)


@app.on_event("startup")
async def _start_catalog_sync() -> None:
    # Гарантируем колонку storefront_id ДО приёма заказов (защита от гонки на
    # уже развёрнутой БД), затем запускаем периодический синк в фоне.
    try:
        from shared.catalog_sync import ensure_schema

        await ensure_schema()

        # storefront_outbox инициализируется в init.sql, поэтому дублирование не требуется

    except Exception as exc:
        logger.warning("Schema ensure failed at startup: %s", exc)
    asyncio.create_task(_catalog_sync_loop())
    asyncio.create_task(_outbox_processor_loop())


@app.get("/api/bots/kanban")
async def bots_kanban():
    """Сбор задач из локальной файловой очереди bot_bus для Kanban доски."""
    import json

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


@app.get("/api/health/bots")
async def api_health_bots():
    """JSON-статус всех ботов (heartbeat) — надзор за работой ботов не только в Telegram."""
    from shared.health import check_all_bots

    statuses = await check_all_bots()
    alive = sum(1 for i in statuses.values() if i.get("alive"))
    return JSONResponse(
        {
            "bots": statuses,
            "alive": alive,
            "total": len(statuses),
            "all_ok": alive == len(statuses) and len(statuses) > 0,
        }
    )


# ══════════════════════════════════════════════════════════════════════
#  ПУЛЬТ УПРАВЛЕНИЯ ИЗ ВЕБ-АДМИНКИ
#
#  Веб-админка уже год слала команды на POST /api/admin/bot-action —
#  эндпоинта не существовало. Next.js-роут глотал ошибку и отвечал
#  {status:'ok'} при любом исходе, поэтому шесть кнопок «Пульта ИИ» не
#  делали ничего, но всегда рапортовали об успехе.
#
#  Здесь команда реально кладётся в bot_bus и ждёт результат, а ответ
#  честно отражает, что произошло.
# ══════════════════════════════════════════════════════════════════════

#: Что владелец может запускать из админки: действие -> бот-исполнитель.
#: Белый список, а не свободный ввод: /api/admin/* закрыт сессией, но
#: команда уходит в шину, которая ботами не перепроверяется.
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


@app.post("/api/admin/bot-action")
async def admin_bot_action(request: Request):
    """Запустить задачу бота по команде из веб-админки.

    Ждём результат до 90 секунд. Бекап базы и синк каталога идут дольше
    обычного запроса, поэтому при таймауте возвращаем status="pending", а
    не ошибку: задача осталась в очереди и доработает сама.
    """
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
    # Бот из запроса — подсказка UI; исполнителя выбирает белый список.
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


@app.get("/api/admin/bots")
async def admin_bots():
    """Состав команды и живость каждого бота — для вкладки «Здоровье ботов»."""
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


@app.get("/api/admin/bot-jobs")
async def admin_bot_jobs():
    """Расписания всех задач: что, когда и чем закончилось в прошлый раз."""
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
        # Таблицы может не быть до первого prisma db push.
        #
        # Раньше здесь отдавалось {"status": "ok", "jobs": []} — и пульт
        # рисовал «расписаний нет» вместо «расписания не прочитались».
        # 45 задач ботов исчезали с экрана бесшумно, а поле note, в которое
        # клалась причина, не читал никто. Отказ должен выглядеть отказом.
        logger.warning("bot-jobs: чтение не удалось: %s", exc)
        return JSONResponse(
            {"status": "error", "error": f"расписания недоступны: {exc}", "jobs": []},
            status_code=503,
        )


@app.post("/api/admin/bot-jobs")
async def admin_bot_jobs_update(request: Request):
    """Изменить расписание задачи и разбудить её бота, чтобы применил сразу."""
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

    # Боты сбрасывают кэш настроек и перечитывают расписания без рестарта.
    try:
        await event_bus.publish(
            "config_updated", {"bot": bot, "job": name}, "web_admin"
        )
    except Exception as exc:
        logger.warning("bot-jobs: событие config_updated не ушло: %s", exc)

    return JSONResponse({"status": "ok", "bot": bot, "name": name})


@app.post("/api/admin/dispatch-task")
async def admin_dispatch_task(request: Request):
    """Разослать событие TASK_CREATED по УЖЕ созданной задаче.

    Отдельно от POST /api/tasks намеренно: тот принимает форму и сам
    пишет строку в `tasks`. Веб-админка задачу уже сохранила, и повторный
    вызов создал бы дубль. Здесь только доставка события боту отдела.

    Без этого события строка в базе появляется, а исполнителя у неё нет —
    ровно та поломка, что была с department='operations'.
    """
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
                # Регистр приводим здесь: боты сравнивают department.lower(),
                # и задача с "QA" от диспетчера молча терялась.
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


@app.post("/api/admin/config-updated")
async def admin_config_updated(request: Request):
    """Разослать ботам «настройки изменились» — они сбросят кэш.

    Веб-админка пишет настройки прямо в общую БД, а боты держат их в
    кэше на минуту. Этот сигнал убирает задержку, когда она мешает.
    """
    if not _check_ingest_secret(request):
        return JSONResponse(
            {"status": "error", "error": "unauthorized"}, status_code=401
        )
    try:
        await event_bus.publish("config_updated", {"source": "web_admin"}, "web_admin")
        return JSONResponse({"status": "ok"})
    except Exception as exc:
        # Наружу — общая формулировка, подробности в лог: эндпоинт
        # server-to-server, но текст исключения всё равно ни к чему в ответе.
        logger.error("config_updated не опубликован: %s", exc)
        return JSONResponse(
            {"status": "error", "error": "не удалось разослать сигнал ботам"},
            status_code=503,
        )


@app.get("/health/bots", response_class=HTMLResponse)
async def health_bots_view():
    """Простая авто-обновляемая HTML-страница статуса ботов."""
    from shared.health import check_all_bots, format_health_report

    statuses = await check_all_bots()
    body = format_health_report(statuses).replace("\n", "<br>")
    return HTMLResponse(
        "<html><head><meta charset='utf-8'><title>Bot Health</title>"
        "<meta http-equiv='refresh' content='30'>"
        "<style>body{font-family:system-ui;background:#0b0b14;color:#e6e6e6;"
        "padding:24px;line-height:1.7}code{color:#f88}</style></head><body>"
        f"{body}</body></html>"
    )


@app.get("/admin/ai-office", response_class=HTMLResponse)
async def ai_office_dashboard(request: Request):
    """Страница визуального Kanban-дашборда ИИ Офиса."""
    return templates.TemplateResponse("ai_office.html", {"request": request})


@app.get("/api/magazine/brief")
async def get_magazine_brief():
    """Возвращает Google Trends для брифинга журнала."""
    trends = await fetch_google_trends(geo="UZ", limit=10)
    return JSONResponse({"google_trends": trends})
