import asyncio
import logging
from aiohttp import web
from shared.config import settings
from shared.event_bus import event_bus
from shared.ai_engine import AIEngine
from shared.database import get_session_ctx
from sqlalchemy import text
from shared.scheduler import BotScheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] FRANCHISE_BOT: %(message)s")
logger = logging.getLogger(__name__)

ai = AIEngine()
scheduler = BotScheduler("franchise_bot")

async def generate_daily_franchise_journals():
    """Ежедневный сборник (Daily Digest) для франчайзи по каждому городу"""
    cities = ['samarkand', 'bukhara', 'fergana']
    
    logger.info("Начинаем генерацию журналов франчайзи...")
    
    for city in cities:
        try:
            async with get_session_ctx() as session:
                # 1. Получаем статистику по заказам
                orders_res = await session.execute(text(
                    "SELECT COUNT(id) as cnt, COALESCE(SUM(total), 0) as total_rev "
                    "FROM orders "
                    "WHERE city = :city "
                    "AND DATE(created_at AT TIME ZONE 'Asia/Samarkand') = (NOW() AT TIME ZONE 'Asia/Samarkand')::date"
                ), {"city": city})
                orders_data = orders_res.fetchone()
                
                # 2. Получаем статистику по клиентам (B2B лиды)
                leads_res = await session.execute(text(
                    "SELECT COUNT(id) as cnt "
                    "FROM customers "
                    "WHERE city = :city AND customer_type = 'b2b' "
                    "AND DATE(created_at AT TIME ZONE 'Asia/Samarkand') = (NOW() AT TIME ZONE 'Asia/Samarkand')::date"
                ), {"city": city})
                leads_data = leads_res.fetchone()
                
                orders_count = orders_data[0] if orders_data else 0
                revenue = orders_data[1] if orders_data else 0
                leads_count = leads_data[0] if leads_data else 0
                
                metrics = {
                    "orders_count": orders_count,
                    "revenue": revenue,
                    "new_b2b_leads": leads_count
                }
                
                prompt = (
                    f"Напиши короткий и мотивирующий управленческий отчет для владельца франшизы в городе {city.capitalize()}.\n"
                    f"Данные за сегодня:\n"
                    f"- Новых заказов: {orders_count}\n"
                    f"- Выручка: {revenue} сум\n"
                    f"- Новых B2B лидов (ресторанов): {leads_count}\n\n"
                    "Отчет должен звучать так, будто его написал ИИ-Директор по Франчайзингу. "
                    "Кратко похвали за успехи или дай совет, если цифры нулевые."
                )
                
                content = await ai.chat_completion(
                    system_prompt="Ты ИИ-Директор по Франчайзингу Microgreen Uzbekistan.",
                    user_message=prompt
                )
                
                # Сохраняем в FranchiseJournal
                import json
                await session.execute(text(
                    "INSERT INTO franchise_journals (id, city, department, action, content, metrics, created_at) "
                    "VALUES (gen_random_uuid()::text, :city, 'management', 'Ежедневный отчет филиала', :content, :metrics::jsonb, NOW())"
                ), {
                    "city": city,
                    "content": content,
                    "metrics": json.dumps(metrics)
                })
                
                logger.info(f"Журнал для {city} успешно сгенерирован и сохранен.")
                
                # Публикуем событие, чтобы другие боты (Степан) могли переслать это владельцу
                await event_bus.publish("franchise_report_generated", {
                    "city": city,
                    "metrics": metrics,
                    "content": content
                }, "franchise_bot")
                
        except Exception as e:
            logger.exception(f"Ошибка при генерации журнала для {city}: {e}")

# Регистрируем задачу на 23:55 каждый день
scheduler.add_cron(hour=23, minute=55, name="generate_franchise_journals", func=generate_daily_franchise_journals)

async def handle_n8n_webhook(request: web.Request):
    """Webhook для приема внешних команд или событий Event Bus"""
    try:
        payload = await request.json()
        event = payload.get("event")
        
        # Если нужно, Franchise Bot может реагировать на события в реальном времени
        if event == "order_created":
            data = payload.get("data", {})
            # Здесь можно было бы сразу писать лог в журнал, но мы решили делать сборный digest.
            pass
            
        return web.json_response({"status": "success"})
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def start_server():
    app = web.Application()
    app.router.add_post("/event", handle_n8n_webhook)
    app.router.add_get("/health", lambda r: web.Response(text="OK"))
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 8093)
    await site.start()
    logger.info("Franchise Bot (worker) HTTP server started on port 8093")
    
    # Подключаем Event Bus
    await event_bus.connect()
    scheduler.start()
    
    # Бесконечный цикл
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    try:
        asyncio.run(start_server())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Franchise Bot stopped.")
