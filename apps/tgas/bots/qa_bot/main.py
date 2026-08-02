import asyncio
import logging
from aiohttp import web
from shared.config import settings
from shared.event_bus import event_bus
from shared.ai_engine import AIEngine
from shared.prompts import TEAM_CONTEXT

# Полный системный промпт: командный контекст (чтобы бот знал о других
# отделах и умел маршрутизировать) + роль + фирменный голос бренда.
# До этого здесь был однострочник вида QA_SYSTEM_PROMPT.
QA_SYSTEM_PROMPT = (
    TEAM_CONTEXT
    + """
Ты — инженер контроля качества сити-фермы Microgreen Uzbekistan.
Осматриваешь лотки и партии: всхожесть, плесень, вытягивание, цвет, срок до среза.
Вывод давай коротко и по делу: вердикт (годно / под наблюдение / брак), причина, действие.
Не выдумывай наблюдений: если по фото или описанию не видно — так и скажи и запроси уточнение.
"""
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] QA_BOT: %(message)s"
)
logger = logging.getLogger(__name__)

ai = AIEngine()


async def analyze_tray_photo(image_url: str, batch_id: str | None = None) -> dict:
    """Осмотреть лоток по фото и замкнуть петлю QA → R&D.

    Вынесено из обработчика вебхука, чтобы тем же кодом пользовался
    bot_bus: раньше анализ жил только внутри ветки n8n, и позвать его
    адресно (из админки или от Стёпана) было нельзя.
    """
    logger.info(f"QA Bot: Analyzing photo {image_url}")

    has_opencv = False
    try:
        import importlib

        importlib.import_module("cv2")
        has_opencv = True
        logger.info("OpenCV is available. Preprocessing image...")
    except ImportError:
        logger.warning(
            "OpenCV is not available. Downgrading to simulated / vision API responses."
        )

    prompt_text = (
        "Оцени качество всходов микрозелени на этом фото. "
        "Есть ли плесень? Какая плотность посадки? "
        "Дай короткое заключение и вердикт: годно / брак."
    )
    if has_opencv:
        prompt_text += " Изображение прошло предобработку с помощью OpenCV."

    try:
        analysis = await ai.chat_completion(
            system_prompt=QA_SYSTEM_PROMPT,
            user_message=prompt_text,
            image_base64=image_url if image_url.startswith("data:") else None,
            effort="high",
        )
    except Exception as e:
        logger.error(f"AI error: {e}")
        from shared.health import record_bot_error

        await record_bot_error("qa_bot", str(e))
        analysis = "ИИ-анализ временно недоступен. Пожалуйста, проверьте лоток вручную."

    is_defect = "брак" in analysis.lower() or "под наблюдение" in analysis.lower()

    # Замыкаем меж-ботовую петлю: QA -> R&D (корректировка рецептов выращивания).
    try:
        from shared.feedback_loop import feedback_loop

        await feedback_loop.evaluate_and_adapt(
            bot="rnd_bot",
            metric="recipe_yield",
            current_data={
                "qa_analysis": analysis,
                "is_defect": is_defect,
                "image_url": image_url,
                "batch_id": batch_id,
            },
            benchmark_data={
                "max_allowed_defect_rate": 0.02,
                "target_germination_pct": 95.0,
            },
        )
    except Exception as fe:
        logger.warning(f"QA -> R&D feedback loop error: {fe}")

    try:
        await event_bus.publish(
            "TASK_COMPLETED",
            {
                "task_id": batch_id or "qa_inspection",
                "completed_by": "qa_bot",
                "chat_id": settings.admin_telegram_ids[0]
                if settings.admin_telegram_ids
                else 0,
                "text": f"🔬 <b>Отчет QA-бота (Контроль Качества):</b>\n\n{analysis}",
            },
            "qa_bot",
        )
    except Exception as be:
        logger.warning(f"QA: событие TASK_COMPLETED не ушло: {be}")

    return {"analysis": analysis, "is_defect": is_defect, "batch_id": batch_id}


async def handle_n8n_webhook(request: web.Request):
    """Webhook from n8n for QA tasks"""
    try:
        payload = await request.json()
        action = payload.get("action")
        data = payload.get("data", {})

        if action == "analyze_photo":
            image_url = data.get("image_url", "")
            if not image_url:
                return web.json_response(
                    {"status": "error", "error": "image_url не передан"}, status=400
                )
            result = await analyze_tray_photo(image_url)
            return web.json_response(
                {"status": "success", "analysis": result["analysis"]}
            )

        return web.json_response({"status": "ignored"})

    except Exception as e:
        logger.error(f"Error handling webhook: {e}")
        from shared.health import record_bot_error

        await record_bot_error("qa_bot", str(e))
        return web.json_response({"error": str(e)}, status=500)


async def handle_task_created(payload: dict):
    """Слушаем задачи от Степана по шине сообщений"""
    data = payload.get("data", {})
    # Регистр приводим, как у остальных ботов: диспетчер может прислать
    # "QA"/"DevOps", и строгое сравнение молча теряло такую задачу.
    if str(data.get("department", "")).lower() != "qa":
        return

    logger.info(f"QA Bot received task via event_bus: {payload}")
    task_id = data.get("task_id", "qa_task")
    chat_id = data.get(
        "chat_id", settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0
    )
    description = data.get("description", "")

    prompt_text = (
        f"Ты инженер по контролю качества (QA) на сити-ферме микрозелени. Твоя задача:\n{description}\n\n"
        "Сделай профессиональный анализ проблемы, укажи возможные причины, дай короткое заключение и вердикт."
    )

    from shared.task_executor import execute_bot_task
    
    logger.info("QA Bot passing task to TaskExecutor...")
    await execute_bot_task(
        bot=None,
        bot_name="qa_bot",
        department="qa",
        task_data=data,
        team_context=QA_SYSTEM_PROMPT
    )
    logger.info("QA Bot successfully handled task.")


async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("qa_bot", payload)


async def main():
    logger.info("Starting QA Bot Microservice...")
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("ROLL_CALL", handle_roll_call)

    app = web.Application()
    app.router.add_post("/n8n-webhook", handle_n8n_webhook)
    await event_bus.start_listening(8090, app)

    logger.info("QA Bot running on port 8090")

    # Bot bus: слушателя не было. Пока его нет, любая адресная задача QA
    # (в том числе делегированная Стёпаном) трижды пробуется и уходит в
    # failed — отправитель получает таймаут без объяснения.
    from shared.bot_bus import start_listener as bus_listen

    async def bus_analyze_photo(params: dict) -> dict:
        photo_url = params.get("photo_url") or params.get("url")
        if not photo_url:
            raise ValueError("нужен параметр photo_url")
        return await analyze_tray_photo(photo_url, params.get("batch_id"))

    asyncio.create_task(
        bus_listen(
            "qa_bot",
            {
                "analyze_photo": bus_analyze_photo,
            },
        )
    )

    from shared.health import start_heartbeat

    asyncio.create_task(start_heartbeat("qa_bot"))

    # Keep running
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
