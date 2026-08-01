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
        token=settings.analytics_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

async def daily_kpi_snapshot() -> None:
    """Ежедневный KPI-отчёт в 20:00."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            # Выручка за сегодня
            res = await session.execute(
                text(
                    "SELECT COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE type = 'income' AND date = CURRENT_DATE"
                )
            )
            revenue = res.scalar() or 0

            # Количество заказов за сегодня
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE"
                )
            )
            order_count = res.scalar() or 0

            # Новые клиенты за сегодня
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers WHERE DATE(created_at) = CURRENT_DATE"
                )
            )
            new_customers = res.scalar() or 0

            # Средний чек
            avg_order = revenue / order_count if order_count > 0 else 0

        report = (
            "📊 <b>KPI за сегодня</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"💰 Выручка: <b>{'{:,.0f}'.format(revenue)} сум</b>\n"
            f"📦 Заказов: <b>{order_count}</b>\n"
            f"👤 Новых клиентов: <b>{new_customers}</b>\n"
            f"🧾 Средний чек: <b>{'{:,.0f}'.format(avg_order)} сум</b>\n\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "📈 <i>Analytics Bot — ежедневный снимок</i>"
        )
        await bot.send_message(admin_id, report, parse_mode="HTML")

        # Замыкаем петлю рассуждений для аналитики
        try:
            from shared.feedback_loop import feedback_loop

            await feedback_loop.evaluate_and_adapt(
                bot="analytics_bot",
                metric="daily_kpi",
                current_data={
                    "revenue": float(revenue),
                    "order_count": int(order_count),
                    "new_customers": int(new_customers),
                    "avg_order": float(avg_order),
                },
                benchmark_data={"target_daily_revenue": 1000000, "target_orders": 10},
            )
        except Exception as fe:
            logger.warning(f"Feedback loop trigger error in analytics_bot: {fe}")
    except Exception as e:
        logger.error(f"daily_kpi_snapshot error: {e}", exc_info=True)
    finally:
        await bot.session.close()


async def weekly_trends() -> dict:
    """Еженедельное сравнение (понедельник 9:00): эта неделя vs прошлая."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            # Эта неделя (с понедельника)
            res = await session.execute(
                text(
                    "SELECT COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE type = 'income' "
                    "AND date >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days' "
                    "AND date < date_trunc('week', CURRENT_DATE)"
                )
            )
            last_week_revenue = res.scalar() or 0

            res = await session.execute(
                text(
                    "SELECT COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE type = 'income' "
                    "AND date >= date_trunc('week', CURRENT_DATE)"
                )
            )
            this_week_revenue = res.scalar() or 0

            # Заказы
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM orders "
                    "WHERE created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days' "
                    "AND created_at < date_trunc('week', CURRENT_DATE)"
                )
            )
            last_week_orders = res.scalar() or 0

            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM orders "
                    "WHERE created_at >= date_trunc('week', CURRENT_DATE)"
                )
            )
            this_week_orders = res.scalar() or 0

            # Клиенты
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers "
                    "WHERE created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days' "
                    "AND created_at < date_trunc('week', CURRENT_DATE)"
                )
            )
            last_week_customers = res.scalar() or 0

            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers "
                    "WHERE created_at >= date_trunc('week', CURRENT_DATE)"
                )
            )
            this_week_customers = res.scalar() or 0

        def pct(new: float, old: float) -> str:
            if old == 0:
                return "+∞%" if new > 0 else "0%"
            change = ((new - old) / old) * 100
            sign = "+" if change >= 0 else ""
            return f"{sign}{change:.1f}%"

        report = (
            "📈 <b>Недельные тренды</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"💰 <b>Выручка:</b>\n"
            f"  Эта неделя: {'{:,.0f}'.format(this_week_revenue)} сум\n"
            f"  Прошлая: {'{:,.0f}'.format(last_week_revenue)} сум\n"
            f"  Изменение: <b>{pct(this_week_revenue, last_week_revenue)}</b>\n\n"
            f"📦 <b>Заказы:</b>\n"
            f"  Эта неделя: {this_week_orders}\n"
            f"  Прошлая: {last_week_orders}\n"
            f"  Изменение: <b>{pct(this_week_orders, last_week_orders)}</b>\n\n"
            f"👤 <b>Новые клиенты:</b>\n"
            f"  Эта неделя: {this_week_customers}\n"
            f"  Прошлая: {last_week_customers}\n"
            f"  Изменение: <b>{pct(this_week_customers, last_week_customers)}</b>\n\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "📊 <i>Analytics Bot — недельный тренд</i>"
        )
        await bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logger.error(f"weekly_trends error: {e}", exc_info=True)
    finally:
        await bot.session.close()


async def sales_anomaly() -> None:
    """Каждые 6 часов: проверка аномалий выручки."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            # Средняя дневная выручка за 30 дней
            res = await session.execute(
                text(
                    "SELECT COALESCE(AVG(daily_sum), 0) FROM ("
                    "  SELECT date, SUM(amount) AS daily_sum FROM finances "
                    "  WHERE type = 'income' "
                    "  AND date >= CURRENT_DATE - INTERVAL '30 days' "
                    "  AND date < CURRENT_DATE "
                    "  GROUP BY date"
                    ") sub"
                )
            )
            avg_daily = res.scalar() or 0

            # Выручка сегодня
            res = await session.execute(
                text(
                    "SELECT COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE type = 'income' AND date = CURRENT_DATE"
                )
            )
            today_revenue = res.scalar() or 0

        if avg_daily == 0:
            await bot.session.close()
            return

        ratio = today_revenue / avg_daily

        if ratio < 0.5:
            alert = (
                "🔴 <b>АНОМАЛИЯ: Низкая выручка!</b>\n\n"
                f"Сегодня: <b>{'{:,.0f}'.format(today_revenue)} сум</b>\n"
                f"Среднее за 30 дней: {'{:,.0f}'.format(avg_daily)} сум\n"
                f"Отклонение: <b>{ratio * 100:.0f}%</b> от среднего\n\n"
                "⚠️ Выручка ниже 50% от среднего!"
            )
            await bot.send_message(admin_id, alert, parse_mode="HTML")
        elif ratio > 2.0:
            alert = (
                "🟢 <b>АНОМАЛИЯ: Высокая выручка!</b>\n\n"
                f"Сегодня: <b>{'{:,.0f}'.format(today_revenue)} сум</b>\n"
                f"Среднее за 30 дней: {'{:,.0f}'.format(avg_daily)} сум\n"
                f"Отклонение: <b>{ratio * 100:.0f}%</b> от среднего\n\n"
                "🚀 Выручка выше 200% от среднего!"
            )
            await bot.send_message(admin_id, alert, parse_mode="HTML")
    except Exception as e:
        logger.error(f"sales_anomaly error: {e}", exc_info=True)
    finally:
        await bot.session.close()


async def monthly_executive() -> None:
    """1-го числа в 10:00: полный месячный отчёт с AI-рекомендациями."""
    try:
        bot = await _get_bot()
        from shared.ai_engine import AIEngine

        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            # Выручка и расходы за прошлый месяц
            res = await session.execute(
                text(
                    "SELECT type, COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' "
                    "AND date < date_trunc('month', CURRENT_DATE) "
                    "GROUP BY type"
                )
            )
            fin = dict(res.fetchall())
            income = fin.get("income", 0)
            expense = fin.get("expense", 0)
            profit = income - expense

            # Топ продукты
            res = await session.execute(
                text(
                    "SELECT p.name_ru, SUM(oi.quantity) AS qty, SUM(oi.subtotal) AS total "
                    "FROM order_items oi "
                    "JOIN products p ON oi.product_id = p.id "
                    "JOIN orders o ON oi.order_id = o.id "
                    "WHERE o.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' "
                    "AND o.created_at < date_trunc('month', CURRENT_DATE) "
                    "GROUP BY p.name_ru ORDER BY total DESC LIMIT 5"
                )
            )
            top_products = res.fetchall()

            # Рост клиентов
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers "
                    "WHERE created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' "
                    "AND created_at < date_trunc('month', CURRENT_DATE)"
                )
            )
            new_customers = res.scalar() or 0

            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers "
                    "WHERE created_at < date_trunc('month', CURRENT_DATE)"
                )
            )
            total_customers = res.scalar() or 0

        # Формируем данные для AI
        top_str = (
            "\n".join(
                [
                    f"  {i + 1}. {name} — {qty} шт, {'{:,.0f}'.format(total)} сум"
                    for i, (name, qty, total) in enumerate(top_products)
                ]
            )
            if top_products
            else "  Нет данных"
        )

        data_summary = (
            f"Доход: {'{:,.0f}'.format(income)} сум\n"
            f"Расход: {'{:,.0f}'.format(expense)} сум\n"
            f"Прибыль: {'{:,.0f}'.format(profit)} сум\n"
            f"Новых клиентов: {new_customers}\n"
            f"Всего клиентов: {total_customers}\n"
            f"Топ продукты:\n{top_str}"
        )

        ai = AIEngine()
        ai_analysis = await ai.chat_completion(
            "Ты бизнес-аналитик микрозелени в Узбекистане. Дай краткий анализ и 3 рекомендации.",
            f"Данные за прошлый месяц:\n{data_summary}\n\nДай анализ и рекомендации.",
        )

        report = (
            "📋 <b>Ежемесячный отчёт руководителя</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"💰 Доход: <b>{'{:,.0f}'.format(income)} сум</b>\n"
            f"💸 Расход: <b>{'{:,.0f}'.format(expense)} сум</b>\n"
            f"📈 Прибыль: <b>{'{:,.0f}'.format(profit)} сум</b>\n\n"
            f"🏆 <b>Топ продукты:</b>\n{top_str}\n\n"
            f"👥 Новых клиентов: <b>{new_customers}</b>\n"
            f"👥 Всего клиентов: <b>{total_customers}</b>\n\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🤖 <b>AI-анализ:</b>\n{ai_analysis}\n\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "📊 <i>Analytics Bot — ежемесячный executive report</i>"
        )
        # Telegram ограничение 4096 символов
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
        logger.error(f"monthly_executive error: {e}", exc_info=True)
    finally:
        await bot.session.close()


async def conversion_funnel() -> None:
    """Ежедневно в 15:00: воронка конверсии по статусам клиентов."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT COALESCE(status, 'unknown'), COUNT(*) FROM customers GROUP BY status ORDER BY COUNT(*) DESC"
                )
            )
            statuses = res.fetchall()

            res = await session.execute(text("SELECT COUNT(*) FROM customers"))
            total = res.scalar() or 0

        if total == 0:
            await bot.session.close()
            return

        status_icons = {
            "lead": "🔵",
            "active": "🟢",
            "vip": "⭐",
            "churned": "🔴",
            "unknown": "⚪",
        }

        lines = ["🔄 <b>Воронка конверсии клиентов</b>\n", "━━━━━━━━━━━━━━━━━━━━━━\n"]
        for status, count in statuses:
            pct = (count / total) * 100
            icon = status_icons.get(status, "⚪")
            bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
            lines.append(f"{icon} <b>{status}</b>: {count} ({pct:.1f}%)\n  {bar}")

        lines.append("\n━━━━━━━━━━━━━━━━━━━━━━")
        lines.append(f"👥 Всего клиентов: <b>{total}</b>")
        lines.append("\n📊 <i>Analytics Bot — конверсия</i>")

        await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logger.error(f"conversion_funnel error: {e}", exc_info=True)
    finally:
        await bot.session.close()


async def b2b_funnel_report() -> None:
    """Ежедневно в 16:00: воронка B2B-аутрича (сбор → контакт → конверсия)."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            # Всего B2B-лидов и сколько собрано сегодня
            total_b2b = (
                await session.execute(
                    text("SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b'")
                )
            ).scalar() or 0
            new_today = (
                await session.execute(
                    text(
                        "SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b' "
                        "AND DATE(created_at AT TIME ZONE 'Asia/Samarkand') = "
                        "    (NOW() AT TIME ZONE 'Asia/Samarkand')::date"
                    )
                )
            ).scalar() or 0
            # Контакты по каналам (уникальные заведения)
            contacted = (
                await session.execute(
                    text(
                        "SELECT COUNT(DISTINCT customer_id) FROM interactions "
                        "WHERE interaction_type = 'b2b_offer_sent'"
                    )
                )
            ).scalar() or 0
            by_channel = (
                await session.execute(
                    text(
                        "SELECT channel, COUNT(DISTINCT customer_id) FROM interactions "
                        "WHERE interaction_type = 'b2b_offer_sent' GROUP BY channel"
                    )
                )
            ).fetchall()
            # Конвертировано (лид → active/vip)
            converted = (
                await session.execute(
                    text(
                        "SELECT COUNT(*) FROM customers WHERE customer_type = 'b2b' "
                        "AND status IN ('active', 'vip')"
                    )
                )
            ).scalar() or 0
            # По источникам
            by_source = (
                await session.execute(
                    text(
                        "SELECT COALESCE(source, 'не указан'), COUNT(*) FROM customers "
                        "WHERE customer_type = 'b2b' GROUP BY source ORDER BY COUNT(*) DESC"
                    )
                )
            ).fetchall()

        conv_rate = (converted / contacted * 100) if contacted else 0
        ch_map = {"email": "📧 email", "phone_task": "📞 обзвон"}
        ch_lines = (
            "\n".join(f"  {ch_map.get(c, c or '—')}: {n}" for c, n in by_channel)
            or "  —"
        )
        src_lines = "\n".join(f"  • {s}: {n}" for s, n in by_source) or "  —"

        report = (
            "🍽 <b>Воронка B2B (рестораны)</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📥 Собрано лидов: <b>{total_b2b}</b> (+{new_today} сегодня)\n"
            f"📨 Отправлено КП/задач: <b>{contacted}</b>\n{ch_lines}\n"
            f"✅ Конвертировано: <b>{converted}</b>\n"
            f"📈 Конверсия: <b>{conv_rate:.1f}%</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"<b>По источникам:</b>\n{src_lines}\n\n"
            "📊 <i>Analytics Bot — B2B воронка</i>"
        )
        await bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logger.error(f"b2b_funnel_report error: {e}", exc_info=True)
    finally:
        await bot.session.close()


def register_analytics_tasks(scheduler: BotScheduler) -> None:
    scheduler.add_cron(name="daily_kpi_snapshot", func=daily_kpi_snapshot, hour=20, minute=0)
    scheduler.add_cron(name="b2b_funnel_report", func=b2b_funnel_report, hour=16, minute=0)
    scheduler.add_cron(name="weekly_trends", func=weekly_trends, hour=9, minute=0, day_of_week=0)
    scheduler.add_interval(name="sales_anomaly", func=sales_anomaly, seconds=6 * 3600)
    scheduler.add_cron(name="monthly_executive", func=monthly_executive, hour=10, minute=0, day_of_month=1)
    scheduler.add_cron(name="conversion_funnel", func=conversion_funnel, hour=15, minute=0)
