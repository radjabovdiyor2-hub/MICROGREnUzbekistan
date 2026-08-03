import asyncio
import logging
from aiohttp import web
from shared.event_bus import event_bus
from shared.scheduler import BotScheduler
from shared.ai_engine import AIEngine
from shared.prompts import TEAM_CONTEXT

# Полный системный промпт: командный контекст (чтобы бот знал о других
# отделах и умел маршрутизировать) + роль + фирменный голос бренда.
# До этого здесь был однострочник вида RND_SYSTEM_PROMPT.
RND_SYSTEM_PROMPT = (
    TEAM_CONTEXT
    + """
Ты — аналитик R&D сити-фермы Microgreen Uzbekistan.
Занимаешься новыми культурами, субстратами и режимами: урожайность, сроки, себестоимость.
Предлагай гипотезы с оценкой риска и понятным способом проверки на одной партии.
Не выдумывай цифр: если данных нет — скажи, каких именно не хватает.
"""
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] RND_BOT: %(message)s"
)
logger = logging.getLogger(__name__)

ai = AIEngine()
scheduler = BotScheduler("rnd_bot")


# ═══════════════════════════════════════════════════════════════════════════
# R&D: тренды Instagram → рекомендации «что посадить» (реальные данные)
# ═══════════════════════════════════════════════════════════════════════════
async def generate_instagram_rnd_report() -> str:
    """R&D-анализ на основе РЕАЛЬНОЙ статистики Instagram + каталога."""
    from shared.instagram_analytics import get_instagram_stats

    stats = await get_instagram_stats(top_limit=5)

    products = []
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        async with get_session_ctx() as s:
            res = await s.execute(
                text("SELECT name_ru FROM products WHERE is_active=true LIMIT 15")
            )
            products = [r[0] for r in res.fetchall() if r[0]]
    except Exception as e:
        logger.warning(f"products fetch error: {e}")

    summary = stats.get("summary") or "нет данных"
    prompt = (
        f"РЕАЛЬНАЯ статистика Instagram за последнюю неделю:\n{summary}\n\n"
        f"Наш ассортимент: {', '.join(products) or 'микрозелень, съедобные цветы'}.\n\n"
        "Ты — аналитик R&D сити-фермы микрозелени. На основе вовлечённости постов:\n"
        "1) Выдели 3 тренда (что заходит аудитории — опирайся на лайки/комментарии/охваты).\n"
        "2) Дай 2-3 КОНКРЕТНЫЕ рекомендации, ЧТО ПОСАДИТЬ БОЛЬШЕ на этой неделе "
        "(сорта микрозелени / съедобные цветы) с обоснованием по цифрам.\n"
        "3) 1 идею контента на следующую неделю.\n"
        "Пиши кратко и по делу, на русском, с цифрами где есть."
    )
    try:
        report = await ai.chat_completion(
            system_prompt=RND_SYSTEM_PROMPT,
            user_message=prompt,
            effort="high",
        )
    except Exception as e:
        logger.error(f"AI error: {e}")
        from shared.health import record_bot_error

        await record_bot_error("rnd_bot", str(e))
        report = "Не удалось сгенерировать R&D-отчёт из-за ошибки ИИ."

    if not stats.get("configured"):
        report = (
            "⚠️ Instagram Graph API сейчас недоступен — рекомендации без свежих цифр.\n\n"
            + report
        )
    return report


async def weekly_instagram_rnd():
    """Еженедельно: R&D-рекомендации по трендам Instagram → руководителю (через Степана)."""
    try:
        report = await generate_instagram_rnd_report()
        text_msg = f"🧬 <b>R&D: тренды Instagram и что посадить</b>\n\n{report}"
        await event_bus.publish(
            "new_message",
            {"bot": "R&D — тренды Instagram", "text": text_msg},
            "rnd_bot",
        )
        logger.info("weekly_instagram_rnd: отчёт отправлен руководителю")
    except Exception as e:
        logger.error(f"weekly_instagram_rnd error: {e}", exc_info=True)
        from shared.health import record_bot_error

        await record_bot_error("rnd_bot", str(e))


async def handle_n8n_webhook(request: web.Request):
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


async def handle_task_created(payload: dict):
    """Слушаем задачи от Степана по шине сообщений"""
    data = payload.get("data", {})
    # Регистр приводим, как у остальных ботов: диспетчер может прислать
    # "QA"/"DevOps", и строгое сравнение молча теряло такую задачу.
    if str(data.get("department", "")).lower() != "rnd":
        return

    logger.info(f"R&D Bot received task via event_bus: {payload}")

    # Директивы обучения больше не читаем здесь: их подставляет исполнитель
    # задач (feedback_loop.active_policy). Раньше строка читалась из базы и
    # тут же выбрасывалась — обучение на R&D не влияло вовсе.

    from shared.task_executor import execute_bot_task
    
    logger.info("RND_BOT passing task to TaskExecutor...")
    await execute_bot_task(
        bot=None,
        bot_name="rnd_bot",
        department="rnd",
        task_data=data,
        team_context=RND_SYSTEM_PROMPT
    )
    logger.info("RND_BOT successfully handled task.")


async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("rnd_bot", payload)


async def main():
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

    asyncio.create_task(
        start_listener(
            "rnd_bot",
            {
                BotBusActions.GENERATE_MAGAZINE_FACTS: bus_generate_magazine_facts,
                "weekly_trend_report": bus_weekly_trend_report,
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
