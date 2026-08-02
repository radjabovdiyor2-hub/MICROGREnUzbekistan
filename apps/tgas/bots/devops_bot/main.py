import asyncio
import logging

from aiohttp import web
from shared.config import settings
from shared.event_bus import event_bus

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] DEVOPS_BOT: %(message)s"
)
logger = logging.getLogger(__name__)

# Каталог бэкапов и его создание живут в shared/backup.py — единственном
# месте, которое знает, куда и как класть дампы.


async def run_backup() -> dict:
    """Сделать дамп базы. Возвращает {ok, file, size, message}.

    Один вход на все три источника: вебхук n8n, задача от Стёпана через
    event_bus и кнопка «Бекап БД» в веб-админке.

    Сам бэкап делает shared/backup.py — единственная реализация в проекте.
    Здесь раньше был собственный pg_dump, и он был хуже общего: не проверял
    дамп на обрезанность, не вывозил копию с сервера, при отказе клал на
    диск файл-заглушку и называл файлы так, что их не подчищала ротация.
    Осталась только петля обучения — она специфична для DevOps.
    """
    from shared.backup import run_backup_cycle

    result = await run_backup_cycle()

    # Замыкаем петлю: DevOps (замер надёжности бекапов -> вывод -> адаптация).
    try:
        from shared.feedback_loop import feedback_loop

        await feedback_loop.evaluate_and_adapt(
            bot="devops_bot",
            metric="system_reliability",
            current_data={
                "backup_file": result["file"],
                "backup_success": result["ok"],
                "size_bytes": result["size"],
            },
            benchmark_data={"target_uptime_pct": 99.9},
        )
    except Exception as fe:
        logger.warning(f"DevOps feedback loop error: {fe}")

    return result


async def bus_daily_backup(params: dict) -> dict:
    """Бекап по команде из веб-админки (bot_bus)."""
    logger.info("DevOps Bot: бекап запрошен через bot_bus")
    result = await run_backup()
    if not result["ok"]:
        # Пусть админка покажет это красным, а не «успешно».
        raise RuntimeError(result["message"])
    return result


async def handle_n8n_webhook(request: web.Request):
    """Webhook from n8n for DevOps tasks"""
    try:
        payload = await request.json()
        action = payload.get("action")

        if action == "daily_backup":
            logger.info("DevOps Bot: Starting daily backup")
            result = await run_backup()

            # Send result back via Event Bus to Stepan
            await event_bus.publish(
                "TASK_COMPLETED",
                {
                    "task_id": "devops_daily_backup",
                    "completed_by": "devops_bot",
                    "chat_id": settings.admin_telegram_ids[0]
                    if settings.admin_telegram_ids
                    else 0,
                    "text": f"🛠 <b>Отчет DevOps-бота (Системный администратор):</b>\n\n{result['message']}",
                },
                "devops_bot",
            )

            return web.json_response(
                {
                    "status": "success" if result["ok"] else "degraded",
                    "file": result["file"],
                }
            )

        return web.json_response({"status": "ignored"})

    except Exception as e:
        logger.error(f"Error handling webhook: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def handle_task_created(payload: dict):
    """Слушаем задачи от Степана по шине сообщений"""
    data = payload.get("data", {})
    # Регистр приводим, как у остальных ботов: диспетчер может прислать
    # "QA"/"DevOps", и строгое сравнение молча теряло такую задачу.
    if str(data.get("department", "")).lower() != "devops":
        return

    logger.info(f"DevOps Bot received task via event_bus: {payload}")
    task_id = data.get("task_id", "devops_task")
    chat_id = data.get(
        "chat_id", settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0
    )
    description = data.get("description", "").lower()

    if "backup" in description or "бэкап" in description or "бекап" in description:
        status_msg = (await run_backup())["message"]
        # Send result back via Event Bus to Stepan
        await event_bus.publish(
            "TASK_COMPLETED",
            {
                "task_id": task_id,
                "completed_by": "devops",
                "chat_id": chat_id,
                "text": f"🛠 <b>Отчет DevOps-бота (Системный администратор):</b>\n\n{status_msg}",
            },
            "devops_bot",
        )
    else:
        from shared.task_executor import execute_bot_task
        from shared.prompts import TEAM_CONTEXT
        
        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Системный администратор и DevOps-инженер (DevOps Bot). Отвечай четко, структурно. Предлагай системные решения."
        
        logger.info("DevOps Bot passing task to TaskExecutor...")
        await execute_bot_task(
            bot=None,
            bot_name="devops_bot",
            department="devops",
            task_data=data,
            team_context=sys_prompt
        )
        logger.info("DevOps Bot successfully handled task.")


async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("devops_bot", payload)


async def main():
    logger.info("Starting DevOps Bot Microservice...")
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("ROLL_CALL", handle_roll_call)

    app = web.Application()
    app.router.add_post("/n8n-webhook", handle_n8n_webhook)
    await event_bus.start_listening(8092, app)

    # ── Bot Bus: задачи от Стёпана и из веб-админки ──
    # Словарь обработчиков был пустым: любая адресная задача (в том числе
    # «Бекап БД» из админки) отклонялась как «неизвестное действие» и
    # после трёх попыток уходила в failed.
    from shared.bot_bus import start_listener as bus_listen

    asyncio.create_task(
        bus_listen(
            "devops_bot",
            {
                "daily_backup": bus_daily_backup,
            },
        )
    )

    from shared.health import start_heartbeat

    asyncio.create_task(start_heartbeat("devops_bot"))

    logger.info("DevOps Bot running on port 8092")

    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
