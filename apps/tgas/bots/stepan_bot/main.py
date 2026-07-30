"""
🤖 СТЕПАН — Личный AI-помощник руководителя
=============================================
Главный координатор. Распределяет задачи между отделами,
контролирует выполнение, проверяет результаты.
Помимо управления — личный помощник: ответы на вопросы,
аналитика, напоминания, советы.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Добавляем корень проекта в sys.path
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.redis import RedisStorage

from shared.config import settings
from shared.database import get_session_ctx
from shared.event_bus import event_bus
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat, check_all_bots, format_health_report
from shared.notifications import alert_admins

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [СТЕПАН] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Глобальные ссылки для задач ──────────────────────────────────────────
_bot: Bot = None
scheduler = BotScheduler("stepan_bot")


# ═══════════════════════════════════════════════════════════════════════════
# ФОНОВЫЕ ЗАДАЧИ — Мигрированные из старых asyncio.create_task
# ═══════════════════════════════════════════════════════════════════════════

async def check_deadlines():
    """Каждый час проверяем просроченные задачи и уведомляем админа."""
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if not admin_id:
            return
        from sqlalchemy import text as sa_text
        async with get_session_ctx() as session:
            res = await session.execute(sa_text(
                "SELECT id, title, department, deadline "
                "FROM tasks "
                "WHERE deadline < CURRENT_DATE AND status NOT IN ('done', 'cancelled') "
                "ORDER BY deadline ASC LIMIT 10"
            ))
            overdue = res.fetchall()

        if overdue:
            lines = ["⏰ <b>Просроченные задачи:</b>\n"]
            for row in overdue:
                tid, title, dept, deadline = row
                dept_str = f" ({dept})" if dept else ""
                dl = deadline.strftime("%d.%m.%Y") if deadline else "?"
                lines.append(f"• <b>#{tid}</b>{dept_str}: {title[:80]} — дедлайн был {dl}")
            lines.append(f"\n🔴 Всего просрочено: {len(overdue)}")
            await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
            logger.info(f"Отправлено уведомление о {len(overdue)} просроченных задачах")
    except Exception as e:
        logger.warning(f"Ошибка проверки дедлайнов: {e}")


async def daily_report():
    """Каждый день в 9:00 отправляем сводку руководителю."""
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if not admin_id:
            return
        from sqlalchemy import text as sa_text
        from shared.utils import format_price

        async with get_session_ctx() as session:
            # Задачи: общая статистика
            res = await session.execute(sa_text(
                "SELECT status, COUNT(*) FROM tasks GROUP BY status"
            ))
            task_stats = dict(res.fetchall())

            # Незавершённые задачи со вчера
            res = await session.execute(sa_text(
                "SELECT id, title, department FROM tasks "
                "WHERE status NOT IN ('done', 'cancelled') "
                "AND created_at < CURRENT_DATE "
                "ORDER BY created_at ASC LIMIT 10"
            ))
            yesterday_tasks = res.fetchall()

            # Просроченные
            res = await session.execute(sa_text(
                "SELECT COUNT(*) FROM tasks "
                "WHERE deadline < CURRENT_DATE AND status NOT IN ('done', 'cancelled')"
            ))
            overdue_count = res.scalar() or 0

            # Заказы на сегодня
            res = await session.execute(sa_text(
                "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders "
                "WHERE DATE(created_at) = CURRENT_DATE"
            ))
            today_orders, today_revenue = res.fetchone()

            # Заказы за вчера
            res = await session.execute(sa_text(
                "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders "
                "WHERE DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'"
            ))
            yesterday_orders, yesterday_revenue = res.fetchone()

            # Финансы за месяц
            res = await session.execute(sa_text(
                "SELECT type, COALESCE(SUM(amount), 0) FROM finances "
                "WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) "
                "GROUP BY type"
            ))
            fin = dict(res.fetchall())
            income = fin.get('income', 0)
            expense = fin.get('expense', 0)

        # Формируем отчёт
        todo = task_stats.get('todo', 0)
        in_progress = task_stats.get('in_progress', 0)
        done = task_stats.get('done', 0)

        lines = [
            "☀️ <b>Доброе утро! Утренняя сводка:</b>\n",
            "━━━━━━━━━━━━━━━━━━━━━━",
            "\n📋 <b>Задачи:</b>",
            f"  ⬜ Ожидают: {todo}",
            f"  🔄 В работе: {in_progress}",
            f"  ✅ Выполнено: {done}",
        ]

        if overdue_count > 0:
            lines.append(f"  🔴 Просрочено: {overdue_count}")

        if yesterday_tasks:
            lines.append(f"\n⚠️ <b>Незавершённые со вчера ({len(yesterday_tasks)}):</b>")
            for tid, title, dept in yesterday_tasks:
                dept_str = f" [{dept}]" if dept else ""
                lines.append(f"  • #{tid}{dept_str}: {title[:60]}")

        lines.extend([
            "\n━━━━━━━━━━━━━━━━━━━━━━",
            "\n📦 <b>Заказы:</b>",
            f"  Сегодня: {today_orders or 0} заказов на {format_price(today_revenue or 0)}",
            f"  Вчера: {yesterday_orders or 0} заказов на {format_price(yesterday_revenue or 0)}",
            "\n━━━━━━━━━━━━━━━━━━━━━━",
            "\n💰 <b>Финансы за месяц:</b>",
            f"  📈 Доход: {format_price(income)}",
            f"  📉 Расход: {format_price(expense)}",
            f"  💵 Баланс: {format_price(income - expense)}",
            "\n━━━━━━━━━━━━━━━━━━━━━━",
            "\n🤖 Степан на связи. Жду ваших указаний!",
        ])

        await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        logger.info("Утренний отчёт отправлен!")
    except Exception as e:
        logger.warning(f"Ошибка отправки утреннего отчёта: {e}")


async def check_followups():
    """Каждые 30 минут проверяем pending follow-ups и делегируем отправку Sales боту.

    Раньше здесь создавался второй Bot(token=sales_bot_token) — это приводило
    к конфликту polling («terminated by other getUpdates request»).
    Теперь follow-ups отправляются самим Степаном (это его задача как координатора).
    """
    try:
        from sqlalchemy import text as sa_text

        async with get_session_ctx() as session:
            res = await session.execute(sa_text(
                "SELECT f.id, f.message, c.telegram_id "
                "FROM followups f "
                "JOIN customers c ON f.customer_id = c.id "
                "WHERE f.status = 'pending' AND f.scheduled_at <= NOW() "
                "LIMIT 10"
            ))
            followups = res.fetchall()

        if not followups:
            return

        for fid, msg, tg_id in followups:
            if not tg_id:
                continue
            try:
                await _bot.send_message(tg_id, f"🌱 {msg}")
                async with get_session_ctx() as session:
                    await session.execute(sa_text(
                        "UPDATE followups SET status = 'sent' WHERE id = :fid"
                    ), {"fid": fid})
                    await session.execute(sa_text(
                        "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                        "VALUES ((SELECT customer_id FROM followups WHERE id = :fid), "
                        "'telegram', 'followup', 'stepan_bot', :summary)"
                    ), {"fid": fid, "summary": msg[:200]})
                logger.info(f"Follow-up #{fid} отправлен клиенту {tg_id}")
            except Exception as e:
                logger.warning(f"Follow-up #{fid} ошибка: {e}")
    except Exception as e:
        logger.warning(f"Ошибка проверки follow-ups: {e}")


# ═══════════════════════════════════════════════════════════════════════════
# НОВЫЕ ФОНОВЫЕ ЗАДАЧИ
# ═══════════════════════════════════════════════════════════════════════════

async def evening_summary():
    """Ежедневно в 20:00: итоги дня."""
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if not admin_id:
            return
        from sqlalchemy import text as sa_text
        from shared.utils import format_price

        async with get_session_ctx() as session:
            # Задачи завершённые сегодня
            res = await session.execute(sa_text(
                "SELECT COUNT(*) FROM tasks "
                "WHERE status = 'done' AND DATE(updated_at) = CURRENT_DATE"
            ))
            tasks_completed = res.scalar() or 0

            # Задачи оставшиеся
            res = await session.execute(sa_text(
                "SELECT COUNT(*) FROM tasks "
                "WHERE status NOT IN ('done', 'cancelled')"
            ))
            tasks_remaining = res.scalar() or 0

            # Новые заказы сегодня
            res = await session.execute(sa_text(
                "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders "
                "WHERE DATE(created_at) = CURRENT_DATE"
            ))
            new_orders, revenue = res.fetchone()

            # Задачи на завтра (с дедлайном завтра)
            res = await session.execute(sa_text(
                "SELECT id, title, department FROM tasks "
                "WHERE deadline = CURRENT_DATE + INTERVAL '1 day' "
                "AND status NOT IN ('done', 'cancelled') "
                "ORDER BY id LIMIT 5"
            ))
            tomorrow_tasks = res.fetchall()

        lines = [
            "🌆 <b>Итоги дня</b>\n",
            "━━━━━━━━━━━━━━━━━━━━━━\n",
            f"✅ Задач завершено: <b>{tasks_completed}</b>",
            f"📦 Новых заказов: <b>{new_orders or 0}</b>",
            f"💰 Выручка: <b>{format_price(revenue or 0)}</b>",
            f"📋 Осталось задач: <b>{tasks_remaining}</b>",
        ]

        if tomorrow_tasks:
            lines.append(f"\n📅 <b>На завтра ({len(tomorrow_tasks)}):</b>")
            for tid, title, dept in tomorrow_tasks:
                dept_str = f" [{dept}]" if dept else ""
                lines.append(f"  • #{tid}{dept_str}: {title[:60]}")

        lines.extend([
            "\n━━━━━━━━━━━━━━━━━━━━━━",
            "\n🌙 Хорошего вечера! Степан всё контролирует.",
        ])

        await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logger.warning(f"Ошибка вечернего отчёта: {e}")


async def weekly_report():
    """Понедельник 9:00 (после daily_report): недельная сводка с AI-анализом."""
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if not admin_id:
            return
        from sqlalchemy import text as sa_text
        from shared.utils import format_price
        from shared.ai_engine import AIEngine

        async with get_session_ctx() as session:
            # Задачи за неделю
            res = await session.execute(sa_text(
                "SELECT status, COUNT(*) FROM tasks "
                "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' "
                "GROUP BY status"
            ))
            week_tasks = dict(res.fetchall())

            # Заказы за неделю
            res = await session.execute(sa_text(
                "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders "
                "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
            ))
            week_orders, week_revenue = res.fetchone()

            # Финансы за неделю
            res = await session.execute(sa_text(
                "SELECT type, COALESCE(SUM(amount), 0) FROM finances "
                "WHERE date >= CURRENT_DATE - INTERVAL '7 days' "
                "GROUP BY type"
            ))
            fin = dict(res.fetchall())
            income = fin.get('income', 0)
            expense = fin.get('expense', 0)

            # Новые клиенты
            res = await session.execute(sa_text(
                "SELECT COUNT(*) FROM customers "
                "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
            ))
            new_customers = res.scalar() or 0

        data_summary = (
            f"Задачи: {week_tasks.get('done', 0)} выполнено, "
            f"{week_tasks.get('todo', 0)} ожидают, "
            f"{week_tasks.get('in_progress', 0)} в работе.\n"
            f"Заказов: {week_orders or 0}, выручка: {'{:,.0f}'.format(week_revenue or 0)} сум.\n"
            f"Доход: {'{:,.0f}'.format(income)} сум, расход: {'{:,.0f}'.format(expense)} сум.\n"
            f"Новых клиентов: {new_customers}."
        )

        ai = AIEngine()
        analysis = await ai.chat_completion(
            "Ты бизнес-помощник руководителя микрозелени в Узбекистане. "
            "Дай краткий анализ недели и 3 рекомендации.",
            f"Данные за прошлую неделю:\n{data_summary}\n\nДай анализ и рекомендации."
        )

        lines = [
            "📊 <b>Недельный отчёт</b>\n",
            "━━━━━━━━━━━━━━━━━━━━━━\n",
            "📋 <b>Задачи:</b>",
            f"  ✅ Выполнено: {week_tasks.get('done', 0)}",
            f"  ⬜ Ожидают: {week_tasks.get('todo', 0)}",
            f"  🔄 В работе: {week_tasks.get('in_progress', 0)}",
            f"\n📦 Заказов: <b>{week_orders or 0}</b>",
            f"💰 Выручка: <b>{format_price(week_revenue or 0)}</b>",
            f"📈 Доход: {format_price(income)}",
            f"📉 Расход: {format_price(expense)}",
            f"💵 Прибыль: <b>{format_price(income - expense)}</b>",
            f"👤 Новых клиентов: <b>{new_customers}</b>",
            "\n━━━━━━━━━━━━━━━━━━━━━━",
            f"\n🤖 <b>AI-анализ:</b>\n{analysis}",
            "\n━━━━━━━━━━━━━━━━━━━━━━",
            "📊 <i>Степан — недельный отчёт</i>",
        ]

        report = "\n".join(lines)
        if len(report) > 4000:
            await _bot.send_message(admin_id, report[:4000] + "\n\n<i>...продолжение↓</i>", parse_mode="HTML")
            await _bot.send_message(admin_id, report[4000:], parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logger.warning(f"Ошибка недельного отчёта: {e}")


async def auto_task_creation():
    """Каждые 4 часа: автоматическое создание задач по условиям."""
    try:
        from sqlalchemy import text as sa_text
        from shared.event_bus import event_bus

        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        created_tasks = []

        async with get_session_ctx() as session:
            # 1. Продукты с низким запасом (stock_qty < 3)
            res = await session.execute(sa_text(
                "SELECT p.id, p.name_ru, p.stock_qty FROM products p "
                "WHERE p.stock_qty < 3 AND p.is_active = true "
                "AND NOT EXISTS ("
                "  SELECT 1 FROM tasks t "
                "  WHERE t.title LIKE '%' || p.name_ru || '%' "
                "  AND t.status NOT IN ('done', 'cancelled') "
                "  AND t.created_at > CURRENT_DATE - INTERVAL '1 day'"
                ")"
            ))
            low_stock = res.fetchall()

            for pid, name, qty in low_stock:
                res = await session.execute(sa_text(
                    "INSERT INTO tasks (title, description, department, status, created_at) "
                    "VALUES (:title, :desc, 'operations', 'todo', NOW()) RETURNING id"
                ), {
                    "title": f"🔄 Пополнить запас: {name}",
                    "desc": f"Остаток: {qty} шт. Необходимо пополнить запас продукта '{name}' (ID: {pid})."
                })
                task_id = res.scalar()
                await session.commit()
                created_tasks.append(f"📦 Пополнить {name} (остаток: {qty})")

                # Publish TASK_CREATED event
                if admin_id:
                    await event_bus.publish("TASK_CREATED", {
                        "task_id": task_id,
                        "title": f"Пополнить запас: {name}",
                        "department": "operations",
                        "chat_id": admin_id,
                    }, "stepan_bot")

            # 2. Заказы 'new' более 24 часов
            res = await session.execute(sa_text(
                "SELECT o.id, o.created_at FROM orders o "
                "WHERE o.status = 'new' "
                "AND o.created_at < NOW() - INTERVAL '24 hours' "
                "AND NOT EXISTS ("
                "  SELECT 1 FROM tasks t "
                "  WHERE t.title LIKE '%Заказ #' || o.id::text || '%' "
                "  AND t.status NOT IN ('done', 'cancelled') "
                "  AND t.created_at > CURRENT_DATE - INTERVAL '1 day'"
                ")"
            ))
            stale_orders = res.fetchall()

            for oid, created_at in stale_orders:
                res = await session.execute(sa_text(
                    "INSERT INTO tasks (title, description, department, status, created_at) "
                    "VALUES (:title, :desc, 'sales', 'todo', NOW()) RETURNING id"
                ), {
                    "title": f"⚠️ Обработать Заказ #{oid}",
                    "desc": f"Заказ #{oid} от {created_at.strftime('%d.%m %H:%M')} не обработан более 24 часов."
                })
                task_id = res.scalar()
                await session.commit()
                created_tasks.append(f"📋 Обработать заказ #{oid}")

                if admin_id:
                    await event_bus.publish("TASK_CREATED", {
                        "task_id": task_id,
                        "title": f"Обработать Заказ #{oid}",
                        "department": "sales",
                        "chat_id": admin_id,
                    }, "stepan_bot")

        # Уведомить админа если были созданы задачи
        if created_tasks and admin_id:
            lines = [
                "🤖 <b>Авто-задачи созданы:</b>\n",
                "━━━━━━━━━━━━━━━━━━━━━━\n",
            ]
            for t in created_tasks:
                lines.append(f"  • {t}")
            lines.append(f"\n✅ Создано задач: <b>{len(created_tasks)}</b>")
            await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logger.warning(f"Ошибка автосоздания задач: {e}")


_last_down_bots: set[str] = set()


async def bot_health_check(force: bool = False):
    """Проверка здоровья всех ботов. Алертит при ИЗМЕНЕНИИ статуса (новый упавший /
    восстановление), а не каждый интервал — так частая проверка не спамит. `force=True`
    (ежедневная сводка) присылает полный статус всегда."""
    global _last_down_bots
    try:
        statuses = await check_all_bots()
        if not statuses:
            return

        down = {name for name, info in statuses.items() if not info["alive"]}
        newly_down = down - _last_down_bots
        recovered = _last_down_bots - down
        _last_down_bots = down

        if not settings.admin_telegram_ids:
            return

        # Рассылаем ВСЕМ администраторам, а не только первому: пока алерт
        # уходил на admin_telegram_ids[0], отпуск владельца означал, что
        # об упавшем боте не узнавал никто.
        report = format_health_report(statuses)
        if down and (force or newly_down):
            await alert_admins(
                _bot,
                f"🚨 <b>АЛЕРТ: боты не отвечают!</b>\n\n{report}\n\n⚠️ Проверьте работу ботов!",
            )
            logger.warning("Боты не отвечают: %s", ", ".join(sorted(down)))
        elif recovered and not down:
            await alert_admins(_bot, f"✅ <b>Все боты снова онлайн</b>\n\n{report}")
        elif force:
            await alert_admins(_bot, report)
    except Exception as e:
        logger.warning(f"Ошибка проверки здоровья: {e}")


async def bot_health_summary():
    """Ежедневная (09:00) полная сводка статуса ботов — всегда присылается."""
    await bot_health_check(force=True)


# ── Регистрация задач ────────────────────────────────────────────────────
# ── Регистрация задач операционного управления ────────────────────────────
scheduler.add_interval(name="check_deadlines", func=check_deadlines, seconds=3600)
scheduler.add_interval(name="check_followups", func=check_followups, seconds=1800)
scheduler.add_cron(name="evening_summary", func=evening_summary, hour=20, minute=0)
scheduler.add_cron(name="weekly_report", func=weekly_report, hour=9, minute=5, day_of_week=0)
scheduler.add_interval(name="auto_task_creation", func=auto_task_creation, seconds=4 * 3600)
# Частая проверка (5 мин) — теперь антиспам: алертит только при ИЗМЕНЕНИИ (упал/восстановился).
scheduler.add_interval(name="bot_health_check", func=bot_health_check, seconds=300)
# Ежедневная полная сводка в 09:00 (всегда присылается).
scheduler.add_cron(name="bot_health_summary", func=bot_health_summary, hour=9, minute=0)

# Инфраструктура
async def _daily_backup():
    from shared.backup import daily_backup_task
    # Передаём бота, чтобы о неудачном или повреждённом бэкапе узнали все
    # администраторы, а не только логи на сервере.
    await daily_backup_task(_bot)

async def _token_refresh():
    try:
        from shared.token_refresh import auto_refresh_token
        await auto_refresh_token()
    except Exception as e:
        logger.warning(f"Token refresh error: {e}")


# Instagram Stories промо-рассылка отключена по решению пользователя
# async def _post_ig_story():
#     try:
#         from shared.instagram_stories import post_promotional_story
#         await post_promotional_story()
#     except Exception as e:
#         logger.warning(f"Instagram Story post error: {e}")
#
# scheduler.add_interval(name="instagram_story_promo", func=_post_ig_story, seconds=36*3600, initial_delay=3600)

scheduler.add_cron(name="daily_backup", func=_daily_backup, hour=3, minute=0)
scheduler.add_interval(name="token_refresh", func=_token_refresh, seconds=86400 * 7)  # раз в неделю


# ── KPI-watchdog: при падении показателей автоматически созывает совещание отделов ──
async def _kpi_watchdog_job():
    try:
        from bots.stepan_bot.handlers.team_meeting import run_kpi_watchdog
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        chat = getattr(settings, "sales_group_id", 0) or admin_id
        if _bot and chat:
            await run_kpi_watchdog(_bot, chat)
    except Exception as e:
        logger.warning(f"KPI watchdog job error: {e}")

if getattr(settings, "kpi_watchdog_enabled", True):
    scheduler.add_cron(name="kpi_watchdog", func=_kpi_watchdog_job,
                       hour=getattr(settings, "kpi_watchdog_hour", 11), minute=0)

async def run_magazine_pipeline():
    """Еженедельный запуск пайплайна создания журнала FRESH WEEKLY."""
    try:
        from shared.bot_bus import send_task, get_result
        from shared.event_bus import BotBusActions, event_bus
        admin_id = settings.admin_telegram_ids[0]
        
        # Информационное — не требует действий, убрано из спама
        logger.info("Magazine pipeline started")
        
        # Фаза 1: Сбор данных
        logger.info("Magazine Phase 1: Data Gathering")
        facts_task = await send_task("stepan_bot", "rnd_bot", BotBusActions.GENERATE_MAGAZINE_FACTS)
        products_task = await send_task("stepan_bot", "analytics_bot", BotBusActions.GET_TOP_PRODUCTS)
        restaurant_task = await send_task("stepan_bot", "marketing_bot", BotBusActions.PICK_RESTAURANT)
        
        # Ждем результаты первой фазы
        facts_res = await get_result(facts_task, timeout=120)
        products_res = await get_result(products_task, timeout=120)
        restaurant_res = await get_result(restaurant_task, timeout=120)
        
        # Фаза 2: Контент и реклама
        logger.info("Magazine Phase 2: Content & Ads")
        content_task = await send_task("stepan_bot", "content_bot", BotBusActions.DRAFT_MAGAZINE, params={
            "facts": facts_res.get("result") if facts_res else "Факты не получены",
            "products": products_res.get("result") if products_res else "Продукты не получены",
            "restaurant": restaurant_res.get("result") if restaurant_res else "Ресторан не получен"
        })
        
        ads_task = await send_task("stepan_bot", "sales_bot", BotBusActions.SELL_MAGAZINE_ADS)
        
        content_res = await get_result(content_task, timeout=300)
        ads_res = await get_result(ads_task, timeout=300)
        
        # Фаза 3: Деплой
        if not content_res or content_res.get("status") != "done" or "error" in content_res.get("result", {}):
            await _bot.send_message(admin_id, "⚠️ <b>Stepan:</b> Ошибка контента журнала, пайплайн прерван.", parse_mode="HTML")
            return
            
        logger.info("Magazine Phase 3: Publishing")
        publish_task = await send_task("stepan_bot", "devops_bot", BotBusActions.PUBLISH_MAGAZINE, params={
            "content": content_res.get("result"),
            "ads": ads_res.get("result") if ads_res else []
        })
        
        publish_res = await get_result(publish_task, timeout=300)
        
        if publish_res and publish_res.get("status") == "done":
            issue_data = publish_res.get("result", {})
            if issue_data.get("status") == "done":
                await _bot.send_message(admin_id, f"✅ <b>Stepan:</b> Журнал FRESH WEEKLY №{issue_data.get('issue_id', '?')} успешно опубликован!\n\n🔗 {issue_data.get('url', '')}", parse_mode="HTML")
                
                # Рассылка события о публикации
                from shared.event_bus import event_bus
                await event_bus.publish("MAGAZINE_PUBLISHED", issue_data, "stepan")
            else:
                err = issue_data.get("message", "Неизвестная ошибка")
                await _bot.send_message(admin_id, f"⚠️ <b>Stepan:</b> Ошибка публикации журнала: {err}", parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, "⚠️ <b>Stepan:</b> Таймаут или критическая ошибка публикации журнала.", parse_mode="HTML")
            
    except Exception as e:
        logger.error(f"run_magazine_pipeline error: {e}", exc_info=True)

# Отключён: заменён веб-кроном magazine_cron_prepare/finalize/print_run (персональные выпуски)
# scheduler.add_cron(name="magazine_pipeline", func=run_magazine_pipeline, day_of_week=2, hour=10, minute=0)

async def _cron_magazine_prepare():
    try:
        import aiohttp
        import os
        secret = os.environ.get("BOT_SECRET", "")
        async with aiohttp.ClientSession() as session:
            # We assume Next.js runs on 3000 or 3005, typical dev ports
            port = os.environ.get("PORT", "3000")
            async with session.post(f"http://127.0.0.1:{port}/api/admin/magazine/cron/prepare", headers={"x-bot-secret": secret}) as resp:
                data = await resp.json()
                logger.info(f"Cron Prepare: {data}")
    except Exception as e:
        logger.error(f"Cron Prepare error: {e}")

async def _cron_magazine_finalize():
    try:
        import aiohttp
        import os
        secret = os.environ.get("BOT_SECRET", "")
        async with aiohttp.ClientSession() as session:
            port = os.environ.get("PORT", "3000")
            async with session.post(f"http://127.0.0.1:{port}/api/admin/magazine/cron/finalize", headers={"x-bot-secret": secret}) as resp:
                data = await resp.json()
                logger.info(f"Cron Finalize: {data}")
    except Exception as e:
        logger.error(f"Cron Finalize error: {e}")

async def _cron_magazine_print_run():
    try:
        import aiohttp
        import os
        import asyncio
        secret = os.environ.get("BOT_SECRET", "")
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        async with aiohttp.ClientSession() as session:
            port = os.environ.get("PORT", "3000")
            async with session.post(f"http://127.0.0.1:{port}/api/admin/magazine/cron/print-run", headers={"x-bot-secret": secret}) as resp:
                data = await resp.json()
                logger.info(f"Cron Print-Run: {data}")
                
                slugs = data.get("slugs", [])
                if slugs:
                    if admin_id and _bot:
                        logger.info(f"Generating PDF for {len(slugs)} magazines...")
                    
                    for slug in slugs:
                        logger.info(f"Generating PDF for {slug}...")
                        process = await asyncio.create_subprocess_exec(
                            "node", "scripts/generate-magazine-pdf.js", slug,
                            cwd=str(ROOT)
                        )
                        await process.communicate()
                        
                    if admin_id and _bot:
                        logger.info(f"PDF generation finished for {len(slugs)} magazines")

    except Exception as e:
        logger.error(f"Cron Print-Run error: {e}")

# Wednesday 09:00 - Prepare
scheduler.add_cron(name="magazine_cron_prepare", func=_cron_magazine_prepare, day_of_week=2, hour=9, minute=0)
# Thursday 12:00 - Finalize
scheduler.add_cron(name="magazine_cron_finalize", func=_cron_magazine_finalize, day_of_week=3, hour=12, minute=0)
# Friday 08:00 - Print-Run & Generate PDF
scheduler.add_cron(name="magazine_cron_print_run", func=_cron_magazine_print_run, day_of_week=4, hour=8, minute=0)



# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

async def main():
    if not settings.stepan_bot_token:
        logger.error(f"FATAL: STEPAN_BOT_TOKEN is missing!")
        import sys
        sys.exit(1)

    global _bot
    storage = RedisStorage.from_url(settings.redis_url)
    bot = Bot(
        token=settings.stepan_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    _bot = bot
    dp = Dispatcher(storage=storage)

    # -- Импортируем обработчики --
    from bots.stepan_bot.handlers import all_routers
    from shared.task_ui import task_ui_router
    dp.include_router(task_ui_router)
    for router in all_routers:
        dp.include_router(router)
        
    from shared.group_orchestrator import create_group_router
    from bots.stepan_bot.handlers.assistant import brain
    bot_info = await bot.me()
    group_router = create_group_router(bot_info.username, brain, wake_words=[
        "степан", "стёпа", "степа", "stepan",
        "шеф", "босс", "менеджер", "директор",
        "отдел devops", "devops", "девопс",
        "отдел qa", "тестирование", "качество",
        "отдел r&d", "r&d", "исследования", "разработка",
        "отдел логистик", "логистика", "доставка",
    ])
    dp.include_router(group_router)

    # -- EventBus: слушаем ВСЕ события --
    # Uses the global singleton from shared.event_bus (imported at top)

    async def on_any_event(payload: dict):
        """Степан обрабатывает события — только важные уведомляет."""
        event_type = payload.get("event")
        data = payload.get("data", {})
        source = payload.get("source", "unknown")
        
        # Заказы из Instagram уже обрабатываются в handle_ig_dm — не дублируем
        if event_type == "order_created" and source in ("stepan_bot", "instagram_bot"):
            logger.info(f"Степан: событие {event_type} от {source} — обработано")
            return
        
        # Только критичные события отправляем админу
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        
        if event_type == "complaint_received" and admin_id:
            summary = data.get("summary", "Без описания")
            customer = data.get("customer_name", "Клиент")
            await bot.send_message(
                admin_id,
                f"⚠️ <b>ЖАЛОБА</b> от {customer}\n{summary}",
            )
        elif event_type == "large_expense_alert" and admin_id:
            await bot.send_message(
                admin_id,
                f"💸 <b>Крупный расход!</b>\n{data.get('summary', '')}",
            )
        elif event_type == "franchise_report_generated" and admin_id:
            city = data.get("city", "Unknown")
            report_text = data.get("content", "")
            await bot.send_message(
                admin_id,
                f"🏢 <b>Журнал Франчайзи ({city.capitalize()})</b>\n\n{report_text}",
                parse_mode="HTML"
            )
        elif event_type == "DELIVERY_STATUS_REPORT":
            sales_group = getattr(settings, 'sales_group_id', 0)
            target_chat = sales_group if sales_group else admin_id
            if target_chat:
                from shared.ai_engine import AIEngine
                ai = AIEngine()
                prompt = (
                    "Сформируй понятный, живой и мотивирующий отчёт для группы продаж о текущем статусе заказов. "
                    f"Данные: {data}. "
                    "Не используй слишком формальный язык. Опиши ситуацию с курьерами и сборкой."
                )
                try:
                    ai_report = await ai.chat_completion("Ты руководитель Степан. Отправь отчёт о доставке для команды.", prompt)
                    await bot.send_message(target_chat, f"📦 <b>Сводка по логистике от Степана:</b>\n\n{ai_report}", parse_mode="HTML")
                except Exception as e:
                    logger.error(f"Error generating delivery report: {e}")
        elif event_type == "new_message" and admin_id:
            # Отключено: пересылает ВСЕ служебные уведомления, спамит
            pass
        elif event_type == "order_created":
            order_number = data.get("order_number", "Unknown")
            amount = data.get("total_amount", 0)
            items = data.get("items_summary", "")
            try:
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    res = await session.execute(text(
                        "INSERT INTO tasks (title, description, status, department, priority, deadline) "
                        "VALUES (:title, :desc, 'todo', 'delivery', 'high', CURRENT_DATE) RETURNING id"
                    ), {
                        "title": f"Доставить заказ {order_number}",
                        "desc": f"Новый заказ на сумму {amount} UZS.\nДетали: {items}"
                    })
                    task_id = res.scalar()
                    await session.commit()
                
                await event_bus.publish("TASK_CREATED", {
                    "task_id": task_id,
                    "title": f"Доставить заказ {order_number}",
                    "department": "delivery",
                    "description": f"Новый заказ на сумму {amount} UZS.\nДетали: {items}",
                    "chat_id": getattr(settings, "sales_group_id", 0) or admin_id
                }, "stepan_bot")
                logger.info(f"Степан: Auto-created delivery task for order {order_number}")
            except Exception as e:
                logger.error(f"Степан order handling error: {e}")

        else:
            # Всё остальное — только лог, не спамим в чат
            logger.info(f"Степан: событие {event_type} от {source} — записано")


    async def handle_pm_task_created(payload: dict):
        data = payload.get("data", {})
        if str(data.get("department", "")).lower() not in ("pm", "operations", "production", "logistics"):
            return
        chat_id = data.get("chat_id")
        task_id = data.get("task_id")
        if not chat_id:
            return
        
        try:
            from shared.ai_engine import AIEngine
            ai = AIEngine()
            from shared.prompts import TEAM_CONTEXT
            sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Операционный Директор (COO) и главный Project Manager. Твоя задача: не просто выполнять поручения, а структурно планировать их выполнение по Agile/Lean. Оцени узкие места (bottlenecks), предложи пошаговый Action Plan, укажи риски."
            user_prompt = f"Руководитель поставил задачу:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\n\nОтветь как ЖИВОЙ сотрудник, а не пиши стену анализа: коротко подтверди, что берёшь задачу в работу, дай суть по делу и первый конкретный шаг. Максимум 4–5 предложений, без длинных списков и без markdown-заголовков."
            logger.info("Степан (Менеджер) Generating AI answer...")
            answer = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=380)
            
            # Интеграция со складом (автоматическое списание при посеве/сборке)
            title_lower = str(data.get('title', '')).lower()
            if "посад" in title_lower or "посев" in title_lower:
                from shared.database import get_session_ctx
                from sqlalchemy import text
                try:
                    async with get_session_ctx() as session:
                        await session.execute(text("UPDATE inventory SET quantity = quantity - 1 WHERE category = 'seeds' AND quantity >= 1"))
                        await session.execute(text("UPDATE inventory SET quantity = quantity - 5 WHERE category = 'substrate' AND quantity >= 5"))
                        await session.commit()
                    answer += "\n\n📦 <b>Складской учёт:</b>\nАвтоматически списано: 1 кг семян, 5 кокосовых субстратов."
                except Exception as e:
                    logger.error(f"Error deducting inventory: {e}")
            
            from shared.task_ui import get_task_keyboard
            await bot.send_message(chat_id, f"✅ <b>Операции (PM) — принял в работу:</b>\n\n{answer}", parse_mode="HTML", reply_markup=get_task_keyboard(task_id))
                
        except Exception as e:
            logger.error(f"Error handling PM task: {repr(e)}", exc_info=True)


    async def handle_task_completed(payload: dict):
        data = payload.get("data", {})
        task_id = data.get("task_id")
        completed_by = data.get('completed_by', 'unknown')
        chat_id = data.get('chat_id')
        if task_id:
            try:
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    res = await session.execute(text("SELECT message_id FROM tasks WHERE id=:tid"), {"tid": task_id})
                    row = res.fetchone()
                    msg_id = row[0] if row else None
                    
                    if msg_id and chat_id:
                        try:
                            await bot.delete_message(chat_id=chat_id, message_id=msg_id)
                        except Exception as e:
                            logger.warning(f"Could not delete original message: {e}")
                            
                    await session.execute(text("UPDATE tasks SET status='done' WHERE id=:tid"), {"tid": task_id})
                    await session.commit()
                logger.info(f'TASK {task_id} MARKED AS DONE by {completed_by}')
                
                report_text = data.get('text', '')
                if chat_id:
                    msg = f'✅ <b>Задача #{task_id} успешно выполнена отделом {completed_by.upper()}!</b>'
                    if report_text:
                        msg += f'\n\n{report_text}'
                    await bot.send_message(chat_id, msg, parse_mode="HTML")
            except Exception as e:
                logger.error(f"Error marking task {task_id} as done: {e}")

    async def handle_ig_dm(payload: dict):
        """
        Цепочка обработки заказа из Instagram DM:
        1. Instagram бот собирает заказ у клиента
        2. Публикует IG_DM_RECEIVED → сюда
        3. Степан анализирует → создаёт задачу для Sales
        4. Делегирует через Bot Bus в Sales бот
        5. Уведомляет админа в Telegram
        """
        data = payload.get("data", {})
        text_msg = data.get("text", "")
        from_name = data.get("from_name", "Unknown")
        reply = data.get("reply", "")
        order = data.get("order")  # Данные заказа если он оформлен
        
        if not text_msg:
            return
        
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        
        try:
            if order:
                # ═══ ЗАКАЗ ОФОРМЛЕН — полная цепочка ═══
                product = order.get("product", "?")
                quantity = order.get("quantity", "?")
                phone = order.get("phone", "?")
                address = order.get("address", "?")
                total = order.get("total", "?")
                
                # 1. Создаём задачу в БД для отдела продаж
                from shared.database import get_session_ctx
                from sqlalchemy import text as sa_text
                async with get_session_ctx() as session:
                    result = await session.execute(sa_text(
                        "INSERT INTO tasks (title, description, status, department, priority, deadline, created_at) "
                        "VALUES (:title, :desc, 'todo', 'sales', 'high', CURRENT_DATE, NOW()) RETURNING id"
                    ), {
                        "title": f"📦 IG заказ от {from_name}: {product}",
                        "desc": (
                            f"ЗАКАЗ ИЗ INSTAGRAM DM\n"
                            f"══════════════════════\n"
                            f"👤 Клиент: {from_name}\n"
                            f"📦 Товар: {product}\n"
                            f"📊 Количество: {quantity}\n"
                            f"📱 Телефон: {phone}\n"
                            f"📍 Адрес: {address}\n"
                            f"💰 Сумма: {total}\n"
                            f"══════════════════════\n"
                            f"Источник: Instagram Direct Message"
                        )
                    })
                    task_row = result.fetchone()
                    task_id = task_row[0] if task_row else None
                    await session.commit()
                
                logger.info(f"Степан: Задача #{task_id} создана для Sales по IG заказу от {from_name}")
                
                # 2. Делегируем задачу в Sales бот через Bot Bus
                try:
                    from shared.bot_bus import send_task
                    bus_task_id = await send_task(
                        from_bot="stepan_bot",
                        to_bot="sales_bot",
                        action="process_ig_order",
                        params={
                            "task_id": task_id,
                            "customer_name": from_name,
                            "product": product,
                            "quantity": quantity,
                            "phone": phone,
                            "address": address,
                            "total": total,
                            "source": "instagram",
                        }
                    )
                    logger.info(f"Степан → Sales: делегирована задача {bus_task_id} (IG заказ)")
                except Exception as bus_err:
                    logger.warning(f"Bot Bus delegation error: {bus_err}")
                
                # 3. Уведомляем группу «Продажа» о новом заказе
                sales_group = getattr(settings, 'sales_group_id', 0)
                target_chat = sales_group if sales_group else admin_id
                if target_chat:
                    await bot.send_message(
                        target_chat,
                        f"📦 <b>ЗАКАЗ #{task_id} из Instagram</b>\n"
                        f"━━━━━━━━━━━━━━━━━━\n"
                        f"👤 Клиент: <b>{from_name}</b>\n"
                        f"🛒 Товар: <b>{product}</b>\n"
                        f"📊 Количество: <b>{quantity}</b>\n"
                        f"📱 Телефон: <b>{phone}</b>\n"
                        f"💰 Сумма: <b>{total}</b>\n"
                        f"━━━━━━━━━━━━━━━━━━\n"
                        f"✅ Задача создана → отдел продаж\n"
                        f"🤖 Клиенту уже ответили в DM",
                    )
                
                # 4. Публикуем ORDER_CREATED для PM, Finance, Analytics (без спама в чат)
                await event_bus.publish(
                    "order_created",
                    {
                        "source": "instagram",
                        "customer_name": from_name,
                        "product": product,
                        "quantity": quantity,
                        "phone": phone,
                        "address": address,
                        "total_amount": total,
                        "items_summary": f"{product} x {quantity}",
                        "order_number": f"IG-{task_id or '?'}",
                        "summary": f"IG заказ от {from_name}: {product} x {quantity} = {total}",
                    },
                    "stepan_bot"
                )
                logger.info("Степан: ORDER_CREATED → PM, Finance, Analytics")
                
            # Обычные сообщения (не заказы) — НЕ пересылаем, бот сам ведёт диалог
        except Exception as e:
            logger.error(f"Ошибка при обработке IG DM Степаном: {e}", exc_info=True)

    # Подписываемся на события
    for event_type in [
        "order_created", "complaint_received", "application_received",
        "large_expense_alert", "task_created", "task_completed",
        "b2b_lead_created", "order_status_changed", "feedback_received",
        "DELIVERY_STATUS_REPORT", "new_message",
    ]:
        event_bus.on(event_type, on_any_event)
        
    event_bus.on("TASK_COMPLETED", handle_task_completed)
    event_bus.on("TASK_CREATED", handle_pm_task_created)
    from shared.notifications import register_pm_handlers
    register_pm_handlers(event_bus, bot)
    event_bus.on("ig_dm_received", handle_ig_dm)

    # ── Подключение к шинам ──
    # EventBus теперь слушает через встроенный aiohttp сервер ниже
    # -- Startup / Shutdown --
    async def on_startup():
        logger.info("🤖 Степан запущен! Готов помогать.")
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if admin_id:
            try:
                await bot.send_message(
                    admin_id,
                    "🤖 <b>Степан на связи!</b>\n\n"
                    "Я ваш личный помощник. Пишите мне любые задачи,\n"
                    "вопросы или поручения — я разберусь.\n\n"
                    "💡 Примеры:\n"
                    "• <i>Подготовить 50 лотков руколы к пятнице</i>\n"
                    "• <i>Сколько мы заработали за эту неделю?</i>\n"
                    "• <i>Найди курьера на полный день</i>\n"
                    "• <i>Напиши пост для Instagram про скидку 20%</i>\n"
                    "• <i>Какой статус по всем задачам?</i>",
                )
            except Exception:
                pass

    dp.startup.register(on_startup)

    # ── Запуск планировщика и heartbeat ──
    # scheduler.add_cron(name="daily_report", func=daily_report, hour=9, minute=30)  # Убрано в пользу n8n
    await scheduler.start()
    asyncio.create_task(start_heartbeat("stepan_bot"))
    from shared.bot_bus import start_listener as bus_listen
    async def bus_get_tasks(params: dict) -> dict:
        try:
            from shared.database import get_session_ctx
            from sqlalchemy import text
            async with get_session_ctx() as session:
                res = await session.execute(text("SELECT id, title, department, status, priority, deadline FROM tasks WHERE status NOT IN ('done', 'cancelled') ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, deadline ASC NULLS LAST LIMIT 20"))
                rows = res.fetchall()
                res2 = await session.execute(text("SELECT status, COUNT(*) FROM tasks GROUP BY status"))
                stats = {r[0]: r[1] for r in res2.fetchall()}
            tasks_list = [{"id": r[0], "title": r[1], "department": r[2], "status": r[3], "priority": r[4], "deadline": str(r[5]) if r[5] else None} for r in rows]
            return {"status": "ok", "message": f"Активных задач: {len(tasks_list)}", "data": {"tasks": tasks_list, "stats": stats}}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def bus_get_deadlines(params: dict) -> dict:
        try:
            from shared.database import get_session_ctx
            from sqlalchemy import text
            async with get_session_ctx() as session:
                res = await session.execute(text("SELECT id, title, deadline, priority, department FROM tasks WHERE deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND status NOT IN ('done', 'cancelled') ORDER BY deadline ASC"))
                rows = res.fetchall()
            deadlines = [{"id": r[0], "title": r[1], "deadline": str(r[2]), "priority": r[3], "department": r[4]} for r in rows]
            return {"status": "ok", "message": f"Дедлайнов в ближайшие 7 дней: {len(deadlines)}", "data": deadlines}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    asyncio.create_task(bus_listen("stepan_bot", {
        "get_tasks": bus_get_tasks,
        "get_deadlines": bus_get_deadlines,
    }))


    # ── Webhook Server для n8n ──
    from aiohttp import web
    async def n8n_webhook_handler(request):
        try:
            data = await request.json()
            action = data.get("action")
            if action == "daily_report":
                asyncio.create_task(daily_report())
            elif action == "evening_summary":
                asyncio.create_task(evening_summary())
            elif action == "check_deadlines":
                asyncio.create_task(check_deadlines())
            elif action == "weekly_report":
                asyncio.create_task(weekly_report())
            elif action == "auto_task_creation":
                asyncio.create_task(auto_task_creation())
            elif action == "check_followups":
                asyncio.create_task(check_followups())

            elif action == "bus_get_tasks":
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    res = await session.execute(text(
                        "SELECT id, title, department, status, priority, deadline "
                        "FROM tasks WHERE status NOT IN ('done', 'cancelled') "
                        "ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
                        "WHEN 'medium' THEN 2 ELSE 3 END, deadline ASC NULLS LAST LIMIT 20"
                    ))
                    rows = res.fetchall()
                    res2 = await session.execute(text("SELECT status, COUNT(*) FROM tasks GROUP BY status"))
                    stats = {r[0]: r[1] for r in res2.fetchall()}
                tasks_list = [
                    {"id": r[0], "title": r[1], "department": r[2], "status": r[3],
                     "priority": r[4], "deadline": str(r[5]) if r[5] else None}
                    for r in rows
                ]
                return web.json_response({"status": "ok", "message": f"Активных задач: {len(tasks_list)}", "data": {"tasks": tasks_list, "stats": stats}})
            elif action == "bus_get_deadlines":
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    res = await session.execute(text(
                        "SELECT id, title, deadline, priority, department FROM tasks "
                        "WHERE deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 "
                        "AND status NOT IN ('done', 'cancelled') "
                        "ORDER BY deadline ASC"
                    ))
                    rows = res.fetchall()
                deadlines = [
                    {"id": r[0], "title": r[1], "deadline": str(r[2]), "priority": r[3], "department": r[4]}
                    for r in rows
                ]
                return web.json_response({"status": "ok", "message": f"Дедлайнов в ближайшие 7 дней: {len(deadlines)}", "data": deadlines})
            else:
                return web.json_response({"status": "error", "message": "Unknown action"}, status=400)
            return web.json_response({"status": "ok", "action": action})
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    app = web.Application()
    app.router.add_post('/n8n-webhook', n8n_webhook_handler)
    await event_bus.start_listening(8081, app)

    logger.info("🤖 Запуск Степана...")
    try:
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()


if __name__ == "__main__":
    asyncio.run(main())
