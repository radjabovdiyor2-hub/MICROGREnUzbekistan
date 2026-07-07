"""PM Bot — main.py с EventBus интеграцией"""
import asyncio, logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db, get_session_ctx
from shared.event_bus import event_bus
from shared.notifications import register_pm_handlers
from bots.pm_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.pm_bot.handlers.ai_pm import ai_pm
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)

# ── Планировщик ──────────────────────────────────────────────────────────
scheduler = BotScheduler("pm_bot")


async def _get_bot():
    return Bot(token=settings.pm_bot_token,
               default=DefaultBotProperties(parse_mode=ParseMode.HTML))


async def deadline_warnings():
    """Каждые 4ч — предупреждения о дедлайнах завтра."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(text(
                "SELECT id, title, deadline FROM tasks "
                "WHERE deadline = CURRENT_DATE + 1 "
                "AND status NOT IN ('done', 'cancelled')"
            ))
            tasks_tomorrow = result.fetchall()
        if tasks_tomorrow:
            lines = ["⏰ <b>Дедлайн завтра!</b>\n"]
            for t in tasks_tomorrow:
                lines.append(f"  • #{t.id} — {t.title} (до {t.deadline})")
            await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logging.error(f"deadline_warnings error: {e}", exc_info=True)


async def overdue_escalation():
    """Каждые 6ч — эскалация просроченных задач."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(text(
                "SELECT id, title, deadline FROM tasks "
                "WHERE deadline < CURRENT_DATE "
                "AND status NOT IN ('done', 'cancelled')"
            ))
            overdue = result.fetchall()
        if overdue:
            lines = ["🚨 <b>ПРОСРОЧЕННЫЕ ЗАДАЧИ!</b>\n"]
            for t in overdue:
                lines.append(f"  🔴 #{t.id} — {t.title} (дедлайн: {t.deadline})")
            lines.append(f"\nВсего просрочено: <b>{len(overdue)}</b>")
            await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logging.error(f"overdue_escalation error: {e}", exc_info=True)


async def daily_standup_prompt():
    """Ежедневно 9:30 — задачи на сегодня."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(text(
                "SELECT id, title, priority FROM tasks "
                "WHERE status NOT IN ('done', 'cancelled') "
                "ORDER BY priority DESC, deadline ASC NULLS LAST"
            ))
            active_tasks = result.fetchall()
        lines = ["☀️ <b>Доброе утро! Задачи на сегодня:</b>\n"]
        if active_tasks:
            for t in active_tasks:
                prio = "🔴" if str(t.priority).lower() in ('high', 'urgent') else "🟡" if str(t.priority).lower() == 'medium' else "🟢"
                lines.append(f"  {prio} #{t.id} — {t.title}")
            lines.append(f"\nВсего активных: <b>{len(active_tasks)}</b>")
        else:
            lines.append("  ✅ Нет активных задач!")
        await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logging.error(f"daily_standup_prompt error: {e}", exc_info=True)


async def weekly_sprint_review():
    """Пятница 17:00 — итоги спринта за неделю."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            done = (await session.execute(text(
                "SELECT COUNT(*) FROM tasks "
                "WHERE status = 'done' "
                "AND updated_at > NOW() - INTERVAL '7 days'"
            ))).scalar() or 0
            in_progress = (await session.execute(text(
                "SELECT COUNT(*) FROM tasks "
                "WHERE status NOT IN ('done', 'cancelled') "
                "AND created_at <= NOW() - INTERVAL '7 days'"
            ))).scalar() or 0
            new_tasks = (await session.execute(text(
                "SELECT COUNT(*) FROM tasks "
                "WHERE created_at > NOW() - INTERVAL '7 days'"
            ))).scalar() or 0
            overdue = (await session.execute(text(
                "SELECT COUNT(*) FROM tasks "
                "WHERE deadline < CURRENT_DATE "
                "AND status NOT IN ('done', 'cancelled')"
            ))).scalar() or 0
        report = (
            f"📋 <b>Итоги спринта (неделя)</b>\n\n"
            f"✅ Завершено: <b>{done}</b>\n"
            f"🔄 В работе: <b>{in_progress}</b>\n"
            f"🆕 Новых: <b>{new_tasks}</b>\n"
            f"🔴 Просрочено: <b>{overdue}</b>"
        )
        await bot.send_message(admin_id, report, parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logging.error(f"weekly_sprint_review error: {e}", exc_info=True)


async def production_planner():
    """Ежедневно 8:00 — план производства."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(text(
                "SELECT status, COUNT(*) as cnt FROM orders "
                "WHERE status IN ('new', 'confirmed', 'preparing') "
                "GROUP BY status ORDER BY status"
            ))
            rows = result.fetchall()
        if rows:
            status_emoji = {'new': '🆕', 'confirmed': '✅', 'preparing': '🔧'}
            lines = ["🏭 <b>План производства на сегодня:</b>\n"]
            total = 0
            for r in rows:
                emoji = status_emoji.get(r.status, '📦')
                lines.append(f"  {emoji} {r.status}: <b>{r.cnt}</b>")
                total += r.cnt
            lines.append(f"\n📊 Всего в работе: <b>{total}</b>")
            await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        else:
            await bot.send_message(admin_id,
                "🏭 План производства: нет заказов в обработке ✅",
                parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logging.error(f"production_planner error: {e}", exc_info=True)


# Регистрация задач
scheduler.add_interval(name="deadline_warnings", func=deadline_warnings, seconds=14400)
scheduler.add_interval(name="overdue_escalation", func=overdue_escalation, seconds=21600)
scheduler.add_cron(name="daily_standup_prompt", func=daily_standup_prompt, hour=9, minute=30)
scheduler.add_cron(name="weekly_sprint_review", func=weekly_sprint_review, hour=17, minute=0, day_of_week=4)
scheduler.add_cron(name="production_planner", func=production_planner, hour=8, minute=0)


# ═══════════════════════════════════════════════════════════════════════════
# BOT BUS HANDLERS — задачи от Степана
# ═══════════════════════════════════════════════════════════════════════════

async def bus_get_tasks(params: dict) -> dict:
    """Сводка по активным задачам."""
    try:
        async with get_session_ctx() as session:
            res = await session.execute(text(
                "SELECT id, title, department, status, priority, deadline "
                "FROM tasks WHERE status NOT IN ('done', 'cancelled') "
                "ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
                "WHEN 'medium' THEN 2 ELSE 3 END, deadline ASC NULLS LAST LIMIT 20"
            ))
            rows = res.fetchall()
            res2 = await session.execute(text(
                "SELECT status, COUNT(*) FROM tasks GROUP BY status"
            ))
            stats = {r[0]: r[1] for r in res2.fetchall()}
        tasks_list = [
            {"id": r[0], "title": r[1], "department": r[2], "status": r[3],
             "priority": r[4], "deadline": str(r[5]) if r[5] else None}
            for r in rows
        ]
        return {
            "status": "ok",
            "message": f"Активных задач: {len(tasks_list)}",
            "data": {"tasks": tasks_list, "stats": stats}
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def bus_get_deadlines(params: dict) -> dict:
    """Ближайшие дедлайны (7 дней)."""
    try:
        async with get_session_ctx() as session:
            res = await session.execute(text(
                "SELECT id, title, deadline, priority, department FROM tasks "
                "WHERE deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 "
                "AND status NOT IN ('done', 'cancelled') "
                "ORDER BY deadline ASC"
            ))
            rows = res.fetchall()
        deadlines = [
            {"id": r[0], "title": r[1], "deadline": str(r[2]),
             "priority": r[3], "department": r[4]}
            for r in rows
        ]
        return {
            "status": "ok",
            "message": f"Дедлайнов в ближайшие 7 дней: {len(deadlines)}",
            "data": deadlines
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def handle_task_created(payload: dict):
    data = payload.get("data", {})
    # PM (COO) владеет операционными отделами, у которых нет своего бота-исполнителя:
    # pm, operations, production, logistics. Иначе такие задачи «умирали» без исполнителя.
    if str(data.get("department", "")).lower() not in ("pm", "operations", "production", "logistics"):
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return
    
    bot = Bot(token=settings.pm_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        from shared.ai_engine import AIEngine
        ai = AIEngine()
        from shared.prompts import TEAM_CONTEXT
        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Операционный Директор (COO) и главный Project Manager (PM Bot). Твоя задача: не просто выполнять поручения, а структурно планировать их выполнение по Agile/Lean. Оцени узкие места (bottlenecks), предложи пошаговый Action Plan, укажи риски."
        user_prompt = f"Руководитель поставил задачу:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\nПроанализируй задачу и выдай структурный план действий."
        logging.info(f"PM BOT Generating AI answer...")
        answer = await ai.chat_completion(sys_prompt, user_prompt)
        
        # Интеграция со складом (автоматическое списание при посеве/сборке)
        title_lower = str(data.get('title', '')).lower()
        if "посад" in title_lower or "посев" in title_lower:
            from shared.database import get_session_ctx
            from sqlalchemy import text
            try:
                async with get_session_ctx() as session:
                    await session.execute(text("UPDATE inventory SET quantity = quantity - 1 WHERE category = 'seeds' AND quantity >= 1"))
                    await session.execute(text("UPDATE inventory SET quantity = quantity - 5 WHERE category = 'substrate' AND quantity >= 5"))
                answer += "\n\n📦 <b>Складской учёт:</b>\nАвтоматически списано: 1 кг семян, 5 кокосовых субстратов."
            except Exception as e:
                logging.error(f"Error deducting inventory: {e}")
        
        logging.info(f"PM BOT sending message to {chat_id}")
        await bot.send_message(chat_id, f"📝 <b>Результат от отдела PM:</b>\n\n{answer}")
        logging.info(f"PM BOT successfully sent message.")
        
        if task_id:
            from shared.event_bus import event_bus
            await event_bus.publish("TASK_COMPLETED", {
                "task_id": task_id,
                "completed_by": "pm", "chat_id": chat_id
            }, "pm_bot")
            
    except Exception as e:
        logging.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

async def main():
    await init_db()
    bot = Bot(token=settings.pm_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(bot_info.username, ai_pm)
    dp.include_router(group_router)

    async def handle_order_created(payload: dict):
        data = payload.get("data", {})
        order_number = data.get("order_number", "Unknown")
        amount = data.get("total_amount", 0)
        items = data.get("items_summary", "")
        
        try:
            from shared.database import get_session_ctx
            from sqlalchemy import text
            async with get_session_ctx() as session:
                await session.execute(text(
                    "INSERT INTO tasks (title, description, status, department, priority, deadline) "
                    "VALUES (:title, :desc, 'todo', 'delivery', 'high', CURRENT_DATE)"
                ), {
                    "title": f"Доставить заказ {order_number}",
                    "desc": f"Новый заказ на сумму {amount} UZS.\nДетали: {items}"
                })
            logging.info(f"PM BOT: Auto-created delivery task for order {order_number}")
        except Exception as e:
            logging.error(f"PM BOT order handling error: {e}")

    # EventBus: подписываемся на события
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("order_created", handle_order_created)
    register_pm_handlers(event_bus, bot)
    await event_bus.start_listening(8087)  # mg_pm — порт из карты доставки event_bus

    # Запуск планировщика и heartbeat
    await scheduler.start()
    asyncio.create_task(start_heartbeat("pm_bot"))

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    asyncio.create_task(bus_listen("pm_bot", {
        "get_tasks": bus_get_tasks,
        "get_deadlines": bus_get_deadlines,
    }))

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
