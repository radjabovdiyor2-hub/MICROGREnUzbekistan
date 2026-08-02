import asyncio
import logging
from aiohttp import web
from shared.event_bus import event_bus
from shared.scheduler import BotScheduler

from bots.franchise_bot.handlers.daily_journal import register_scheduler_tasks, generate_daily_franchise_journals

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] FRANCHISE_BOT: %(message)s"
)
logger = logging.getLogger(__name__)

scheduler = BotScheduler("franchise_bot")
register_scheduler_tasks(scheduler)


async def handle_n8n_webhook(request: web.Request) -> dict:
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


async def handle_roll_call(payload: dict) -> None:
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("franchise_bot", payload)


async def start_server() -> dict:
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
