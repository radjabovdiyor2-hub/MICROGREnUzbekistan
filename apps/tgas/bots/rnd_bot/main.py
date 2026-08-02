import asyncio
import logging
from aiohttp import web
from shared.config import settings
from shared.event_bus import event_bus
from shared.scheduler import BotScheduler
from shared.ai_engine import AIEngine

from bots.rnd_bot.handlers.instagram_trends import (
    weekly_instagram_rnd,
    generate_instagram_rnd_report,
    RND_SYSTEM_PROMPT,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] RND_BOT: %(message)s"
)
logger = logging.getLogger(__name__)

ai = AIEngine()
scheduler = BotScheduler("rnd_bot")


async def handle_n8n_webhook(request: web.Request) -> dict:
    """Webhook from n8n for R&D tasks"""
    try:
        payload = await request.json()
        action = payload.get("action")

        if action == "weekly_trend_report":
            logger.info("R&D Bot: Generating weekly Instagram trend report (real data)")
            await weekly_instagram_rnd()
            return web.json_response({"status": "success"})

        return web.json_response({"status": "ignored"})

    except Exception as e:
        logger.error(f"Error handling webhook: {e}")
        from shared.health import record_bot_error

        await record_bot_error("rnd_bot", str(e))
        return web.json_response({"error": str(e)}, status=500)


async def handle_task_created(payload: dict) -> None:
    """Слушаем задачи от Степана по шине сообщений"""
    data = payload.get("data", {})
    # Регистр приводим, как у остальных ботов: диспетчер может прислать
    # "QA"/"DevOps", и строгое сравнение молча теряло такую задачу.
    if str(data.get("department", "")).lower() != "rnd":
        return

    logger.info(f"R&D Bot received task via event_bus: {payload}")
    task_id = data.get("task_id", "rnd_task")
    chat_id = data.get(
        "chat_id", settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0
    )
    description = data.get("description", "")

    from shared.feedback_loop import feedback_loop

    active_learning = await feedback_loop.get_active_behavior("rnd_bot", "recipe_yield")
    qa_context = active_learning.get("inference", "")

    prompt_text = (
        f"Ты аналитик отдела исследований и разработки (R&D) сити-фермы. Твоя задача:\n{description}\n\n"
        f"Контекст обратной связи от QA контроля качества: {qa_context or 'Стандарты в норме'}\n\n"
        "Проанализируй рынок, мировые тренды в HoReCa, предложи новые идеи сортов микрозелени или съедобных цветов. Дай структурированный ответ."
    )

    try:
        report = await ai.chat_completion(
            system_prompt=RND_SYSTEM_PROMPT,
            user_message=prompt_text,
            effort="high",
        )
    except Exception as e:
        logger.error(f"AI error: {e}")
        from shared.health import record_bot_error

        await record_bot_error("rnd_bot", str(e))
        report = "Не удалось сгенерировать отчет R&D из-за ошибки ИИ."

    # Send result back via Event Bus to Stepan
    await event_bus.publish(
        "TASK_COMPLETED",
        {
            "task_id": task_id,
            "completed_by": "rnd",
            "chat_id": chat_id,
            "text": f"🧬 <b>Отчет Отдела R&D (Анализ рынка и трендов):</b>\n\n{report}",
        },
        "rnd_bot",
    )


async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("rnd_bot", payload)


async def main() -> dict:
    logger.info("Starting R&D Bot Microservice...")
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("ROLL_CALL", handle_roll_call)

    app = web.Application()
    app.router.add_post("/n8n-webhook", handle_n8n_webhook)
    await event_bus.start_listening(8091, app)

    # Еженедельные R&D-рекомендации по трендам Instagram (Пн 10:00)
    scheduler.add_cron(
        name="weekly_instagram_rnd",
        func=weekly_instagram_rnd,
        hour=10,
        minute=0,
        day_of_week=0,
    )
    await scheduler.start()

    from shared.bot_bus import start_listener
    from shared.event_bus import BotBusActions

    async def bus_generate_magazine_facts(params: dict) -> str:
        """Собирает научные факты о микрозелени для еженедельного журнала."""
        prompt = (
            "Подготовь 3-4 интересных факта о микрозелени для еженедельного журнала "
            "FRESH WEEKLY. Факты должны быть научно обоснованы, кратки и полезны "
            "для потребителя. Темы: питательная ценность, преимущества перед обычной "
            "зеленью, рецепты, тренды HoReCa. Пиши на русском."
        )
        try:
            report = await ai.chat_completion(
                system_prompt=RND_SYSTEM_PROMPT,
                user_message=prompt,
            )
            return report
        except Exception as e:
            logger.error(f"bus_generate_magazine_facts error: {e}")
            return "Факты временно недоступны из-за ошибки ИИ."

    async def bus_weekly_trend_report(params: dict) -> dict:
        """R&D-отчёт по трендам Instagram по запросу из админки."""
        report = await generate_instagram_rnd_report()
        return {"status": "ok", "message": report}

    async def bus_analyze_experiment(params: dict) -> dict:
        """R&D-анализ проведенного эксперимента (из админки)."""
        experiment_id = params.get("experiment_id")
        title = params.get("title", "")
        hypothesis = params.get("hypothesis", "")
        result_text = params.get("result", "")
        
        prompt = (
            f"Оцени результаты R&D эксперимента:\n"
            f"Тема: {title}\n"
            f"Гипотеза: {hypothesis}\n"
            f"Результат: {result_text}\n\n"
            "Сделай вывод: успешна ли гипотеза, стоит ли внедрять в основное производство?"
        )
        try:
            analysis = await ai.chat_completion(
                system_prompt=RND_SYSTEM_PROMPT,
                user_message=prompt,
                effort="high",
            )
            # update experiment in db
            if experiment_id:
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    await session.execute(
                        text("UPDATE experiments SET result = :res, status = 'success' WHERE id = :eid"),
                        {"res": f"{result_text}\n\n[AI Анализ]: {analysis}", "eid": experiment_id}
                    )
                    await session.commit()
            
            return {"status": "ok", "message": analysis}
        except Exception as e:
            logger.error(f"bus_analyze_experiment error: {e}")
            return {"status": "error", "message": str(e)}

    asyncio.create_task(
        start_listener(
            "rnd_bot",
            {
                BotBusActions.GENERATE_MAGAZINE_FACTS: bus_generate_magazine_facts,
                "weekly_trend_report": bus_weekly_trend_report,
                "analyze_experiment": bus_analyze_experiment,
            },
        )
    )

    from shared.health import start_heartbeat

    asyncio.create_task(start_heartbeat("rnd_bot"))

    logger.info("R&D Bot running on port 8091 (weekly Instagram trends: Mon 10:00)")

    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
