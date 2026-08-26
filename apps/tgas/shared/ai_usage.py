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
from typing import Optional

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


# ── Бюджет как ограничитель, а не надпись ────────────────────────────────
#
# Бюджеты существовали только для отчёта finance-бота в 23:30: до этой правки
# ни один вызов модели с ними не сверялся. Потолок, о котором узнаёшь на
# следующий день, потолком не является.
#
# Второе, что здесь чинится, — источник числа. Владелец правит «Дневной бюджет
# ИИ» в админке, и это пишется в `app_settings`; боты же читали
# `settings.ai_daily_budget_usd` из окружения. Поле в админке до офиса не
# доезжало вовсе. Теперь порядок такой же, как у рубильника `ai.enabled`:
# сначала настройка из общей таблицы, окружение — запасной вариант.
#
# Ноль = без предела. Это соглашение уже действует в `build_cost_report`
# (`bool(daily_budget) and ...`), и второе прочтение того же нуля означало бы,
# что одна и та же цифра в админке для отчёта — «безлимит», а для вызова —
# «запрещено всё».

_BUDGET_TTL_SECONDS = 60.0
_budget_cache: tuple[float, Optional[str]] = (0.0, None)


async def budget_block_reason() -> Optional[str]:
    """Причина отказа, если бюджет ИИ исчерпан, иначе None.

    Проверка стоит перед КАЖДЫМ вызовом модели, поэтому она обязана быть
    дешёвой: результат держится минуту, как и у `settings_store`. Минута —
    это верхняя граница перерасхода, а не окно, в котором ограничения нет.

    Ошибка чтения — считаем, что предел не достигнут: недоступная база не
    должна выключать офис. Осторожность в ту же сторону, что и у рубильника.
    """
    import time

    global _budget_cache
    now = time.monotonic()
    cached_at, cached_reason = _budget_cache
    if cached_at and now - cached_at < _BUDGET_TTL_SECONDS:
        return cached_reason

    reason: Optional[str] = None
    try:
        from shared import settings_store
        from shared.config import settings
        from shared.database import get_session_ctx
        from sqlalchemy import text

        daily_budget = await settings_store.get_float(
            "ai.dailyBudgetUsd", float(getattr(settings, "ai_daily_budget_usd", 0.0) or 0.0)
        )
        monthly_budget = await settings_store.get_float(
            "ai.monthlyBudgetUsd", float(getattr(settings, "ai_monthly_budget_usd", 0.0) or 0.0)
        )

        if daily_budget or monthly_budget:
            async with get_session_ctx() as session:
                row = (
                    await session.execute(
                        text(
                            "SELECT COALESCE(SUM(cost_usd) FILTER (WHERE created_at::date = CURRENT_DATE), 0), "
                            "COALESCE(SUM(cost_usd) FILTER (WHERE date_trunc('month', created_at) "
                            "= date_trunc('month', CURRENT_DATE)), 0) FROM ai_usage"
                        )
                    )
                ).first()
            today_cost = float(row[0]) if row else 0.0
            month_cost = float(row[1]) if row else 0.0

            if daily_budget and today_cost > daily_budget:
                reason = (
                    f"дневной бюджет ИИ исчерпан: ${today_cost:.2f} из ${daily_budget:.2f}. "
                    "Поднимите предел в админке (Настройки → ИИ) или дождитесь завтра."
                )
            elif monthly_budget and month_cost > monthly_budget:
                reason = (
                    f"месячный бюджет ИИ исчерпан: ${month_cost:.2f} из ${monthly_budget:.2f}. "
                    "Поднимите предел в админке (Настройки → ИИ)."
                )
    except Exception as exc:  # noqa: BLE001 — причина не важна, важен ответ
        logger.debug("Бюджет ИИ не проверен (%s) — считаем, что предел не достигнут", exc)
        reason = None

    _budget_cache = (now, reason)
    return reason


def reset_budget_cache() -> None:
    """Забыть последний ответ — для тестов и для правки бюджета «сейчас»."""
    global _budget_cache
    _budget_cache = (0.0, None)


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
            row = (
                await session.execute(
                    text(
                        "SELECT COALESCE(SUM(cost_usd),0), COALESCE(SUM(input_tokens+output_tokens),0), COUNT(*) "
                        "FROM ai_usage WHERE created_at::date = CURRENT_DATE"
                    )
                )
            ).first()
            if row:
                today_cost, today_tokens, today_calls = (
                    float(row[0]),
                    int(row[1]),
                    int(row[2]),
                )

            mrow = (
                await session.execute(
                    text(
                        "SELECT COALESCE(SUM(cost_usd),0) FROM ai_usage "
                        "WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)"
                    )
                )
            ).first()
            if mrow:
                month_cost = float(mrow[0])

            by_bot = [
                (str(r[0]), float(r[1]))
                for r in (
                    await session.execute(
                        text(
                            "SELECT bot, SUM(cost_usd) c FROM ai_usage WHERE created_at::date = CURRENT_DATE "
                            "GROUP BY bot ORDER BY c DESC LIMIT 8"
                        )
                    )
                ).all()
            ]

            by_model = [
                (str(r[0]), float(r[1]), int(r[2]))
                for r in (
                    await session.execute(
                        text(
                            "SELECT model, SUM(cost_usd) c, SUM(input_tokens+output_tokens) t FROM ai_usage "
                            "WHERE created_at::date = CURRENT_DATE GROUP BY model ORDER BY c DESC LIMIT 6"
                        )
                    )
                ).all()
            ]
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
        lines.append(
            f"\n🚨 <b>Превышен ДНЕВНОЙ бюджет</b> (${today_cost:.2f} &gt; ${daily_budget:.2f})"
        )
    if over_monthly:
        lines.append(
            f"\n🚨 <b>Превышен МЕСЯЧНЫЙ бюджет</b> (${month_cost:.2f} &gt; ${monthly_budget:.2f})"
        )
    if not configured:
        lines.append(
            "\n⚠️ Данные недоступны (таблица ai_usage не создана / БД не отвечает)."
        )

    return {
        "today_cost": round(today_cost, 6),
        "month_cost": round(month_cost, 6),
        "today_tokens": today_tokens,
        "over_daily": over_daily,
        "over_monthly": over_monthly,
        "configured": configured,
        "summary": "\n".join(lines),
    }
