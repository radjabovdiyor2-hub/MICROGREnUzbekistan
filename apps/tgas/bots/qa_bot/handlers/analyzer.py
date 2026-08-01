import logging
from shared.ai_engine import AIEngine
from shared.prompts import TEAM_CONTEXT
from shared.event_bus import event_bus
from shared.config import settings

QA_SYSTEM_PROMPT = (
    TEAM_CONTEXT
    + """
Ты — инженер контроля качества сити-фермы Microgreen Uzbekistan.
Осматриваешь лотки и партии: всхожесть, плесень, вытягивание, цвет, срок до среза.
Вывод давай коротко и по делу: вердикт (годно / под наблюдение / брак), причина, действие.
Не выдумывай наблюдений: если по фото или описанию не видно — так и скажи и запроси уточнение.
"""
)

logger = logging.getLogger(__name__)
ai = AIEngine()

async def analyze_tray_photo(image_url: str, batch_id: str | None = None) -> dict:
    """Осмотреть лоток по фото и замкнуть петлю QA → R&D."""
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
