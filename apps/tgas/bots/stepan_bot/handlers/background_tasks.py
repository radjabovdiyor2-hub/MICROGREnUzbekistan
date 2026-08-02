import logging
import asyncio
from pathlib import Path
from sqlalchemy import text as sa_text
from aiogram import Bot

from shared.config import settings
from shared.database import get_session_ctx
from shared.event_bus import event_bus
from shared.health import check_all_bots, format_health_report
from shared.notifications import alert_admins
from shared.owner_alerts import raise_alert, SEVERITY_WARNING, SEVERITY_CRITICAL, SEVERITY_INFO
from shared.utils import format_price
from shared.ai_engine import AIEngine
from shared.backup import daily_backup_task
from shared.token_refresh import auto_refresh_token
from bots.stepan_bot.handlers.team_meeting import run_kpi_watchdog

logger = logging.getLogger(__name__)

# Добавляем корень проекта в sys.path
ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent

_last_down_bots: set[str] = set()


async def check_deadlines(bot: Bot) -> None:
    """Каждый час проверяем просроченные задачи и уведомляем админа."""
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if not admin_id:
            return

        async with get_session_ctx() as session:
            res = await session.execute(
                sa_text(
                    "SELECT id, title, department, deadline "
                    "FROM tasks "
                    "WHERE deadline < CURRENT_DATE AND status NOT IN ('done', 'cancelled') "
                    "ORDER BY deadline ASC LIMIT 10"
                )
            )
            overdue = res.fetchall()

        if overdue:
            lines = ["⏰ <b>Просроченные задачи:</b>\n"]
            for row in overdue:
                tid, title, dept, deadline = row
                dept_str = f" ({dept})" if dept else ""
                dl = deadline.strftime("%d.%m.%Y") if deadline else "?"
                lines.append(f"• <b>#{tid}</b>{dept_str}: {title[:80]} — дедлайн был {dl}")
            lines.append(f"\n🔴 Всего просрочено: {len(overdue)}")
            await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
            logger.info(f"Отправлено уведомление о {len(overdue)} просроченных задачах")

            await raise_alert(
                kind="deadline",
                severity=SEVERITY_WARNING,
                title=f"Просрочено задач: {len(overdue)}",
                message="\n".join(lines[1:]),
                source="stepan_bot",
            )
    except Exception as e:
        logger.warning(f"Ошибка проверки дедлайнов: {e}")


async def daily_report(bot: Bot) -> None:
    """Каждый день в 9:00 отправляем сводку руководителю."""
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if not admin_id:
            return

        async with get_session_ctx() as session:
            res = await session.execute(sa_text("SELECT status, COUNT(*) FROM tasks GROUP BY status"))
            task_stats = dict(res.fetchall())

            res = await session.execute(
                sa_text(
                    "SELECT id, title, department FROM tasks "
                    "WHERE status NOT IN ('done', 'cancelled') "
                    "AND created_at < CURRENT_DATE "
                    "ORDER BY created_at ASC LIMIT 10"
                )
            )
            yesterday_tasks = res.fetchall()

            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*) FROM tasks "
                    "WHERE deadline < CURRENT_DATE AND status NOT IN ('done', 'cancelled')"
                )
            )
            overdue_count = res.scalar() or 0

            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders "
                    "WHERE DATE(created_at) = CURRENT_DATE"
                )
            )
            today_orders, today_revenue = res.fetchone()

            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders "
                    "WHERE DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'"
                )
            )
            yesterday_orders, yesterday_revenue = res.fetchone()

            res = await session.execute(
                sa_text(
                    "SELECT type, COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) "
                    "GROUP BY type"
                )
            )
            fin = dict(res.fetchall())
            income = fin.get("income", 0)
            expense = fin.get("expense", 0)

        todo = task_stats.get("todo", 0)
        in_progress = task_stats.get("in_progress", 0)
        done = task_stats.get("done", 0)

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

        lines.extend(
            [
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
            ]
        )

        await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        logger.info("Утренний отчёт отправлен!")
    except Exception as e:
        logger.warning(f"Ошибка отправки утреннего отчёта: {e}")


async def check_followups(bot: Bot) -> None:
    """Каждые 30 минут проверяем pending follow-ups и делегируем отправку Sales боту."""
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                sa_text(
                    "SELECT f.id, f.message, c.telegram_id "
                    "FROM followups f "
                    "JOIN customers c ON f.customer_id = c.id "
                    "WHERE f.status = 'pending' AND f.scheduled_at <= NOW() "
                    "LIMIT 10"
                )
            )
            followups = res.fetchall()

        if not followups:
            return

        for fid, msg, tg_id in followups:
            if not tg_id:
                continue
            try:
                await bot.send_message(tg_id, f"🌱 {msg}")
                async with get_session_ctx() as session:
                    await session.execute(
                        sa_text("UPDATE followups SET status = 'sent' WHERE id = :fid"),
                        {"fid": fid},
                    )
                    await session.execute(
                        sa_text(
                            "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                            "VALUES ((SELECT customer_id FROM followups WHERE id = :fid), "
                            "'telegram', 'followup', 'stepan_bot', :summary)"
                        ),
                        {"fid": fid, "summary": msg[:200]},
                    )
                logger.info(f"Follow-up #{fid} отправлен клиенту {tg_id}")
            except Exception as e:
                logger.warning(f"Follow-up #{fid} ошибка: {e}")
    except Exception as e:
        logger.warning(f"Ошибка проверки follow-ups: {e}")


async def evening_summary(bot: Bot) -> None:
    """Ежедневно в 20:00: итоги дня."""
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if not admin_id:
            return

        async with get_session_ctx() as session:
            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*) FROM tasks "
                    "WHERE status = 'done' AND DATE(updated_at) = CURRENT_DATE"
                )
            )
            tasks_completed = res.scalar() or 0

            res = await session.execute(
                sa_text("SELECT COUNT(*) FROM tasks WHERE status NOT IN ('done', 'cancelled')")
            )
            tasks_remaining = res.scalar() or 0

            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders "
                    "WHERE DATE(created_at) = CURRENT_DATE"
                )
            )
            new_orders, revenue = res.fetchone()

            res = await session.execute(
                sa_text(
                    "SELECT id, title, department FROM tasks "
                    "WHERE deadline = CURRENT_DATE + INTERVAL '1 day' "
                    "AND status NOT IN ('done', 'cancelled') "
                    "ORDER BY id LIMIT 5"
                )
            )
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

        lines.extend(
            [
                "\n━━━━━━━━━━━━━━━━━━━━━━",
                "\n🌙 Хорошего вечера! Степан всё контролирует.",
            ]
        )

        await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logger.warning(f"Ошибка вечернего отчёта: {e}")


async def weekly_report(bot: Bot) -> None:
    """Понедельник 9:00 (после daily_report): недельная сводка с AI-анализом."""
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if not admin_id:
            return

        async with get_session_ctx() as session:
            res = await session.execute(
                sa_text(
                    "SELECT status, COUNT(*) FROM tasks "
                    "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' "
                    "GROUP BY status"
                )
            )
            week_tasks = dict(res.fetchall())

            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders "
                    "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
                )
            )
            week_orders, week_revenue = res.fetchone()

            res = await session.execute(
                sa_text(
                    "SELECT type, COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE date >= CURRENT_DATE - INTERVAL '7 days' "
                    "GROUP BY type"
                )
            )
            fin = dict(res.fetchall())
            income = fin.get("income", 0)
            expense = fin.get("expense", 0)

            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*) FROM customers "
                    "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
                )
            )
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
            f"Данные за прошлую неделю:\n{data_summary}\n\nДай анализ и рекомендации.",
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
            await bot.send_message(
                admin_id,
                report[:4000] + "\n\n<i>...продолжение↓</i>",
                parse_mode="HTML",
            )
            await bot.send_message(admin_id, report[4000:], parse_mode="HTML")
        else:
            await bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logger.warning(f"Ошибка недельного отчёта: {e}")


async def auto_task_creation(bot: Bot) -> None:
    """Каждые 4 часа: автоматическое создание задач по условиям."""
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        created_tasks = []

        async with get_session_ctx() as session:
            res = await session.execute(
                sa_text(
                    "SELECT p.id, p.name_ru, p.stock_qty FROM products p "
                    "WHERE p.stock_qty < 3 AND p.is_active = true "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM tasks t "
                    "  WHERE t.title LIKE '%' || p.name_ru || '%' "
                    "  AND t.status NOT IN ('done', 'cancelled') "
                    "  AND t.created_at > CURRENT_DATE - INTERVAL '1 day'"
                    ")"
                )
            )
            low_stock = res.fetchall()

            for pid, name, qty in low_stock:
                res = await session.execute(
                    sa_text(
                        "INSERT INTO tasks (title, description, department, status, created_at) "
                        "VALUES (:title, :desc, 'operations', 'todo', NOW()) RETURNING id"
                    ),
                    {
                        "title": f"🔄 Пополнить запас: {name}",
                        "desc": f"Остаток: {qty} шт. Необходимо пополнить запас продукта '{name}' (ID: {pid}).",
                    },
                )
                task_id = res.scalar()
                await session.commit()
                created_tasks.append(f"📦 Пополнить {name} (остаток: {qty})")

                if admin_id:
                    await event_bus.publish(
                        "TASK_CREATED",
                        {
                            "task_id": task_id,
                            "title": f"Пополнить запас: {name}",
                            "department": "operations",
                            "chat_id": admin_id,
                        },
                        "stepan_bot",
                    )

            res = await session.execute(
                sa_text(
                    "SELECT o.id, o.created_at FROM orders o "
                    "WHERE o.status = 'new' "
                    "AND o.created_at < NOW() - INTERVAL '24 hours' "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM tasks t "
                    "  WHERE t.title LIKE '%Заказ #' || o.id::text || '%' "
                    "  AND t.status NOT IN ('done', 'cancelled') "
                    "  AND t.created_at > CURRENT_DATE - INTERVAL '1 day'"
                    ")"
                )
            )
            stale_orders = res.fetchall()

            for oid, created_at in stale_orders:
                res = await session.execute(
                    sa_text(
                        "INSERT INTO tasks (title, description, department, status, created_at) "
                        "VALUES (:title, :desc, 'sales', 'todo', NOW()) RETURNING id"
                    ),
                    {
                        "title": f"⚠️ Обработать Заказ #{oid}",
                        "desc": f"Заказ #{oid} от {created_at.strftime('%d.%m %H:%M')} не обработан более 24 часов.",
                    },
                )
                task_id = res.scalar()
                await session.commit()
                created_tasks.append(f"📋 Обработать заказ #{oid}")

                if admin_id:
                    await event_bus.publish(
                        "TASK_CREATED",
                        {
                            "task_id": task_id,
                            "title": f"Обработать Заказ #{oid}",
                            "department": "sales",
                            "chat_id": admin_id,
                        },
                        "stepan_bot",
                    )

        if created_tasks and admin_id:
            lines = [
                "🤖 <b>Авто-задачи созданы:</b>\n",
                "━━━━━━━━━━━━━━━━━━━━━━\n",
            ]
            for t in created_tasks:
                lines.append(f"  • {t}")
            lines.append(f"\n✅ Создано задач: <b>{len(created_tasks)}</b>")
            await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logger.warning(f"Ошибка автосоздания задач: {e}")


async def bot_health_check(bot: Bot, force: bool = False) -> None:
    """Проверка здоровья всех ботов. Алертит при ИЗМЕНЕНИИ статуса."""
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

        report = format_health_report(statuses)
        if down and (force or newly_down):
            await alert_admins(
                bot,
                f"🚨 <b>АЛЕРТ: боты не отвечают!</b>\n\n{report}\n\n⚠️ Проверьте работу ботов!",
            )
            logger.warning("Боты не отвечают: %s", ", ".join(sorted(down)))
            if newly_down:
                await raise_alert(
                    kind="bot_down",
                    severity=SEVERITY_CRITICAL,
                    title=f"Не отвечают боты: {', '.join(sorted(newly_down))}",
                    message=report,
                    source="stepan_bot",
                )
        elif recovered and not down:
            await alert_admins(bot, f"✅ <b>Все боты снова онлайн</b>\n\n{report}")
            await raise_alert(
                kind="bot_recovered",
                severity=SEVERITY_INFO,
                title="Все боты снова онлайн",
                message=report,
                source="stepan_bot",
            )
        elif force:
            await alert_admins(bot, report)
    except Exception as e:
        logger.warning(f"Ошибка проверки здоровья: {e}")


async def bot_health_summary(bot: Bot) -> None:
    """Ежедневная (09:00) полная сводка статуса ботов — всегда присылается."""
    await bot_health_check(bot, force=True)


async def daily_backup(bot: Bot) -> None:
    await daily_backup_task(bot)


async def token_refresh() -> None:
    try:
        await auto_refresh_token()
    except Exception as e:
        logger.warning(f"Token refresh error: {e}")


async def kpi_watchdog_job(bot: Bot) -> None:
    try:
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        chat = getattr(settings, "sales_group_id", 0) or admin_id
        if bot and chat:
            kpi_dropped = await run_kpi_watchdog(bot, chat)
            if kpi_dropped:
                await raise_alert(
                    kind="kpi_drop",
                    severity=SEVERITY_WARNING,
                    title="Зафиксировано проседание KPI отделов",
                    message="KPI-watchdog зафиксировал снижение показателей и автоматически созвал совещание отделов.",
                    source="stepan_bot",
                )
    except Exception as e:
        logger.warning(f"KPI watchdog job error: {e}")


async def cron_magazine_prepare() -> None:
    try:
        import aiohttp
        import os

        secret = os.environ.get("BOT_SECRET", "")
        storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{storefront_url}/admin/magazine/cron/prepare",
                headers={"x-bot-secret": secret},
            ) as resp:
                data = await resp.json()
                logger.info(f"Cron Prepare: {data}")
    except Exception as e:
        logger.error(f"Cron Prepare error: {e}")


async def cron_magazine_finalize() -> None:
    try:
        import aiohttp
        import os

        secret = os.environ.get("BOT_SECRET", "")
        storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{storefront_url}/admin/magazine/cron/finalize",
                headers={"x-bot-secret": secret},
            ) as resp:
                data = await resp.json()
                logger.info(f"Cron Finalize: {data}")
    except Exception as e:
        logger.error(f"Cron Finalize error: {e}")


async def cron_magazine_print_run(bot: Bot) -> None:
    try:
        import aiohttp
        import os

        secret = os.environ.get("BOT_SECRET", "")
        storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{storefront_url}/admin/magazine/cron/print-run",
                headers={"x-bot-secret": secret},
            ) as resp:
                data = await resp.json()
                logger.info(f"Cron Print-Run: {data}")

                slugs = data.get("slugs", [])
                if slugs:
                    if admin_id and bot:
                        logger.info(f"Generating PDF for {len(slugs)} magazines...")

                    for slug in slugs:
                        logger.info(f"Generating PDF for {slug}...")
                        process = await asyncio.create_subprocess_exec(
                            "node",
                            "scripts/generate-magazine-pdf.js",
                            slug,
                            cwd=str(ROOT),
                        )
                        await process.communicate()

                    if admin_id and bot:
                        logger.info(f"PDF generation finished for {len(slugs)} magazines")

    except Exception as e:
        logger.error(f"Cron Print-Run error: {e}")


async def process_green_box_subscriptions(bot: Bot) -> None:
    """Ежедневно в 8:00 — создаёт заказы из подписок, у которых nextDelivery = завтра.

    Логика:
    1. Найти все ACTIVE подписки, где next_delivery = завтра.
    2. Для каждой создать Order через POST /api/orders (тот же путь, что и корзина).
    3. Сдвинуть next_delivery на следующий интервал.
    4. Отправить уведомление владельцу бизнеса.
    """
    import aiohttp
    from datetime import date, timedelta

    admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
    tomorrow = date.today() + timedelta(days=1)
    created_count = 0
    errors: list[str] = []

    try:
        async with get_session_ctx() as session:
            # Подписки с доставкой завтра
            result = await session.execute(
                sa_text(
                    "SELECT s.id, s.user_id, s.address, s.phone, s.city, s.interval, s.delivery_day "
                    "FROM green_box_subscriptions s "
                    "WHERE s.status = 'ACTIVE' AND s.next_delivery = :tomorrow"
                ),
                {"tomorrow": tomorrow},
            )
            subs = result.fetchall()

            if not subs:
                logger.info("GreenBox: нет подписок на завтра")
                return

            for sub in subs:
                sub_id, user_id, address, phone, city, interval, delivery_day = sub

                # Получаем состав подписки
                items_result = await session.execute(
                    sa_text(
                        "SELECT gi.product_id, gi.quantity, p.price "
                        "FROM green_box_items gi "
                        "JOIN products p ON p.id = gi.product_id "
                        "WHERE gi.subscription_id = :sub_id"
                    ),
                    {"sub_id": sub_id},
                )
                items = items_result.fetchall()
                if not items:
                    continue

                # Создаём заказ через внутренний API
                storefront_url = settings.storefront_url or "http://localhost:3005"
                order_payload = {
                    "userId": user_id,
                    "customer": {
                        "firstName": "Подписка GreenBox",
                        "phone": phone,
                        "address": address,
                    },
                    "city": city,
                    "items": [
                        {"productId": pid, "price": price, "quantity": qty}
                        for pid, qty, price in items
                    ],
                    "paymentMethod": "cash",
                    "isSubscription": True,
                }

                try:
                    async with aiohttp.ClientSession() as http:
                        async with http.post(
                            f"{storefront_url}/api/orders",
                            json=order_payload,
                            timeout=aiohttp.ClientTimeout(total=30),
                        ) as resp:
                            data = await resp.json()
                            if data.get("success"):
                                created_count += 1
                            else:
                                errors.append(f"sub={sub_id}: {data.get('error', 'unknown')}")
                except Exception as req_err:
                    errors.append(f"sub={sub_id}: {req_err}")

                # Сдвигаем next_delivery на следующий период
                interval_days = {"MONTHLY": 28, "BIWEEKLY": 14, "WEEKLY": 7}.get(interval, 7)
                next_date = tomorrow + timedelta(days=interval_days)
                await session.execute(
                    sa_text(
                        "UPDATE green_box_subscriptions "
                        "SET next_delivery = :next_date, updated_at = NOW() "
                        "WHERE id = :sub_id"
                    ),
                    {"next_date": next_date, "sub_id": sub_id},
                )

            await session.commit()

        # Уведомление
        if admin_id and (created_count > 0 or errors):
            msg = f"📦 <b>GreenBox подписки:</b>\n✅ Создано заказов: {created_count}"
            if errors:
                msg += f"\n❌ Ошибок: {len(errors)}\n" + "\n".join(errors[:5])
            try:
                await bot.send_message(admin_id, msg)
            except Exception:
                pass

        logger.info(f"GreenBox: создано {created_count} заказов, ошибок {len(errors)}")

    except Exception as e:
        logger.error(f"GreenBox cron error: {e}")
        if admin_id:
            try:
                await bot.send_message(admin_id, f"❌ GreenBox cron ошибка: {e}")
            except Exception:
                pass

