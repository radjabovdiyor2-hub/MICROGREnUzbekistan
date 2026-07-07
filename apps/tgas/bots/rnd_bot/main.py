import asyncio
import logging
from aiohttp import web
from shared.config import settings
from shared.event_bus import event_bus
from openai import AsyncOpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] RND_BOT: %(message)s")
logger = logging.getLogger(__name__)

openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

async def handle_n8n_webhook(request: web.Request):
    """Webhook from n8n for R&D tasks"""
    try:
        payload = await request.json()
        action = payload.get("action")
        
        if action == "weekly_trend_report":
            logger.info("R&D Bot: Generating weekly trend report")
            
            try:
                response = await openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {
                            "role": "user",
                            "content": "Составь еженедельный аналитический отчет R&D (Research & Development) по новинкам микрозелени и съедобных цветов в топовых ресторанах мира. Выдай 3 тренда и 1 рекомендацию по посадке на этой неделе."
                        }
                    ]
                )
                report = response.choices[0].message.content
            except Exception as e:
                logger.error(f"OpenAI error: {e}")
                report = "Не удалось сгенерировать отчет R&D из-за ошибки ИИ."
                
            # Send result back via Event Bus to Stepan
            await event_bus.publish("TASK_COMPLETED", {
                "task_id": "rnd_weekly_report",
                "completed_by": "rnd_bot",
                "chat_id": settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0,
                "text": f"🧬 <b>Отчет Отдела R&D (Анализ трендов):</b>\n\n{report}"
            }, "rnd_bot")
            
            return web.json_response({"status": "success"})
            
        return web.json_response({"status": "ignored"})
        
    except Exception as e:
        logger.error(f"Error handling webhook: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def main():
    logger.info("Starting R&D Bot Microservice...")
    await event_bus.connect()
    
    app = web.Application()
    app.router.add_post('/n8n-webhook', handle_n8n_webhook)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 8091)
    await site.start()
    
    logger.info("R&D Bot running on port 8091")
    
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
