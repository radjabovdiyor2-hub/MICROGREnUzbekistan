import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from sqlalchemy import text
from shared.config import settings
from shared.database import get_session_ctx
from shared.scheduler import BotScheduler

logger = logging.getLogger(__name__)

async def _get_bot() -> Bot:
    return Bot(
        token=settings.finance_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

async def daily_finance_report() -> None:
    """Ежедневный P&L отчёт в 18:00."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(
                    text(
                        "SELECT "
                        "  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income, "
                        "  COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense "
                        "FROM finances "
                        "WHERE DATE(created_at AT TIME ZONE 'Asia/Samarkand') = "
                        "      (NOW() AT TIME ZONE 'Asia/Samarkand')::date"
                    )
                )
                row = result.fetchone()
            income = row[0] if row else 0
            expense = row[1] if row else 0
            profit = income - expense
            emoji = "📈" if profit >= 0 else "📉"
            await bot.send_message(
                admin_id,
                f"{emoji} <b>Финансы за сегодня:</b>\n\n"
                f"💵 Доход: {'{:,.0f}'.format(income)} сум\n"
                f"💸 Расход: {'{:,.0f}'.format(expense)} сум\n"
                f"{'✅' if profit >= 0 else '🔴'} Прибыль: {'{:,.0f}'.format(profit)} сум",
                parse_mode="HTML",
            )
            logger.info(
                "daily_finance_report: income=%s expense=%s profit=%s",
                income,
                expense,
                profit,
            )
            try:
                from shared.feedback_loop import feedback_loop
                await feedback_loop.evaluate_and_adapt(
                    bot="finance_bot",
                    metric="daily_pnl",
                    current_data={
                        "income": float(income),
                        "expense": float(expense),
                        "profit": float(profit),
                    },
                    benchmark_data={"min_profit_margin": 0.30},
                )
            except Exception as fe:
                logger.warning(f"Finance feedback loop error: {fe}")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("daily_finance_report error: %s", e)

async def overdue_payments() -> None:
    """Заказы с просроченной оплатой (> 3 дней)."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(
                    text(
                        "SELECT id, total_amount, created_at, "
                        "EXTRACT(EPOCH FROM (NOW() - created_at))/86400 AS days_waiting "
                        "FROM orders "
                        "WHERE payment_status = 'pending' "
                        "AND created_at < NOW() - INTERVAL '3 days' "
                        "ORDER BY created_at"
                    )
                )
                rows = result.fetchall()
            if rows:
                lines = [f"🚨 <b>Просроченные платежи (>3 дней):</b> {len(rows)}\n"]
                total = 0
                for row in rows[:15]:
                    oid = row[0]
                    amount = row[1] or 0
                    days = int(row[3])
                    total += amount
                    lines.append(
                        f"• #MG-{oid:04d} — {'{:,.0f}'.format(amount)} сум ({days} дн.)"
                    )
                lines.append(f"\n💰 Итого задолженность: {'{:,.0f}'.format(total)} сум")
                await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
                logger.info("overdue_payments: %d заказов", len(rows))
            else:
                logger.info("overdue_payments: нет просроченных")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("overdue_payments error: %s", e)

async def large_expense_check() -> None:
    """Проверка крупных расходов (> 1,000,000 UZS) за сегодня."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(
                    text(
                        "SELECT id, category, amount, description "
                        "FROM finances "
                        "WHERE type = 'expense' "
                        "AND amount > 1000000 "
                        "AND DATE(created_at AT TIME ZONE 'Asia/Samarkand') = "
                        "      (NOW() AT TIME ZONE 'Asia/Samarkand')::date "
                        "ORDER BY amount DESC"
                    )
                )
                rows = result.fetchall()
            if rows:
                lines = ["🔴 <b>Крупные расходы сегодня:</b>\n"]
                for row in rows:
                    fid = row[0]
                    category = row[1] or "—"
                    amount = row[2]
                    desc = (row[3] or "")[:60]
                    lines.append(
                        f"• #{fid} [{category}]: {'{:,.0f}'.format(amount)} сум — {desc}"
                    )
                await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
                logger.info("large_expense_check: %d записей", len(rows))
            else:
                logger.info("large_expense_check: крупных расходов нет")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("large_expense_check error: %s", e)

async def monthly_pnl() -> None:
    """Полный P&L за прошлый месяц с AI-анализом (1-го числа)."""
    try:
        from shared.ai_engine import AIEngine
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(
                    text(
                        "SELECT "
                        "  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income, "
                        "  COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense, "
                        "  COUNT(*) AS transactions "
                        "FROM finances "
                        "WHERE date >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date "
                        "AND date < DATE_TRUNC('month', CURRENT_DATE)::date"
                    )
                )
                row = result.fetchone()
                cat_result = await session.execute(
                    text(
                        "SELECT type, category, SUM(amount) AS total "
                        "FROM finances "
                        "WHERE date >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date "
                        "AND date < DATE_TRUNC('month', CURRENT_DATE)::date "
                        "GROUP BY type, category ORDER BY total DESC"
                    )
                )
                categories = cat_result.fetchall()
            income = row[0] if row else 0
            expense = row[1] if row else 0
            txn_count = row[2] if row else 0
            profit = income - expense
            margin = (profit / income * 100) if income > 0 else 0

            report_text = (
                f"📊 P&L за прошлый месяц:\n"
                f"Доход: {'{:,.0f}'.format(income)} сум\n"
                f"Расход: {'{:,.0f}'.format(expense)} сум\n"
                f"Прибыль: {'{:,.0f}'.format(profit)} сум\n"
                f"Маржа: {margin:.1f}%\n"
                f"Транзакций: {txn_count}\n"
            )
            if categories:
                report_text += "\nПо категориям:\n"
                for cat in categories:
                    report_text += (
                        f"  {cat[0]}/{cat[1] or '—'}: {'{:,.0f}'.format(cat[2])} сум\n"
                    )

            ai = AIEngine()
            analysis = await ai.chat_completion(
                "Ты финансовый аналитик микрозелени в Узбекистане. Дай краткий анализ (3-5 предложений).",
                f"Проанализируй P&L:\n{report_text}",
                effort="high",
            )

            emoji = "📈" if profit >= 0 else "📉"
            await bot.send_message(
                admin_id,
                f"{emoji} <b>P&L за прошлый месяц:</b>\n\n"
                f"💵 Доход: {'{:,.0f}'.format(income)} сум\n"
                f"💸 Расход: {'{:,.0f}'.format(expense)} сум\n"
                f"{'✅' if profit >= 0 else '🔴'} Прибыль: {'{:,.0f}'.format(profit)} сум\n"
                f"📊 Маржа: {margin:.1f}%\n"
                f"📋 Транзакций: {txn_count}\n\n"
                f"🤖 <b>AI-анализ:</b>\n{analysis}",
                parse_mode="HTML",
            )
            logger.info(
                "monthly_pnl: income=%s expense=%s profit=%s", income, expense, profit
            )
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("monthly_pnl error: %s", e)

async def salary_reminder() -> None:
    """Напоминание о зарплатном фонде (28-го числа)."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(
                    text(
                        "SELECT COUNT(*) AS cnt, COALESCE(SUM(salary), 0) AS total "
                        "FROM employees WHERE status = 'active'"
                    )
                )
                row = result.fetchone()
            count = row[0] if row else 0
            total = row[1] if row else 0
            await bot.send_message(
                admin_id,
                f"💰 <b>Напоминание: послезавтра зарплата!</b>\n\n"
                f"👥 Сотрудников: {count}\n"
                f"💵 Фонд ЗП: {'{:,.0f}'.format(total)} сум\n\n"
                f"Убедитесь, что на счету достаточно средств.",
                parse_mode="HTML",
            )
            logger.info(
                "salary_reminder: %d сотрудников, фонд %s", count, f"{total:,.0f}"
            )
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("salary_reminder error: %s", e)

async def ai_cost_report() -> None:
    """Ежедневный (23:30) отчёт по расходу AI-токенов + бюджет-алерт; запись стоимости дня в P&L."""
    try:
        from shared.ai_usage import build_cost_report
        bot = await _get_bot()
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        try:
            rep = await build_cost_report()
            if admin_id:
                await bot.send_message(admin_id, rep["summary"], parse_mode="HTML")
            cost_usd = float(rep.get("today_cost", 0.0) or 0.0)
            if cost_usd > 0:
                rate = float(getattr(settings, "usd_uzs_rate", 12600.0) or 12600.0)
                async with get_session_ctx() as session:
                    await session.execute(
                        text(
                            "INSERT INTO finances (type, category, amount, description, date, created_at) "
                            "VALUES ('expense', 'ai_tokens', :amt, :desc, CURRENT_DATE, NOW())"
                        ),
                        {
                            "amt": round(cost_usd * rate, 2),
                            "desc": f"AI-токены ${cost_usd:.4f}",
                        },
                    )
            logger.info(
                "ai_cost_report: today=$%.4f over_daily=%s",
                cost_usd,
                rep.get("over_daily"),
            )
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("ai_cost_report error: %s", e)

async def auto_calculate_payroll() -> None:
    """Автоматический расчёт зарплаты 1-го числа каждого месяца."""
    try:
        from bots.finance_bot.handlers.bus_handlers import bus_calculate_payroll
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]

        res = await bus_calculate_payroll({"month": None})
        if res.get("status") == "ok":
            msg = f"💸 <b>Авто-расчёт зарплаты:</b>\n\n{res['message']}"
        else:
            msg = f"❌ Ошибка авто-расчёта зарплаты: {res.get('message')}"

        try:
            await bot.send_message(admin_id, msg, parse_mode="HTML")
            logger.info("auto_calculate_payroll finished.")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("auto_calculate_payroll error: %s", e)

def register_finance_tasks(scheduler: BotScheduler) -> None:
    scheduler.add_cron(name="daily_finance_report", func=daily_finance_report, hour=18, minute=0)
    scheduler.add_interval(name="overdue_payments", func=overdue_payments, seconds=8 * 3600)
    scheduler.add_interval(name="large_expense_check", func=large_expense_check, seconds=4 * 3600)
    scheduler.add_cron(name="monthly_pnl", func=monthly_pnl, hour=9, minute=0, day_of_month=1)
    scheduler.add_cron(name="auto_calculate_payroll", func=auto_calculate_payroll, hour=8, minute=0, day_of_month=1)
    scheduler.add_cron(name="salary_reminder", func=salary_reminder, hour=9, minute=0, day_of_month=28)
    scheduler.add_cron(name="ai_cost_report", func=ai_cost_report, hour=23, minute=30)
