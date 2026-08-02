import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings

logger = logging.getLogger(__name__)

async def bus_daily_kpi_snapshot(params: dict) -> dict:
    """Пересчитать KPI сейчас — кнопка «Снимок KPI» в админке.

    Переиспользуем ту же daily_kpi_snapshot(), что стоит в расписании на
    20:00: отдельная реализация неминуемо разошлась бы с плановой.
    """
    from bots.analytics_bot.handlers.tasks import daily_kpi_snapshot
    await daily_kpi_snapshot()
    return {"message": "Снимок KPI рассчитан и отправлен в Telegram"}

async def bus_get_report(params: dict) -> dict:
    """KPI-отчёт (дневной или недельный)."""
    try:
        from shared.database import get_session_ctx
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
                    "SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE"
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

async def bus_cohort_analysis(params: dict) -> dict:
    """Когортный анализ клиентов (retention rate)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.ai_engine import AIEngine
        import json

        async with get_session_ctx() as session:
            # Считаем количество новых пользователей по месяцам (когорты)
            # и сколько из них делали заказы в последующие месяцы
            query = """
            WITH user_cohorts AS (
                SELECT 
                    id AS user_id, 
                    DATE_TRUNC('month', created_at) AS cohort_month
                FROM users
            ),
            order_months AS (
                SELECT 
                    user_id, 
                    DATE_TRUNC('month', created_at) AS order_month
                FROM orders
                GROUP BY user_id, DATE_TRUNC('month', created_at)
            )
            SELECT 
                TO_CHAR(uc.cohort_month, 'YYYY-MM') AS cohort,
                EXTRACT(MONTH FROM age(om.order_month, uc.cohort_month)) +
                EXTRACT(YEAR FROM age(om.order_month, uc.cohort_month)) * 12 AS month_diff,
                COUNT(DISTINCT uc.user_id) AS active_users
            FROM user_cohorts uc
            JOIN order_months om ON uc.user_id = om.user_id
            WHERE uc.cohort_month >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY cohort, month_diff
            ORDER BY cohort, month_diff;
            """
            res = await session.execute(text(query))
            rows = res.fetchall()

        # Группируем данные для AI
        cohorts = {}
        for cohort, month_diff, active_users in rows:
            if cohort not in cohorts:
                cohorts[cohort] = {}
            cohorts[cohort][int(month_diff)] = int(active_users)

        ai = AIEngine()
        sys_prompt = "Ты — Chief Data Officer. Твоя задача проанализировать сырые данные когортного анализа (retention) и выдать короткий бизнес-вывод (3-4 предложения). Скажи, какая когорта лучшая, где проседает retention, и дай совет."
        user_prompt = f"Данные когортного анализа (месяц_регистрации: {{месяц_после_регистрации: кол-во_активных_клиентов}}):\n{json.dumps(cohorts, ensure_ascii=False)}"
        
        analysis = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=300)

        return {
            "status": "ok",
            "message": analysis,
            "data": cohorts
        }
    except Exception as e:
        logger.error(f"bus_cohort_analysis error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

async def bus_rfm_segmentation(params: dict) -> dict:
    """RFM сегментация клиентов (Recency, Frequency, Monetary)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.ai_engine import AIEngine

        async with get_session_ctx() as session:
            # Получаем RFM метрики по пользователям
            query = """
            SELECT 
                u.id,
                u.first_name,
                EXTRACT(DAY FROM (CURRENT_DATE - MAX(o.created_at))) AS recency_days,
                COUNT(o.id) AS frequency,
                SUM(o.total_amount) AS monetary
            FROM users u
            JOIN orders o ON u.id = o.user_id
            WHERE o.status NOT IN ('CANCELLED', 'REFUNDED')
            GROUP BY u.id, u.first_name
            HAVING COUNT(o.id) > 0
            """
            res = await session.execute(text(query))
            rows = res.fetchall()

        if not rows:
            return {"status": "ok", "message": "Нет данных для RFM", "data": []}

        # Простая сегментация на лету
        segments = {"Champions": 0, "Loyal": 0, "At_Risk": 0, "New": 0, "Lost": 0}
        details = []

        for row in rows:
            recency, freq, monetary = row[2], row[3], row[4]
            segment = "Unknown"
            
            if recency <= 14 and freq >= 5:
                segment = "Champions"
            elif recency <= 30 and freq >= 3:
                segment = "Loyal"
            elif recency <= 14 and freq <= 2:
                segment = "New"
            elif recency > 30 and recency <= 60:
                segment = "At_Risk"
            elif recency > 60:
                segment = "Lost"
                
            segments[segment] = segments.get(segment, 0) + 1
            details.append({
                "id": row[0],
                "name": row[1],
                "r": recency,
                "f": freq,
                "m": float(monetary),
                "segment": segment
            })

        ai = AIEngine()
        sys_prompt = "Ты — Chief Data Officer. Твоя задача — проанализировать результаты RFM сегментации."
        user_prompt = f"Распределение клиентов по RFM сегментам:\n{segments}\n\nСделай короткий вывод (3 предложения). Что делать с 'At_Risk' и 'Lost'?"
        analysis = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=250)

        return {
            "status": "ok",
            "message": analysis,
            "data": {"summary": segments, "top_champions": [d for d in details if d["segment"] == "Champions"][:5]}
        }
    except Exception as e:
        logger.error(f"bus_rfm_segmentation error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

async def handle_task_created(payload: dict) -> None:
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "analytics":
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return

    bot = Bot(
        token=settings.analytics_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.ai_engine import AIEngine

        ai = AIEngine()
        from shared.prompts import TEAM_CONTEXT

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Data Scientist и Руководитель аналитики (Chief Data Officer). Мысли категориями когортного анализа, статистических аномалий и data-driven гипотез. Находи инсайты там, где другие видят просто цифры."
        user_prompt = f"Руководитель поручил аналитическую задачу:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\n\nОтветь как ЖИВОЙ сотрудник, а не пиши стену анализа: коротко подтверди, что берёшь задачу в работу, дай суть по делу и первый конкретный шаг. Максимум 4–5 предложений, без длинных списков и без markdown-заголовков."
        logger.info("ANALYTICS_BOT Generating AI answer...")
        answer = await ai.chat_completion(
            sys_prompt, user_prompt, max_tokens=350, effort="high"
        )

        logger.info(f"ANALYTICS_BOT sending message to {chat_id}")
        from shared.task_ui import get_task_keyboard

        await bot.send_message(
            chat_id,
            f"✅ <b>Отдел аналитики — принял в работу:</b>\n\n{answer}",
            parse_mode="HTML",
            reply_markup=get_task_keyboard(task_id),
        )
        logger.info("ANALYTICS_BOT successfully sent message.")

    except Exception as e:
        logger.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

async def get_top_products(params: dict) -> str:
    """Возвращает хиты продаж для журнала."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT p.name_ru, SUM(oi.quantity) AS qty "
                    "FROM order_items oi "
                    "JOIN products p ON oi.product_id = p.id "
                    "JOIN orders o ON oi.order_id = o.id "
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
