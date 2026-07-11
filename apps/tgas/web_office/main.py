"""
Microgreen Uzbekistan — AI Virtual Office
FastAPI Web Dashboard Backend
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import text

from shared.database import get_session_ctx
from shared.event_bus import event_bus, Events
from shared.utils import format_price
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
    "new", "confirmed", "preparing", "ready", "delivering", "delivered", "cancelled",
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
                "web_office"
            )
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
                            from shared.event_bus import event_bus
                            await event_bus.publish(
                                "IG_MESSAGE_RECEIVED",
                                {
                                    "sender_id": sender_id,
                                    "text": text_content,
                                    "source": data.get("object")
                                },
                                "web_office"
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
            dup = (await session.execute(
                text("SELECT id FROM orders WHERE notes LIKE :m LIMIT 1"),
                {"m": marker + "%"},
            )).scalar()
            if dup:
                return JSONResponse({"status": "duplicate", "order_id": dup})

            # Upsert клиента: по telegram_id, затем по телефону, иначе создаём.
            customer_id = None
            if tid:
                customer_id = (await session.execute(
                    text("SELECT id FROM customers WHERE telegram_id = :tid"), {"tid": tid},
                )).scalar()
            if not customer_id and phone:
                customer_id = (await session.execute(
                    text("SELECT id FROM customers WHERE phone = :phone ORDER BY id LIMIT 1"),
                    {"phone": phone},
                )).scalar()
            if not customer_id:
                customer_id = (await session.execute(
                    text(
                        "INSERT INTO customers (name, phone, telegram_id, bonus_balance, source, "
                        "status, customer_type, city) VALUES (:name, :phone, :tid, :bonus, 'webapp', "
                        "'active', 'b2c', 'Samarqand') RETURNING id"
                    ),
                    {"name": name, "phone": phone, "tid": tid, "bonus": bonus_balance},
                )).scalar()
            else:
                # Дополняем недостающие контакты; баланс бонусов зеркалим из витрины.
                await session.execute(
                    text(
                        "UPDATE customers SET telegram_id = COALESCE(telegram_id, :tid), "
                        "phone = COALESCE(phone, :phone), "
                        "name = COALESCE(NULLIF(name, ''), :name), "
                        "bonus_balance = :bonus WHERE id = :cid"
                    ),
                    {"tid": tid, "phone": phone, "name": name, "bonus": bonus_balance, "cid": customer_id},
                )

            # Заказ. order_number = NULL → триггер выдаст MG-XXXXXX.
            new = (await session.execute(
                text(
                    "INSERT INTO orders (customer_id, total_amount, delivery_fee, discount_amount, "
                    "status, payment_status, payment_method, delivery_address, notes, created_at, "
                    "updated_at) VALUES (:cid, :total, :delivery, :discount, 'new', 'pending', "
                    ":pmethod, :addr, :notes, NOW(), NOW()) RETURNING id, order_number"
                ),
                {"cid": customer_id, "total": total, "delivery": delivery_fee,
                 "discount": discount, "pmethod": pay_method, "addr": address, "notes": notes},
            )).fetchone()
            order_id, order_number = new[0], new[1]

            # Позиции заказа: матчим товар витрины к офисному по storefront_id
            # (каталог синкается shared.catalog_sync). Ненайденные строки просто
            # пропускаем — детализация всё равно есть в notes/items_summary.
            for line in (body.get("items") or []):
                sid = str(line.get("storefront_id") or "").strip()
                qty = _safe_float(line.get("quantity")) or 1
                price = _safe_float(line.get("price"))
                if not sid:
                    continue
                prod = (await session.execute(
                    text("SELECT id, unit FROM products WHERE storefront_id = :sid"), {"sid": sid},
                )).fetchone()
                if not prod:
                    # Создаем заглушку, которую потом обновит catalog_sync
                    pname = str(line.get("name") or line.get("nameRu") or "Неизвестный товар").strip()
                    pid = (await session.execute(
                        text("INSERT INTO products (name_uz, name_ru, category, price, unit, stock_qty, is_active, storefront_id) "
                             "VALUES (:n, :n, 'sets', :price, 'piece', 0, TRUE, :sid) RETURNING id"),
                        {"n": pname, "price": price, "sid": sid}
                    )).scalar()
                    prod = (pid, "piece")
                await session.execute(text(
                    "INSERT INTO order_items (order_id, product_id, quantity, unit, unit_price, "
                    "total_price) VALUES (:oid, :pid, :qty, :unit, :price, :total)"
                ), {"oid": order_id, "pid": prod[0], "qty": qty, "unit": prod[1] or "piece",
                    "price": price, "total": price * qty})

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
                {"cid": customer_id, "oid": order_id,
                 "summary": f"Заказ {order_number} (витрина {ext_number}) на "
                            f"{format_price(total)}: {items_summary[:150]}"},
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
        ext_number, order_id, order_number,
    )
    return JSONResponse({"status": "ok", "order_id": order_id, "order_number": order_number})


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
            row = (await session.execute(
                text(
                    "UPDATE orders SET status = COALESCE(:status, status), "
                    "payment_status = COALESCE(:pstatus, payment_status), updated_at = NOW() "
                    "WHERE notes LIKE :m RETURNING id, order_number, status"
                ),
                {"status": status, "pstatus": payment_status, "m": marker + "%"},
            )).fetchone()
    except Exception as exc:
        logger.exception("Ingest-status: не удалось обновить заказ %s: %s", ext_number, exc)
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
    logger.info("Ingest-status: заказ %s (%s) → %s", order_number, ext_number, new_status)
    return JSONResponse({"status": "ok", "order_id": order_id, "order_number": order_number})


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
            row = (await session.execute(
                text(
                    "UPDATE orders SET status = :s, updated_at = NOW() "
                    "WHERE id = :id RETURNING order_number, notes"
                ),
                {"s": status, "id": order_id},
            )).fetchone()
    except Exception as exc:
        logger.exception("Order-status: не удалось обновить заказ #%s: %s", order_id, exc)
        return JSONResponse({"error": "update failed"}, status_code=500)

    if not row:
        return JSONResponse({"error": "not found"}, status_code=404)
    order_number, notes = row[0], row[1] or ""

    await event_bus.publish(
        Events.ORDER_STATUS_CHANGED,
        {"order_id": order_id, "order_number": order_number, "status": status, "source": "office"},
        source_bot="web_office",
    )

    # Заказ витрины → синкаем обратно (обновит microgreen_db + уведомит клиента).
    m = _WEBAPP_MARKER.search(notes)
    if m and STOREFRONT_STATUS_URL:
        ext_number = m.group(1)
        try:
            async with get_session_ctx() as session:
                await session.execute(
                    text("INSERT INTO storefront_outbox (order_number, status) VALUES (:num, :stat)"),
                    {"num": ext_number, "stat": status}
                )
                await session.commit()
        except Exception as exc:
            logger.warning("Order-status: не удалось сохранить в outbox (%s): %s", ext_number, exc)

    logger.info("Order-status: заказ #%s (%s) → %s", order_id, order_number, status)
    return JSONResponse({"status": "ok", "order_number": order_number, "new_status": status})


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
                customer_id = (await session.execute(
                    text("SELECT id FROM customers WHERE telegram_id = :tid"), {"tid": tid},
                )).scalar()
            if not customer_id and phone:
                customer_id = (await session.execute(
                    text("SELECT id FROM customers WHERE phone = :phone ORDER BY id LIMIT 1"),
                    {"phone": phone},
                )).scalar()
            is_new = customer_id is None
            if is_new:
                customer_id = (await session.execute(
                    text(
                        "INSERT INTO customers (name, phone, telegram_id, bonus_balance, language, "
                        "source, status, customer_type, city) VALUES (:name, :phone, :tid, :bonus, "
                        ":lang, 'webapp', 'lead', 'b2c', 'Samarqand') RETURNING id"
                    ),
                    {"name": name, "phone": phone, "tid": tid, "bonus": bonus, "lang": language},
                )).scalar()
            else:
                await session.execute(
                    text(
                        "UPDATE customers SET telegram_id = COALESCE(telegram_id, :tid), "
                        "phone = COALESCE(phone, :phone), name = COALESCE(NULLIF(name, ''), :name), "
                        "bonus_balance = :bonus WHERE id = :cid"
                    ),
                    {"tid": tid, "phone": phone, "name": name, "bonus": bonus, "cid": customer_id},
                )
    except Exception as exc:
        logger.exception("Ingest-customer: ошибка (%s): %s", phone or tid, exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    if is_new:
        await event_bus.publish(
            Events.CUSTOMER_REGISTERED,
            {"customer_id": customer_id, "telegram_id": tid, "name": name,
             "phone": phone, "source": "webapp"},
            source_bot="web_office",
        )
    logger.info("Ingest-customer: %s клиент #%s", "новый" if is_new else "обновлён", customer_id)
    return JSONResponse({"status": "ok", "customer_id": customer_id, "is_new": is_new})


def _check_ingest_secret(request: Request) -> bool:
    return not INGEST_SECRET or request.headers.get("X-Ingest-Secret") == INGEST_SECRET


async def _find_customer(session, tid, phone):
    """Найти клиента по telegram_id, затем по телефону (best-effort)."""
    if tid:
        cid = (await session.execute(
            text("SELECT id FROM customers WHERE telegram_id = :tid"), {"tid": tid},
        )).scalar()
        if cid:
            return cid
    if phone:
        return (await session.execute(
            text("SELECT id FROM customers WHERE phone = :phone ORDER BY id LIMIT 1"),
            {"phone": phone},
        )).scalar()
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
            await session.execute(text(
                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                "VALUES (:cid, 'website', 'complaint', 'web_office', :s)"
            ), {"cid": customer_id, "s": f"Обращение от {name}: {message[:400]}"})
    except Exception as exc:
        logger.exception("Ingest-support: ошибка: %s", exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.COMPLAINT_RECEIVED,
        {"customer_name": name, "phone": phone, "summary": message, "source": "website"},
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
                customer_id = (await session.execute(text(
                    "INSERT INTO customers (name, company_name, phone, customer_type, status, "
                    "source, city) VALUES (:name, :company, :phone, 'b2b', 'lead', 'website', "
                    "'Samarqand') RETURNING id"
                ), {"name": contact or company or "B2B-лид", "company": company, "phone": phone})).scalar()
            await session.execute(text(
                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                "VALUES (:cid, 'website', 'b2b_lead', 'web_office', :s)"
            ), {"cid": customer_id, "s": f"B2B-заявка: {company or contact}. {message[:300]}"})
    except Exception as exc:
        logger.exception("Ingest-lead: ошибка: %s", exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.B2B_LEAD_CREATED,
        {"customer_id": customer_id, "company_name": company, "contact_name": contact,
         "phone": phone, "summary": message, "source": "website"},
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
            await session.execute(text(
                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                "VALUES (:cid, 'website', 'feedback', 'web_office', :s)"
            ), {"cid": customer_id, "s": f"Отзыв {rating}★ на «{product}»: {comment[:300]}"})
    except Exception as exc:
        logger.exception("Ingest-feedback: ошибка: %s", exc)
        return JSONResponse({"error": "ingest failed"}, status_code=500)

    await event_bus.publish(
        Events.FEEDBACK_RECEIVED,
        {"customer_name": name, "product": product, "rating": rating,
         "comment": comment, "source": "website"},
        source_bot="web_office",
    )
    logger.info("Ingest-feedback: отзыв %s★ на %s", rating, product)
    return JSONResponse({"status": "ok"})


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
                departments.append({
                    "id": dept_id,
                    "name": meta["name"],
                    "bot": meta["bot"],
                    "icon": meta["icon"],
                    "status": "online",
                    "tasks_total": total,
                    "tasks_done": stats.get("done", 0),
                    "tasks_in_progress": stats.get("in_progress", 0),
                    "tasks_todo": stats.get("todo", 0),
                })
    except Exception as exc:
        logger.warning("departments_summary error: %s", exc)
        # Fallback: return meta without stats
        for dept_id, meta in DEPARTMENT_META.items():
            departments.append({
                "id": dept_id,
                "name": meta["name"],
                "bot": meta["bot"],
                "icon": meta["icon"],
                "status": "unknown",
                "tasks_total": 0,
                "tasks_done": 0,
                "tasks_in_progress": 0,
                "tasks_todo": 0,
            })
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
                tasks_list.append({
                    "id": row[0],
                    "title": row[1] or "—",
                    "assignee": row[2] or "—",
                    "status": row[3] or "todo",
                    "priority": row[4] or "medium",
                    "deadline": _safe_str(row[5]),
                    "created_at": _safe_str(row[6]),
                })

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
            stats["total"] = sum(
                v for k, v in stats.items() if k != "overdue"
            )

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

    return JSONResponse({
        "success": True,
        "department": {
            "id": dept_id,
            **meta,
            "stats": stats,
            "tasks": tasks_list,
        },
    })


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
                rows = (await session.execute(
                    text("SELECT id, order_number, status FROM storefront_outbox ORDER BY id ASC LIMIT 50")
                )).fetchall()

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
                                        text("DELETE FROM storefront_outbox WHERE id = :id"),
                                        {"id": outbox_id}
                                    )
                                    await session.commit()
                            except Exception as exc:
                                logger.warning("Outbox: синк на витрину не удался (%s): %s", ext_number, exc)
                                break # Stop processing and retry later
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
