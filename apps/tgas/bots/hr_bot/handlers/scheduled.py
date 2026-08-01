import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings
from shared.scheduler import BotScheduler

logger = logging.getLogger(__name__)

async def payroll_reminder() -> None:
    """Напоминание о зарплате за 5 дней (25-го числа)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        bot = Bot(
            token=settings.hr_bot_token,
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
                f"💰 <b>Напоминание:</b> через 5 дней зарплата.\n"
                f"Сотрудников: {count}\n"
                f"Фонд: {'{:,.0f}'.format(total)} сум",
                parse_mode="HTML",
            )
            logger.info(
                "payroll_reminder: %d сотрудников, фонд %s", count, f"{total:,.0f}"
            )
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("payroll_reminder error: %s", e)

async def employee_report() -> None:
    """Ежедневная сводка по сотрудникам."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        bot = Bot(
            token=settings.hr_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(
                    text("SELECT status, COUNT(*) FROM employees GROUP BY status")
                )
                rows = result.fetchall()
            status_map = {r[0]: r[1] for r in rows}
            active = status_map.get("active", 0)
            inactive = status_map.get("inactive", 0)
            on_leave = status_map.get("on_leave", 0)
            total = sum(status_map.values())
            await bot.send_message(
                admin_id,
                f"👥 <b>Сводка по сотрудникам:</b>\n\n"
                f"✅ Активных: {active}\n"
                f"❌ Неактивных: {inactive}\n"
                f"🏖 В отпуске: {on_leave}\n"
                f"\nВсего: {total}",
                parse_mode="HTML",
            )
            logger.info(
                "employee_report: active=%d inactive=%d on_leave=%d",
                active,
                inactive,
                on_leave,
            )
            try:
                from shared.feedback_loop import feedback_loop
                await feedback_loop.evaluate_and_adapt(
                    bot="hr_bot",
                    metric="task_completion_rate",
                    current_data={
                        "active": active,
                        "inactive": inactive,
                        "on_leave": on_leave,
                        "total": total,
                    },
                    benchmark_data={"target_active_ratio": 0.85},
                )
            except Exception as fe:
                logger.warning(f"HR feedback loop error: {fe}")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("employee_report error: %s", e)

async def new_applications_check() -> None:
    """Проверить необработанные обращения за 24 часа."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        bot = Bot(
            token=settings.hr_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(
                    text(
                        "SELECT i.id, i.interaction_type, i.summary, c.name "
                        "FROM interactions i "
                        "LEFT JOIN customers c ON c.id = i.customer_id "
                        "WHERE i.interaction_type IN ('b2b_lead', 'inquiry') "
                        "AND i.created_at > NOW() - INTERVAL '24 hours' "
                        "ORDER BY i.created_at DESC"
                    )
                )
                rows = result.fetchall()
            if rows:
                lines = [f"📨 <b>Необработанные обращения (24ч):</b> {len(rows)}\n"]
                for row in rows[:15]:
                    itype = row[1] or "—"
                    name = row[3] or "Аноним"
                    notes = (row[2] or "")[:50]
                    lines.append(f"• [{itype}] {name}: {notes}")
                if len(rows) > 15:
                    lines.append(f"\n... и ещё {len(rows) - 15}")
                await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
                logger.info("new_applications_check: %d обращений", len(rows))
            else:
                logger.info("new_applications_check: всё обработано")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("new_applications_check error: %s", e)

async def training_reminder() -> None:
    """Понедельник — напоминание об обучении."""
    try:
        bot = Bot(
            token=settings.hr_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        admin_id = settings.admin_telegram_ids[0]
        try:
            await bot.send_message(
                admin_id,
                "📚 <b>Понедельник — день обучения.</b>\n"
                "Запланируйте тренинг для команды на эту неделю.",
                parse_mode="HTML",
            )
            logger.info("training_reminder: отправлено")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("training_reminder error: %s", e)

def register_hr_scheduled_tasks(scheduler: BotScheduler) -> None:
    scheduler.add_cron(
        name="payroll_reminder", func=payroll_reminder, hour=10, minute=0, day_of_month=25
    )
    scheduler.add_cron(name="employee_report", func=employee_report, hour=10, minute=0)
    scheduler.add_interval(
        name="new_applications_check", func=new_applications_check, seconds=12 * 3600
    )
    scheduler.add_cron(
        name="training_reminder", func=training_reminder, hour=10, minute=0, day_of_week=0
    )
