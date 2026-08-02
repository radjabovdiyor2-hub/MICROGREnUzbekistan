import asyncio
import logging
from aiohttp import web
from shared.event_bus import event_bus
from shared.ai_engine import AIEngine
from shared.database import get_session_ctx
from sqlalchemy import text
from shared.scheduler import BotScheduler
from shared.prompts import TEAM_CONTEXT

# Полный системный промпт: командный контекст (чтобы бот знал о других
# отделах и умел маршрутизировать) + роль + фирменный голос бренда.
# До этого здесь был однострочник вида FRANCHISE_SYSTEM_PROMPT.
FRANCHISE_SYSTEM_PROMPT = (
    TEAM_CONTEXT
    + """
Ты — директор по франчайзингу Microgreen Uzbekistan.
Готовишь ежедневные сводки по филиалам (Самарканд, Бухара, Фергана): заказы, выручка, отклонения.
Пиши так, чтобы управляющий филиала понял за минуту: что произошло, что важно, что сделать.
Не выдумывай показателей: считай только по переданным данным, пропуски отмечай явно.
"""
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] FRANCHISE_BOT: %(message)s"
)
logger = logging.getLogger(__name__)

ai = AIEngine()
scheduler = BotScheduler("franchise_bot")

# Город у клиента записан как придётся: латиницей из выгрузок, кириллицей из
# 2ГИС и от менеджеров. Сравнение по одному написанию давало ноль совпадений,
# а нули выглядели как «день без заказов», а не как ошибка. Поэтому у каждого
# филиала список допустимых написаний, и сверяем в нижнем регистре.
CITY_SPELLINGS: dict[str, list[str]] = {
    "samarkand": ["samarkand", "самарканд"],
    "bukhara": ["bukhara", "buxoro", "бухара"],
    "fergana": ["fergana", "fargona", "farg'ona", "фергана", "фаргона"],
}

# Заголовок филиала для отчёта — по-русски, как его читает управляющий.
CITY_TITLES = {"samarkand": "Самарканд", "bukhara": "Бухара", "fergana": "Фергана"}


async def generate_daily_franchise_journals():
    """Ежедневный сборник (Daily Digest) для франчайзи по каждому городу"""
    cities = list(CITY_SPELLINGS)

    logger.info("Начинаем генерацию журналов франчайзи...")

    for city in cities:
        try:
            async with get_session_ctx() as session:
                names = CITY_SPELLINGS[city]

                # 1. Статистика по заказам.
                # Город берём у клиента: в orders его нет вовсе (есть только
                # delivery_address), а сумма лежит в total_amount, не в total.
                # Прежний запрос обращался к несуществующим колонкам city и
                # total и падал на каждом филиале — сводка не выходила ни разу.
                orders_res = await session.execute(
                    text(
                        "SELECT COUNT(o.id) AS cnt, COALESCE(SUM(o.total_amount), 0) AS total_rev "
                        "FROM orders o "
                        "JOIN customers c ON c.id = o.customer_id "
                        "WHERE LOWER(c.city) = ANY(:names) "
                        # created_at — timestamp без пояса, NOW() — с поясом. Прежнее
                        # "created_at AT TIME ZONE 'Asia/Samarkand' = NOW() AT TIME ZONE
                        # 'Asia/Samarkand'" разворачивало время в разные стороны: слева
                        # получалось 30-е, справа 31-е, и совпадений не было. Держим обе
                        # стороны в одной системе отсчёта — часовой пояс задаёт база.
                        "AND DATE(o.created_at) = CURRENT_DATE"
                    ),
                    {"names": names},
                )
                orders_data = orders_res.fetchone()

                # 2. Получаем статистику по клиентам (B2B лиды)
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

                # Сохраняем в FranchiseJournal.
                # Таблицу объявляет Prisma (model FranchiseJournal, @@map
                # "franchise_journals"), то есть владелец — витрина, и на проде
                # она лежит в отдельной базе. Раньше запись шла обычной сессией
                # в базу ботов, где такой таблицы нет вовсе, — вставка падала.
                import json

                async with get_session_ctx() as store:
                    await store.execute(
                        text(
                            "INSERT INTO franchise_journals (id, city, department, action, content, metrics, created_at) "
                            # CAST(...), а не :metrics::jsonb — SQLAlchemy не считает
                            # параметром имя, за которым сразу идёт двоеточие, и в
                            # Postgres уходил литерал «:metrics»: syntax error at ":".
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

                # Публикуем событие, чтобы другие боты (Степан) могли переслать это владельцу
                await event_bus.publish(
                    "franchise_report_generated",
                    {"city": city, "metrics": metrics, "content": content},
                    "franchise_bot",
                )

        except Exception as e:
            logger.exception(f"Ошибка при генерации журнала для {city}: {e}")


# Регистрируем задачу на 23:55 каждый день
scheduler.add_cron(
    hour=23,
    minute=55,
    name="generate_franchise_journals",
    func=generate_daily_franchise_journals,
)


async def handle_n8n_webhook(request: web.Request):
    """Webhook для приема внешних команд или событий Event Bus"""
    try:
        payload = await request.json()
        event = payload.get("event")

        # Если нужно, Franchise Bot может реагировать на события в реальном времени
        if event == "order_created":
            payload.get("data", {})
            # Здесь можно было бы сразу писать лог в журнал, но мы решили делать сборный digest.
            pass

        return web.json_response({"status": "success"})
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("franchise_bot", payload)


async def start_server():
    app = web.Application()
    app.router.add_post("/n8n-webhook", handle_n8n_webhook)
    app.router.add_get("/health", lambda r: web.Response(text="OK"))

    # Подключаем Event Bus: start_listening добавляет роут /event для
    # приёма событий Redis Pub/Sub fallback и запускает aiohttp-сервер.
    # Раньше бот поднимал web.TCPSite вручную, и /event обрабатывал
    # handle_n8n_webhook — Redis Pub/Sub события до бота не доходили.
    await event_bus.connect()
    event_bus.on("ROLL_CALL", handle_roll_call)

    # await обязателен: start() — корутина. Без него планировщик не
    # запускался вообще (корутина создавалась и тут же выбрасывалась),
    # и единственная задача бота — суточные сводки по городам в 23:55 —
    # не отрабатывала ни разу.
    await scheduler.start()

    # Bot bus: ручная пересборка сводок из админки.
    from shared.bot_bus import start_listener as bus_listen

    async def bus_generate_journals(params: dict) -> dict:
        await generate_daily_franchise_journals()
        return {"message": "Сводки по городам пересобраны"}

    asyncio.create_task(
        bus_listen(
            "franchise_bot",
            {
                "generate_franchise_journals": bus_generate_journals,
            },
        )
    )

    from shared.health import start_heartbeat

    asyncio.create_task(start_heartbeat("franchise_bot"))

    logger.info("Franchise Bot (worker) starting on port 8093")
    await event_bus.start_listening(8093, app)

    # Бесконечный цикл
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    try:
        asyncio.run(start_server())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Franchise Bot stopped.")
