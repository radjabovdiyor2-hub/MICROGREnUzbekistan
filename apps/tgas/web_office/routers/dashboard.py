from datetime import date, datetime
import logging
from typing import Dict, List, Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import text
from pathlib import Path

from shared.database import get_session_ctx
from shared.health import check_all_bots, format_health_report

logger = logging.getLogger(__name__)

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

AI_BOTS: List[Dict[str, str]] = [
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
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.strftime("%d.%m.%Y")
    return str(value)

def _safe_float(value: Any) -> float:
    try:
        return float(value) if value is not None else 0.0
    except (ValueError, TypeError):
        return 0.0

def _safe_int(value: Any) -> int:
    try:
        return int(value) if value is not None else 0
    except (ValueError, TypeError):
        return 0

@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request) -> Any:
    tasks: List[Dict[str, Any]] = []
    finances: List[Dict[str, Any]] = []
    recent_orders: List[Dict[str, Any]] = []
    customers: List[Dict[str, Any]] = []
    inventory: List[Dict[str, Any]] = []
    interactions: List[Dict[str, Any]] = []
    funnel: Dict[str, int] = {"lead": 0, "active": 0, "vip": 0, "churned": 0}
    stats: Dict[str, int] = {
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

            result = await session.execute(text("SELECT COUNT(*) FROM customers"))
            stats["total_customers"] = _safe_int(result.scalar())

            result = await session.execute(text("SELECT COUNT(*) FROM employees"))
            stats["total_employees"] = _safe_int(result.scalar())

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
                logger.warning("Сводка: таблица inventory не прочитана: %s", exc)
                inventory = []

            result = await session.execute(
                text("SELECT status, COUNT(*) FROM customers GROUP BY status")
            )
            for status, cnt in result.fetchall():
                funnel[status] = cnt

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

@router.get("/funnel", response_class=HTMLResponse)
async def b2b_funnel(request: Request) -> Any:
    total_b2b = new_today = contacted = converted = 0
    by_channel: List[Any] = []
    by_source: List[Any] = []
    try:
        async with get_session_ctx() as session:
            total_b2b = _safe_int(
                (
                    await session.execute(
                        text("SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b'")
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

    def bar(part: float, whole: float) -> int:
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

@router.get("/learnings", response_class=HTMLResponse)
async def learnings_dashboard() -> Any:
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

@router.get("/health/bots", response_class=HTMLResponse)
async def health_bots_view() -> Any:
    statuses = await check_all_bots()
    body = format_health_report(statuses).replace("\n", "<br>")
    return HTMLResponse(
        "<html><head><meta charset='utf-8'><title>Bot Health</title>"
        "<meta http-equiv='refresh' content='30'>"
        "<style>body{font-family:system-ui;background:#0b0b14;color:#e6e6e6;"
        "padding:24px;line-height:1.7}code{color:#f88}</style></head><body>"
        f"{body}</body></html>"
    )

@router.get("/admin/ai-office", response_class=HTMLResponse)
async def ai_office_dashboard(request: Request) -> Any:
    return templates.TemplateResponse("ai_office.html", {"request": request})
