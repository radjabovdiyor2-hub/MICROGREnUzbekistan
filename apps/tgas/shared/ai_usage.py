"""shared/ai_usage.py — Персистентный учёт расхода AI-токенов + отчёт по стоимости.

`UsageStats` в `ai_engine` считает стоимость в памяти каждого экземпляра `AIEngine()`
и теряет её при сборке мусора. Здесь мы пишем КАЖДЫЙ вызов в таблицу `ai_usage` (БД)
и строим агрегированный отчёт по дню/боту/модели для finance_bot + бюджет-алерт.

Всё best-effort: сбой БД никогда не роняет генерацию (в ai_engine персист вызывается
через fire-and-forget task).

Таблица (см. database/init.sql):
    ai_usage(id, bot, provider, model, input_tokens, output_tokens, cost_usd, created_at)
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def record_ai_usage(
    bot_name: str,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
) -> None:
    """Best-effort запись одного AI-вызова в `ai_usage`. Ошибку глотаем (не роняем бота)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO ai_usage "
                    "(bot, provider, model, input_tokens, output_tokens, cost_usd, created_at) "
                    "VALUES (:bot, :provider, :model, :inp, :out, :cost, NOW())"
                ),
                {
                    "bot": (bot_name or "unknown")[:64],
                    "provider": (provider or "")[:32],
                    "model": (model or "")[:64],
                    "inp": int(input_tokens or 0),
                    "out": int(output_tokens or 0),
                    "cost": float(cost_usd or 0.0),
                },
            )
    except Exception as e:  # noqa: BLE001
        logger.debug("record_ai_usage skip: %s", e)


async def build_cost_report() -> dict:
    """
    Отчёт по стоимости AI: сегодня + месяц-к-дате, разбивка по боту и модели,
    сравнение с бюджетами (`ai_daily_budget_usd` / `ai_monthly_budget_usd`).
    Возвращает dict с готовым `summary` (HTML для Telegram) и флагами превышения.
    """
    from shared.config import settings
    from shared.database import get_session_ctx
    from sqlalchemy import text

    daily_budget = float(getattr(settings, "ai_daily_budget_usd", 0.0) or 0.0)
    monthly_budget = float(getattr(settings, "ai_monthly_budget_usd", 0.0) or 0.0)

    today_cost = month_cost = 0.0
    today_tokens = today_calls = 0
    by_bot: list[tuple[str, float]] = []
    by_model: list[tuple[str, float, int]] = []

    try:
        async with get_session_ctx() as session:
            row = (await session.execute(text(
                "SELECT COALESCE(SUM(cost_usd),0), COALESCE(SUM(input_tokens+output_tokens),0), COUNT(*) "
                "FROM ai_usage WHERE created_at::date = CURRENT_DATE"
            ))).first()
            if row:
                today_cost, today_tokens, today_calls = float(row[0]), int(row[1]), int(row[2])

            mrow = (await session.execute(text(
                "SELECT COALESCE(SUM(cost_usd),0) FROM ai_usage "
                "WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)"
            ))).first()
            if mrow:
                month_cost = float(mrow[0])

            by_bot = [(str(r[0]), float(r[1])) for r in (await session.execute(text(
                "SELECT bot, SUM(cost_usd) c FROM ai_usage WHERE created_at::date = CURRENT_DATE "
                "GROUP BY bot ORDER BY c DESC LIMIT 8"
            ))).all()]

            by_model = [(str(r[0]), float(r[1]), int(r[2])) for r in (await session.execute(text(
                "SELECT model, SUM(cost_usd) c, SUM(input_tokens+output_tokens) t FROM ai_usage "
                "WHERE created_at::date = CURRENT_DATE GROUP BY model ORDER BY c DESC LIMIT 6"
            ))).all()]
            configured = True
    except Exception as e:  # noqa: BLE001
        logger.warning("build_cost_report: БД недоступна: %s", e)
        configured = False

    over_daily = bool(daily_budget) and today_cost > daily_budget
    over_monthly = bool(monthly_budget) and month_cost > monthly_budget

    lines = [
        "💸 <b>Расход AI-токенов (за сутки)</b>",
        f"Сегодня: <b>${today_cost:.4f}</b> · {today_tokens:,} токенов · {today_calls} вызовов",
        f"Месяц-к-дате: <b>${month_cost:.4f}</b>"
        + (f" / бюджет ${monthly_budget:.0f}" if monthly_budget else ""),
    ]
    if daily_budget:
        pct = (today_cost / daily_budget * 100) if daily_budget else 0
        lines.append(f"Дневной бюджет: ${daily_budget:.2f} — использовано {pct:.0f}%")
    if by_bot:
        lines.append("\n🤖 По ботам (сегодня):")
        lines += [f"  • {b} — ${c:.4f}" for b, c in by_bot]
    if by_model:
        lines.append("\n🧠 По моделям (сегодня):")
        lines += [f"  • {m} — ${c:.4f} ({t:,} tok)" for m, c, t in by_model]
    if over_daily:
        lines.append(f"\n🚨 <b>Превышен ДНЕВНОЙ бюджет</b> (${today_cost:.2f} &gt; ${daily_budget:.2f})")
    if over_monthly:
        lines.append(f"\n🚨 <b>Превышен МЕСЯЧНЫЙ бюджет</b> (${month_cost:.2f} &gt; ${monthly_budget:.2f})")
    if not configured:
        lines.append("\n⚠️ Данные недоступны (таблица ai_usage не создана / БД не отвечает).")

    return {
        "today_cost": round(today_cost, 6),
        "month_cost": round(month_cost, 6),
        "today_tokens": today_tokens,
        "over_daily": over_daily,
        "over_monthly": over_monthly,
        "configured": configured,
        "summary": "\n".join(lines),
    }
