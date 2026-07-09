import asyncio
import logging
from aiohttp import web
from shared.config import settings
from shared.event_bus import event_bus
from shared.scheduler import BotScheduler
from openai import AsyncOpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] RND_BOT: %(message)s")
logger = logging.getLogger(__name__)

openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
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
            res = await s.execute(text("SELECT name_ru FROM products WHERE is_active=true LIMIT 15"))
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
        r = await openai_client.chat.completions.create(
            model="gpt-4o", messages=[{"role": "user", "content": prompt}]
        )
        report = r.choices[0].message.content
    except Exception as e:
        logger.error(f"OpenAI error: {e}")
        report = "Не удалось сгенерировать R&D-отчёт из-за ошибки ИИ."

    if not stats.get("configured"):
        report = "⚠️ Instagram Graph API сейчас недоступен — рекомендации без свежих цифр.\n\n" + report
    return report


async def weekly_instagram_rnd():
    """Еженедельно: R&D-рекомендации по трендам Instagram → руководителю (через Степана)."""
    try:
        report = await generate_instagram_rnd_report()
        text_msg = f"🧬 <b>R&D: тренды Instagram и что посадить</b>\n\n{report}"
        await event_bus.publish("new_message", {"bot": "R&D — тренды Instagram", "text": text_msg}, "rnd_bot")
        logger.info("weekly_instagram_rnd: отчёт отправлен руководителю")
    except Exception as e:
        logger.error(f"weekly_instagram_rnd error: {e}", exc_info=True)

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
        return web.json_response({"error": str(e)}, status=500)

async def handle_task_created(payload: dict):
    """Слушаем задачи от Степана по шине сообщений"""
    if payload.get("dept") != "rnd":
        return
        
    logger.info(f"R&D Bot received task via event_bus: {payload}")
    task_id = payload.get("task_id", "rnd_task")
    chat_id = payload.get("chat_id", settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0)
    description = payload.get("description", "")
    
    prompt_text = (
        f"Ты аналитик отдела исследований и разработки (R&D) сити-фермы. Твоя задача:\n{description}\n\n"
        "Проанализируй рынок, мировые тренды в HoReCa, предложи новые идеи сортов микрозелени или съедобных цветов. Дай структурированный ответ."
    )
    
    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt_text}],
        )
        report = response.choices[0].message.content
    except Exception as e:
        logger.error(f"OpenAI error: {e}")
        report = "Не удалось сгенерировать отчет R&D из-за ошибки ИИ."
        
    # Send result back via Event Bus to Stepan
    await event_bus.publish("TASK_COMPLETED", {
        "task_id": task_id,
        "completed_by": "rnd",
        "chat_id": chat_id,
        "text": f"🧬 <b>Отчет Отдела R&D (Анализ рынка и трендов):</b>\n\n{report}"
    }, "rnd_bot")

async def main():
    logger.info("Starting R&D Bot Microservice...")
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    
    app = web.Application()
    app.router.add_post('/n8n-webhook', handle_n8n_webhook)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 8091)
    await site.start()

    # Еженедельные R&D-рекомендации по трендам Instagram (Пн 10:00)
    scheduler.add_cron(name="weekly_instagram_rnd", func=weekly_instagram_rnd,
                       hour=10, minute=0, day_of_week=0)
    await scheduler.start()
    logger.info("R&D Bot running on port 8091 (weekly Instagram trends: Mon 10:00)")

    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
