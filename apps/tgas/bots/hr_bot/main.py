"""HR Bot — main.py с EventBus интеграцией"""
import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from bots.hr_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.hr_bot.handlers.start import ai_hr
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Scheduler ────────────────────────────────────────────────────────────
scheduler = BotScheduler("hr_bot")


async def payroll_reminder():
    """Напоминание о зарплате за 5 дней (25-го числа)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        bot = Bot(token=settings.hr_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(text(
                    "SELECT COUNT(*) AS cnt, COALESCE(SUM(salary), 0) AS total "
                    "FROM employees WHERE status = 'active'"
                ))
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
            logger.info("payroll_reminder: %d сотрудников, фонд %s", count, f"{total:,.0f}")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("payroll_reminder error: %s", e)


async def employee_report():
    """Ежедневная сводка по сотрудникам."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        bot = Bot(token=settings.hr_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(text(
                    "SELECT status, COUNT(*) FROM employees GROUP BY status"
                ))
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
            logger.info("employee_report: active=%d inactive=%d on_leave=%d", active, inactive, on_leave)
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("employee_report error: %s", e)


async def new_applications_check():
    """Проверить необработанные обращения за 24 часа."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        bot = Bot(token=settings.hr_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(text(
                    "SELECT i.id, i.interaction_type, i.summary, c.name "
                    "FROM interactions i "
                    "LEFT JOIN customers c ON c.id = i.customer_id "
                    "WHERE i.interaction_type IN ('b2b_lead', 'inquiry') "
                    "AND i.created_at > NOW() - INTERVAL '24 hours' "
                    "ORDER BY i.created_at DESC"
                ))
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


async def training_reminder():
    """Понедельник — напоминание об обучении."""
    try:
        bot = Bot(token=settings.hr_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
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


scheduler.add_cron(name="payroll_reminder", func=payroll_reminder, hour=10, minute=0, day_of_month=25)
scheduler.add_cron(name="employee_report", func=employee_report, hour=10, minute=0)
scheduler.add_interval(name="new_applications_check", func=new_applications_check, seconds=12 * 3600)
scheduler.add_cron(name="training_reminder", func=training_reminder, hour=10, minute=0, day_of_week=0)


# ═══════════════════════════════════════════════════════════════════════════
# BOT BUS HANDLERS — задачи от Степана
# ═══════════════════════════════════════════════════════════════════════════

async def bus_get_employees(params: dict) -> dict:
    """Список и количество сотрудников."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        async with get_session_ctx() as session:
            res = await session.execute(text(
                "SELECT status, COUNT(*) FROM employees GROUP BY status"
            ))
            status_map = {r[0]: r[1] for r in res.fetchall()}
            res = await session.execute(text(
                "SELECT id, name, role, status, salary FROM employees ORDER BY name"
            ))
            rows = res.fetchall()
        employees = [
            {"id": r[0], "name": r[1], "role": r[2], "status": r[3], "salary": float(r[4] or 0)}
            for r in rows
        ]
        total = sum(status_map.values())
        return {
            "status": "ok",
            "message": f"Сотрудников: {total} (активных: {status_map.get('active', 0)})",
            "data": {"total": total, "by_status": status_map, "employees": employees}
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def handle_task_created(payload: dict):
    logging.info(f"HR BOT RECEIVED TASK: {payload}")
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "hr":
        return
    chat_id = data.get("chat_id")
    if not chat_id:
        return
    task_id = data.get("task_id")

    bot = Bot(token=settings.hr_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        from bots.hr_bot.handlers.start import ai
        from shared.prompts import TEAM_CONTEXT
        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Директор по персоналу (HR Director). Фокусируйся на мотивации, KPI, удержании талантов (Employee Retention) и развитии корпоративной культуры. Давай структурные ответы и планы развития."
        user_prompt = f"Руководитель поставил задачу для HR-отдела:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\n\nОтветь как ЖИВОЙ сотрудник, а не пиши стену анализа: коротко подтверди, что берёшь задачу в работу, дай суть по делу и первый конкретный шаг. Максимум 4–5 предложений, без длинных списков и без markdown-заголовков."
        logging.info("HR_BOT Generating AI answer...")
        answer = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=350)

        logging.info(f"HR_BOT sending message to {chat_id}")
        from shared.task_ui import get_task_keyboard
        await bot.send_message(chat_id, f"✅ <b>HR-отдел — принял в работу:</b>\n\n{answer}", parse_mode="HTML", reply_markup=get_task_keyboard(task_id))
        logging.info("HR_BOT successfully sent message.")

    except Exception as e:
        logging.error(f"Error handling HR task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()


async def handle_roll_call(payload: dict):
    from shared.config import settings
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode
    chat_id = payload.get("data", {}).get("chat_id")
    if not chat_id:
        return
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"ROLL_CALL received for chat {chat_id}")
    
    bot_name = "hr_bot"
    token_attr = f"{bot_name}_token"
    token = getattr(settings, token_attr, None)
    if not token:
        logger.error(f"No token found for {bot_name}")
        return
        
    bot_display_names = {
        "sales_bot": "Отдел Продаж (Sales)",
        "marketing_bot": "Отдел Маркетинга",
        "support_bot": "Отдел Поддержки",
        "hr_bot": "Отдел HR",
        "finance_bot": "Отдел Финансов",
        "analytics_bot": "Отдел Аналитики",
        "content_bot": "Отдел Контента"
    }
    display_name = bot_display_names.get(bot_name, bot_name)

    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        await bot.send_message(chat_id, f"🟢 {display_name} на связи!")
    except Exception as e:
        logger.error(f"Failed to respond to roll_call: {e}")
    finally:
        await bot.session.close()


async def main():
    if not settings.hr_bot_token:
        logger.error(f"FATAL: HR_BOT_TOKEN is missing!")
        import sys
        sys.exit(1)

    await init_db()
    bot = Bot(token=settings.hr_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.task_ui import task_ui_router
    dp.include_router(task_ui_router)
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(bot_info.username, ai_hr, wake_words=["отдел кадр", "кадры", "hr", "персонал", "сотрудники"])
    dp.include_router(group_router)

    # HR подключается к шине
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8084)  # mg_hr — порт из карты доставки event_bus

    # Heartbeat + Scheduler
    asyncio.create_task(start_heartbeat("hr_bot"))
    await scheduler.start()

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    asyncio.create_task(bus_listen("hr_bot", {
        "get_employees": bus_get_employees,
    }))

    logger.info("Starting HR Bot...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
