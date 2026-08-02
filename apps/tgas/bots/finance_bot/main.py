"""Finance Bot — main.py с EventBus интеграцией"""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from shared.notifications import register_finance_handlers
from bots.finance_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.finance_bot.handlers.start import ai_fin
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Scheduler ────────────────────────────────────────────────────────────
scheduler = BotScheduler("finance_bot")


async def daily_finance_report():
    """Ежедневный P&L отчёт в 18:00."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        bot = Bot(
            token=settings.finance_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
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
            # Замыкаем петлю: Финансы (замер маржи -> вывод -> адаптация порогов затрат)
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


async def overdue_payments():
    """Заказы с просроченной оплатой (> 3 дней)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        bot = Bot(
            token=settings.finance_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
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


async def large_expense_check():
    """Проверка крупных расходов (> 1,000,000 UZS) за сегодня."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        bot = Bot(
            token=settings.finance_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
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


async def monthly_pnl():
    """Полный P&L за прошлый месяц с AI-анализом (1-го числа)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.ai_engine import AIEngine

        bot = Bot(
            token=settings.finance_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                # Считаем по колонке date — это ДЕЛОВАЯ дата операции, её можно
                # проставить задним числом. Раньше здесь стоял created_at, то есть
                # момент ВНЕСЕНИЯ строки: расход за январь, занесённый в феврале,
                # в январский P&L не попадал. По date считают все остальные отчёты
                # системы (analytics, Стёпан и экран баланса самого finance —
                # handlers/start.py), поэтому суммы расходились между экранами.
                # Плюс date это DATE: границы месяца однозначны, без часовых поясов.
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
                # Breakdown by category
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

            # AI analysis
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


async def salary_reminder():
    """Напоминание о зарплатном фонде (28-го числа)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        bot = Bot(
            token=settings.finance_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
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


async def ai_cost_report():
    """Ежедневный (23:30) отчёт по расходу AI-токенов + бюджет-алерт; запись стоимости дня в P&L."""
    try:
        from shared.ai_usage import build_cost_report

        bot = Bot(
            token=settings.finance_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        try:
            rep = await build_cost_report()
            if admin_id:
                await bot.send_message(admin_id, rep["summary"], parse_mode="HTML")
            # Стоимость AI за день → в P&L (finances) как расход в сумах (по курсу USD→UZS).
            cost_usd = float(rep.get("today_cost", 0.0) or 0.0)
            if cost_usd > 0:
                from shared.database import get_session_ctx
                from sqlalchemy import text

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


# ── Регистрация задач финансового мониторинга ────────────────────────────
scheduler.add_cron(
    name="daily_finance_report", func=daily_finance_report, hour=18, minute=0
)
scheduler.add_interval(name="overdue_payments", func=overdue_payments, seconds=8 * 3600)
scheduler.add_interval(
    name="large_expense_check", func=large_expense_check, seconds=4 * 3600
)
scheduler.add_cron(
    name="monthly_pnl", func=monthly_pnl, hour=9, minute=0, day_of_month=1
)
scheduler.add_cron(
    name="salary_reminder", func=salary_reminder, hour=9, minute=0, day_of_month=28
)
# Расход AI-токенов: ежедневный отчёт в 23:30 (день почти закрыт) + бюджет-алерт.
scheduler.add_cron(name="ai_cost_report", func=ai_cost_report, hour=23, minute=30)


# ═══════════════════════════════════════════════════════════════════════════
# BOT BUS HANDLERS — задачи от Степана
# ═══════════════════════════════════════════════════════════════════════════


async def bus_get_balance(params: dict) -> dict:
    """P&L за текущий месяц."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT "
                    "  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income, "
                    "  COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense "
                    "FROM finances "
                    "WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) "
                    "AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)"
                )
            )
            row = res.fetchone()
        income = float(row[0]) if row else 0
        expense = float(row[1]) if row else 0
        profit = income - expense
        return {
            "status": "ok",
            "message": f"Доход: {income:,.0f}, Расход: {expense:,.0f}, Прибыль: {profit:,.0f}",
            "data": {"income": income, "expense": expense, "profit": profit},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def bus_add_expense(params: dict) -> dict:
    """Записать расход в базу."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        amount = params.get("amount")
        category = params.get("category", "other")
        description = params.get("description", "")
        if not amount:
            return {"status": "error", "message": "Не указана сумма (amount)"}
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO finances (type, category, amount, description, date, created_at) "
                    "VALUES ('expense', :cat, :amt, :desc, CURRENT_DATE, NOW())"
                ),
                {"cat": category, "amt": float(amount), "desc": description},
            )
            await session.commit()
        return {"status": "ok", "message": f"Расход {amount} сум ({category}) записан"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def handle_task_created(payload: dict):
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "finance":
        return
    chat_id = data.get("chat_id")
    data.get("task_id")
    if not chat_id:
        return

    bot = Bot(
        token=settings.finance_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.task_executor import execute_bot_task
        from shared.prompts import TEAM_CONTEXT

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Финансовый Директор (CFO) и главный Finance Bot. Мысли категориями P&L, Cash Flow, ROI, Unit Economics. Не будь простым калькулятором, давай стратегические советы по оптимизации костов и увеличению чистой прибыли."
        
        logging.info("FINANCE BOT passing task to TaskExecutor...")
        await execute_bot_task(
            bot=bot,
            bot_name="finance_bot",
            department="finance",
            task_data=data,
            team_context=sys_prompt
        )
        logging.info("FINANCE BOT successfully handled task.")

    except Exception as e:
        logging.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()


async def handle_payment_received(payload: dict):
    """Регистрируем оплату в таблице finances"""
    data = payload.get("data", {})
    order_id = data.get("order_id")
    amount = data.get("amount", 0)

    if not order_id or not amount:
        return

    import logging

    logging.info(
        f"FINANCE BOT: оплата заказа {order_id}: {amount} UZS (доход уже учтён при создании заказа)"
    )
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode
    from shared.config import settings

    # Доход по заказу учитывается ОДИН раз — при его создании (order_created → finance_on_order_created).
    # Здесь доход повторно НЕ пишем, только подтверждаем поступление оплаты (иначе доход задваивался).
    try:
        bot = Bot(
            token=settings.finance_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        admin_id = settings.admin_telegram_ids[0]
        try:
            await bot.send_message(
                admin_id,
                f"✅ <b>Поступление оплаты!</b>\n\nСумма: {amount:,.0f} UZS\nЗаказ ID: {order_id}",
            )
        except Exception:
            pass
        finally:
            await bot.session.close()
    except Exception as e:
        logging.error(f"Error handling payment_received: {e}")


async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("finance_bot", payload)


async def main():
    if not settings.finance_bot_token:
        logger.error("FATAL: FINANCE_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.finance_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.task_ui import task_ui_router

    dp.include_router(task_ui_router)
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        ai_fin,
        wake_words=["отдел финанс", "финансы", "finance", "бюджет", "касса"],
    )
    dp.include_router(group_router)

    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("PAYMENT_RECEIVED", handle_payment_received)
    register_finance_handlers(event_bus, bot)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8085)

    # Heartbeat + Scheduler
    asyncio.create_task(start_heartbeat("finance_bot"))
    await scheduler.start()

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen

    asyncio.create_task(
        bus_listen(
            "finance_bot",
            {
                "get_balance": bus_get_balance,
                "add_expense": bus_add_expense,
            },
        )
    )

    logger.info("Starting Finance Bot...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
