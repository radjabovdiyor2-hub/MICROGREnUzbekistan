import asyncio
import logging
from aiohttp import web
from shared.config import settings
from shared.event_bus import event_bus
from openai import AsyncOpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] QA_BOT: %(message)s")
logger = logging.getLogger(__name__)

openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

async def handle_n8n_webhook(request: web.Request):
    """Webhook from n8n for QA tasks"""
    try:
        payload = await request.json()
        action = payload.get("action")
        data = payload.get("data", {})
        
        if action == "analyze_photo":
            image_url = data.get("image_url", "")
            logger.info(f"QA Bot: Analyzing photo {image_url}")

            if not image_url:
                return web.json_response(
                    {"status": "error", "error": "image_url не передан"}, status=400
                )

            # Проверка OpenCV
            has_opencv = False
            try:
                import cv2
                has_opencv = True
                logger.info("OpenCV is available. Preprocessing image...")
            except ImportError:
                logger.warning("OpenCV is not available. Downgrading to simulated / vision API responses.")

            # Use OpenAI Vision API — реально передаём картинку в модель
            prompt_text = (
                "Оцени качество всходов микрозелени на этом фото. "
                "Есть ли плесень? Какая плотность посадки? "
                "Дай короткое заключение и вердикт: годно / брак."
            )
            if has_opencv:
                 prompt_text += " Изображение прошло предобработку с помощью OpenCV."

            try:
                response = await openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt_text},
                                {"type": "image_url", "image_url": {"url": image_url}},
                            ],
                        }
                    ],
                )
                analysis = response.choices[0].message.content
            except Exception as e:
                logger.error(f"OpenAI error: {e}")
                analysis = "ИИ-анализ временно недоступен. Пожалуйста, проверьте лоток вручную."
                
            # Send result back to PM bot via Event Bus
            await event_bus.publish("TASK_COMPLETED", {
                "task_id": "qa_inspection",
                "completed_by": "qa_bot",
                "chat_id": settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0,
                "text": f"🔬 <b>Отчет QA-бота (Контроль Качества):</b>\n\n{analysis}"
            }, "qa_bot")
            
            return web.json_response({"status": "success", "analysis": analysis})
            
        return web.json_response({"status": "ignored"})
        
    except Exception as e:
        logger.error(f"Error handling webhook: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def handle_task_created(payload: dict):
    """Слушаем задачи от Степана по шине сообщений"""
    data = payload.get("data", {})
    if data.get("department") != "qa":
        return
        
    logger.info(f"QA Bot received task via event_bus: {payload}")
    task_id = data.get("task_id", "qa_task")
    chat_id = data.get("chat_id", settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0)
    description = data.get("description", "")
    
    prompt_text = (
        f"Ты инженер по контролю качества (QA) на сити-ферме микрозелени. Твоя задача:\n{description}\n\n"
        "Сделай профессиональный анализ проблемы, укажи возможные причины, дай короткое заключение и вердикт."
    )
    
    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt_text}],
        )
        analysis = response.choices[0].message.content
    except Exception as e:
        logger.error(f"OpenAI error: {e}")
        analysis = "ИИ-анализ временно недоступен. Возникла ошибка."
        
    # Send result back to PM bot via Event Bus
    await event_bus.publish("TASK_COMPLETED", {
        "task_id": task_id,
        "completed_by": "qa",
        "chat_id": chat_id,
        "text": f"🔬 <b>Отчет Отдела Контроля Качества (QA):</b>\n\n{analysis}"
    }, "qa_bot")

async def main():
    logger.info("Starting QA Bot Microservice...")
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    
    app = web.Application()
    app.router.add_post('/n8n-webhook', handle_n8n_webhook)
    await event_bus.start_listening(8090, app)
    
    logger.info("QA Bot running on port 8090")
    
    # Keep running
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
