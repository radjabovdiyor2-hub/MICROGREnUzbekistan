"""Analytics Bot — main.py с EventBus интеграцией"""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.prompts import role_prompt
from shared.config import settings
from shared.database import init_db, get_session_ctx
from shared.event_bus import event_bus
from shared.notifications import register_analytics_handlers
from bots.analytics_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.analytics_bot.handlers.ai_analytics import ai_chat
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Глобальные ссылки для задач ──────────────────────────────────────────
_bot: Bot = None
scheduler = BotScheduler("analytics_bot")


# ═══════════════════════════════════════════════════════════════════════════
# ФОНОВЫЕ ЗАДАЧИ
# ═══════════════════════════════════════════════════════════════════════════


async def daily_kpi_snapshot():
    """Ежедневный KPI-отчёт в 20:00."""
    try:
        from sqlalchemy import text

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
                    "SELECT COUNT(*) FROM crm_orders WHERE DATE(created_at) = CURRENT_DATE"
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
        await _bot.send_message(admin_id, report, parse_mode="HTML")

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
            logging.warning(f"Feedback loop trigger error in analytics_bot: {fe}")
    except Exception as e:
        logging.error(f"daily_kpi_snapshot error: {e}", exc_info=True)


async def weekly_trends():
    """Еженедельное сравнение (понедельник 9:00): эта неделя vs прошлая."""
    try:
        from sqlalchemy import text

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
                    "SELECT COUNT(*) FROM crm_orders "
                    "WHERE created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days' "
                    "AND created_at < date_trunc('week', CURRENT_DATE)"
                )
            )
            last_week_orders = res.scalar() or 0

            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM crm_orders "
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

        def pct(new, old):
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
        await _bot.send_message(admin_id, report, parse_mode="HTML")

        # Запускаем автономную оценку охватов для Контент-бота
        try:
            from shared.feedback_loop import feedback_loop
            async with get_session_ctx() as session:
                res_reach = await session.execute(
                    text("SELECT COALESCE(SUM(reach), 0) FROM content_publications WHERE date >= to_char(CURRENT_DATE - INTERVAL '7 days', 'YYYY-MM-DD')")
                )
                weekly_reach = res_reach.scalar() or 0
            
            await feedback_loop.evaluate_and_adapt(
                bot="content_bot",
                metric="weekly_reach",
                current_data={"weekly_reach": int(weekly_reach)},
                benchmark_data={"target_weekly_reach": 5000},
            )

            # Запускаем автономную оценку конверсии лидов для Sales Bot
            conv_rate = (this_week_orders / this_week_customers * 100) if this_week_customers > 0 else 0
            await feedback_loop.evaluate_and_adapt(
                bot="sales_bot",
                metric="conversion",
                current_data={"orders": this_week_orders, "leads": this_week_customers, "conversion_rate_pct": conv_rate},
                benchmark_data={"target_conversion_rate": 30.0},
            )

        except Exception as fe:
            logging.warning(f"Feedback loop trigger error in analytics_bot: {fe}")

    except Exception as e:
        logging.error(f"weekly_trends error: {e}", exc_info=True)


async def sales_anomaly():
    """Каждые 6 часов: проверка аномалий выручки."""
    try:
        from sqlalchemy import text

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
            await _bot.send_message(admin_id, alert, parse_mode="HTML")
        elif ratio > 2.0:
            alert = (
                "🟢 <b>АНОМАЛИЯ: Высокая выручка!</b>\n\n"
                f"Сегодня: <b>{'{:,.0f}'.format(today_revenue)} сум</b>\n"
                f"Среднее за 30 дней: {'{:,.0f}'.format(avg_daily)} сум\n"
                f"Отклонение: <b>{ratio * 100:.0f}%</b> от среднего\n\n"
                "🚀 Выручка выше 200% от среднего!"
            )
            await _bot.send_message(admin_id, alert, parse_mode="HTML")
    except Exception as e:
        logging.error(f"sales_anomaly error: {e}", exc_info=True)


async def monthly_executive():
    """1-го числа в 10:00: полный месячный отчёт с AI-рекомендациями."""
    try:
        from sqlalchemy import text
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
                    # Сумма строки — total_price. Колонки subtotal у позиций
                    # заказа нет и не было: запрос падал с UndefinedColumn,
                    # ошибка уходила в except, и месячный отчёт руководителю
                    # молча приходил без топа товаров.
                    "SELECT p.name_ru, SUM(oi.quantity) AS qty, SUM(oi.total_price) AS total "
                    "FROM crm_order_items oi "
                    "JOIN crm_products p ON oi.product_id = p.id "
                    "JOIN crm_orders o ON oi.order_id = o.id "
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
            role_prompt("Ты бизнес-аналитик микрозелени в Узбекистане. Дай краткий анализ и 3 рекомендации."),
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
            await _bot.send_message(
                admin_id,
                report[:4000] + "\n\n<i>...продолжение↓</i>",
                parse_mode="HTML",
            )
            await _bot.send_message(admin_id, report[4000:], parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logging.error(f"monthly_executive error: {e}", exc_info=True)


async def conversion_funnel():
    """Ежедневно в 15:00: воронка конверсии по статусам клиентов."""
    try:
        from sqlalchemy import text

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

        await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logging.error(f"conversion_funnel error: {e}", exc_info=True)


async def b2b_funnel_report():
    """Ежедневно в 16:00: воронка B2B-аутрича (сбор → контакт → конверсия)."""
    try:
        from sqlalchemy import text

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
        await _bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logging.error(f"b2b_funnel_report error: {e}", exc_info=True)


# ── Регистрация задач аналитики ──────────────────────────────────────────
scheduler.add_cron(
    name="daily_kpi_snapshot", func=daily_kpi_snapshot, hour=20, minute=0
)
scheduler.add_cron(name="b2b_funnel_report", func=b2b_funnel_report, hour=16, minute=0)
scheduler.add_cron(
    name="weekly_trends", func=weekly_trends, hour=9, minute=0, day_of_week=0
)
scheduler.add_interval(name="sales_anomaly", func=sales_anomaly, seconds=6 * 3600)
scheduler.add_cron(
    name="monthly_executive", func=monthly_executive, hour=10, minute=0, day_of_month=1
)
scheduler.add_cron(name="conversion_funnel", func=conversion_funnel, hour=15, minute=0)


# ═══════════════════════════════════════════════════════════════════════════
# BOT BUS HANDLERS — задачи от Степана и из веб-админки
# ═══════════════════════════════════════════════════════════════════════════


async def bus_daily_kpi_snapshot(params: dict) -> dict:
    """Пересчитать KPI сейчас — кнопка «Снимок KPI» в админке.

    Переиспользуем ту же daily_kpi_snapshot(), что стоит в расписании на
    20:00: отдельная реализация неминуемо разошлась бы с плановой.
    """
    await daily_kpi_snapshot()
    return {"message": "Снимок KPI рассчитан и отправлен в Telegram"}


async def bus_get_report(params: dict) -> dict:
    """KPI-отчёт (дневной или недельный)."""
    try:
        from sqlalchemy import text

        period = params.get("period", "daily")
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE type = 'income' AND date = CURRENT_DATE"
                )
            )
            revenue = float(res.scalar() or 0)
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM crm_orders WHERE DATE(created_at) = CURRENT_DATE"
                )
            )
            order_count = res.scalar() or 0
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers WHERE DATE(created_at) = CURRENT_DATE"
                )
            )
            new_customers = res.scalar() or 0
        avg_order = revenue / order_count if order_count > 0 else 0
        return {
            "status": "ok",
            "message": f"KPI ({period}): выручка {revenue:,.0f}, заказов {order_count}, новых клиентов {new_customers}",
            "data": {
                "period": period,
                "revenue": revenue,
                "order_count": order_count,
                "new_customers": new_customers,
                "avg_order": avg_order,
            },
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def bus_get_instagram_stats(params: dict) -> dict:
    """Статистика Instagram."""
    try:
        from shared.instagram_analytics import get_instagram_stats

        stats = await get_instagram_stats()
        return {
            "status": "ok",
            "message": "Instagram статистика получена",
            "data": stats,
        }
    except ImportError:
        return {
            "status": "ok",
            "message": "Модуль instagram_analytics не настроен. Данные недоступны.",
            "data": {},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ═══════════════════════════════════════════════════════════════════════════
# EVENTBUS HANDLER
# ═══════════════════════════════════════════════════════════════════════════


async def handle_task_created(payload: dict):
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "analytics":
        return
    # Гарда `if not chat_id: return` здесь больше нет. Она отбрасывала
    # задачу раньше, чем исполнитель успевал её спасти: task_executor
    # сам делает `chat_id or _admin_chat_id()`, а _notify без чата —
    # пустая операция. Из-за гарды задача из офисной панели создавалась,
    # событие уходило, и шесть отделов из десяти молча его выбрасывали.
    # Отдельная переменная не нужна: исполнитель берёт chat_id из data.

    bot = Bot(
        token=settings.analytics_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.task_executor import execute_bot_task
        from shared.prompts import TEAM_CONTEXT

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Data Scientist и Руководитель аналитики (Chief Data Officer). Мысли категориями когортного анализа, статистических аномалий и data-driven гипотез. Находи инсайты там, где другие видят просто цифры."
        
        logging.info("ANALYTICS_BOT passing task to TaskExecutor...")
        await execute_bot_task(
            bot=bot,
            bot_name="analytics_bot",
            department="analytics",
            task_data=data,
            team_context=sys_prompt
        )
        logging.info("ANALYTICS_BOT successfully handled task.")

    except Exception as e:
        logging.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()


async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("analytics_bot", payload)


async def main():
    if not settings.analytics_bot_token:
        logger.error("FATAL: ANALYTICS_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    global _bot
    await init_db()
    bot = Bot(
        token=settings.analytics_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    _bot = bot
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.approvals import approvals_router
    from shared.task_ui import task_ui_router

    dp.include_router(task_ui_router)
    # Кнопки ✅/❌ под рискованными действиями отдела. Без этого роутера
    # карточка подтверждения показывается, а нажатие ничего не делает.
    dp.include_router(approvals_router)
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        ai_chat,
        wake_words=["отдел аналитик", "аналитика", "analytics", "данные", "статистика"],
    )
    dp.include_router(group_router)

    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    register_analytics_handlers(event_bus, bot)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(
        8088
    )  # mg_analytics — порт из карты доставки event_bus

    # Пульс живости. start_heartbeat был импортирован в шапке модуля, но нигде
    # не вызывался: бот работал нормально, а ключа bot:heartbeat:analytics_bot
    # в Redis не появлялось никогда, и мониторинг вечно показывал
    # «Analytics — НЕ ЗАПУЩЕН». Сверка реестра — scripts/check_bot_roster.py.
    asyncio.create_task(start_heartbeat("analytics_bot"))

    # Планировщик тоже не запускался: задача monthly_executive была
    # зарегистрирована, в finally стоял scheduler.stop(), а start() не вызывался
    # ни разу — то есть месячный отчёт не выходил никогда. Второй дефект того же
    # класса, что и пропущенный heartbeat выше: код на месте, вызова нет.
    # Пять других задач (строки ~394-399) закомментированы намеренно — не трогаем.
    await scheduler.start()

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    from shared.event_bus import BotBusActions

    asyncio.create_task(
        bus_listen(
            "analytics_bot",
            {
                "get_report": bus_get_report,
                "get_instagram_stats": bus_get_instagram_stats,
                BotBusActions.GET_TOP_PRODUCTS: _get_top_products,
                # Кнопка «Снимок KPI» в веб-админке: тот же расчёт, что и в 20:00,
                # но по требованию владельца.
                "daily_kpi_snapshot": bus_daily_kpi_snapshot,
            },
        )
    )

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()


async def _get_top_products(params: dict) -> str:
    """Возвращает хиты продаж для журнала."""
    try:
        from sqlalchemy import text

        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT p.name_ru, SUM(oi.quantity) AS qty "
                    "FROM crm_order_items oi "
                    "JOIN crm_products p ON oi.product_id = p.id "
                    "JOIN crm_orders o ON oi.order_id = o.id "
                    "WHERE o.created_at >= CURRENT_DATE - INTERVAL '7 days' "
                    "GROUP BY p.name_ru ORDER BY qty DESC LIMIT 3"
                )
            )
            top = res.fetchall()

        if not top:
            return "Нет данных по продажам за 7 дней."

        report = "🔥 Хиты продаж этой недели:\n" + "\n".join(
            [f"• {name} ({qty} шт)" for name, qty in top]
        )
        return report
    except Exception as e:
        logger.error(f"Error in _get_top_products: {e}")
        return "Ошибка аналитики"


if __name__ == "__main__":
    asyncio.run(main())
