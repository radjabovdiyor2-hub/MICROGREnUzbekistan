import logging
from shared.event_bus import event_bus
from shared.ai_engine import AIEngine
from shared.database import get_session_ctx
from sqlalchemy import text
from shared.scheduler import BotScheduler
from shared.prompts import TEAM_CONTEXT
import json

FRANCHISE_SYSTEM_PROMPT = (
    TEAM_CONTEXT
    + """
Ты — директор по франчайзингу Microgreen Uzbekistan.
Готовишь ежедневные сводки по филиалам (Самарканд, Бухара, Фергана): заказы, выручка, отклонения.
Пиши так, чтобы управляющий филиала понял за минуту: что произошло, что важно, что сделать.
Не выдумывай показателей: считай только по переданным данным, пропуски отмечай явно.
"""
)

logger = logging.getLogger(__name__)
ai = AIEngine()

CITY_SPELLINGS: dict[str, list[str]] = {
    "samarkand": ["samarkand", "самарканд"],
    "bukhara": ["bukhara", "buxoro", "бухара"],
    "fergana": ["fergana", "fargona", "farg'ona", "фергана", "фаргона"],
}

CITY_TITLES = {"samarkand": "Самарканд", "bukhara": "Бухара", "fergana": "Фергана"}

async def generate_daily_franchise_journals() -> None:
    """Ежедневный сборник (Daily Digest) для франчайзи по каждому городу"""
    cities = list(CITY_SPELLINGS)

    logger.info("Начинаем генерацию журналов франчайзи...")

    for city in cities:
        try:
            async with get_session_ctx() as session:
                names = CITY_SPELLINGS[city]

                orders_res = await session.execute(
                    text(
                        "SELECT COUNT(o.id) AS cnt, COALESCE(SUM(o.total_amount), 0) AS total_rev "
                        "FROM orders o "
                        "JOIN customers c ON c.id = o.customer_id "
                        "WHERE LOWER(c.city) = ANY(:names) "
                        "AND DATE(o.created_at) = CURRENT_DATE"
                    ),
                    {"names": names},
                )
                orders_data = orders_res.fetchone()

                leads_res = await session.execute(
                    text(
                        "SELECT COUNT(id) as cnt "
                        "FROM customers "
                        "WHERE LOWER(city) = ANY(:names) AND customer_type = 'b2b' "
                        "AND DATE(created_at) = CURRENT_DATE"
                    ),
                    {"names": names},
                )
                leads_data = leads_res.fetchone()

                orders_count = orders_data[0] if orders_data else 0
                revenue = orders_data[1] if orders_data else 0
                leads_count = leads_data[0] if leads_data else 0

                metrics = {
                    "orders_count": orders_count,
                    "revenue": revenue,
                    "new_b2b_leads": leads_count,
                }

                prompt = (
                    f"Напиши короткий и мотивирующий управленческий отчет для владельца франшизы в городе {CITY_TITLES[city]}.\n"
                    f"Данные за сегодня:\n"
                    f"- Новых заказов: {orders_count}\n"
                    f"- Выручка: {revenue} сум\n"
                    f"- Новых B2B лидов (ресторанов): {leads_count}\n\n"
                    "Отчет должен звучать так, будто его написал ИИ-Директор по Франчайзингу. "
                    "Кратко похвали за успехи или дай совет, если цифры нулевые."
                )

                content = await ai.chat_completion(
                    system_prompt=FRANCHISE_SYSTEM_PROMPT, user_message=prompt
                )

                async with get_session_ctx() as store:
                    await store.execute(
                        text(
                            "INSERT INTO franchise_journals (id, city, department, action, content, metrics, created_at) "
                            "VALUES (gen_random_uuid()::text, :city, 'management', "
                            "'Ежедневный отчет филиала', :content, CAST(:metrics AS jsonb), NOW())"
                        ),
                        {
                            "city": city,
                            "content": content,
                            "metrics": json.dumps(metrics),
                        },
                    )

                logger.info(f"Журнал для {city} успешно сгенерирован и сохранен.")

                await event_bus.publish(
                    "franchise_report_generated",
                    {"city": city, "metrics": metrics, "content": content},
                    "franchise_bot",
                )

        except Exception as e:
            logger.exception(f"Ошибка при генерации журнала для {city}: {e}")

def register_scheduler_tasks(scheduler: BotScheduler) -> None:
    scheduler.add_cron(
        hour=23,
        minute=55,
        name="generate_franchise_journals",
        func=generate_daily_franchise_journals,
    )
