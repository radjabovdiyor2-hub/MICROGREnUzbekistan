import asyncio
import logging
import os

from datetime import datetime
from aiohttp import web
from shared.config import settings
from shared.event_bus import event_bus

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] DEVOPS_BOT: %(message)s")
logger = logging.getLogger(__name__)

BACKUP_DIR = "/app/backups"
os.makedirs(BACKUP_DIR, exist_ok=True)


async def run_backup() -> dict:
    """Сделать дамп базы. Возвращает {ok, file, message}.

    Одна реализация на все три входа: вебхук n8n, задача от Стёпана через
    event_bus и кнопка «Бекап БД» в веб-админке. Раньше тело бекапа было
    скопировано в двух местах и уже начало расходиться — в ветке вебхука
    замыкалась петля обучения, а в ветке задачи нет.

    ВАЖНО: при отсутствии pg_dump создаётся файл-заглушка, и функция
    честно сообщает об этом (ok=False). Прежний код в обеих ветках
    рапортовал об успехе — «бекап» на диске был, а данных в нём не было.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"microgreen_backup_{timestamp}.sql"
    filepath = os.path.join(BACKUP_DIR, filename)

    try:
        db_url = settings.database_url.replace("+asyncpg", "")
        process = await asyncio.create_subprocess_shell(
            f"pg_dump {db_url} > {filepath}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise Exception(stderr.decode())

        size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
        ok, status_msg = True, f"✅ Бекап базы готов: {filename} ({size // 1024} КБ)"
    except Exception as exc:
        logger.error(f"Backup failed: {exc}. Creating dummy backup.")
        with open(filepath, "w") as f:
            f.write(f"-- BACKUP GENERATED AT {timestamp} --\n-- DUMMY FILE --\n")
        size = 0
        ok = False
        status_msg = f"⚠️ Настоящий бекап НЕ сделан (pg_dump недоступен: {exc}). Файл-заглушка: {filename}"

    # Замыкаем петлю: DevOps (замер надёжности бекапов -> вывод -> адаптация).
    try:
        from shared.feedback_loop import feedback_loop
        await feedback_loop.evaluate_and_adapt(
            bot="devops_bot",
            metric="system_reliability",
            current_data={"backup_file": filename, "backup_success": ok, "size_bytes": size},
            benchmark_data={"target_uptime_pct": 99.9},
        )
    except Exception as fe:
        logger.warning(f"DevOps feedback loop error: {fe}")

    return {"ok": ok, "file": filename, "size": size, "message": status_msg}


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
            await event_bus.publish("TASK_COMPLETED", {
                "task_id": "devops_daily_backup",
                "completed_by": "devops_bot",
                "chat_id": settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0,
                "text": f"🛠 <b>Отчет DevOps-бота (Системный администратор):</b>\n\n{result['message']}"
            }, "devops_bot")

            return web.json_response({"status": "success" if result["ok"] else "degraded",
                                      "file": result["file"]})

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
    chat_id = data.get("chat_id", settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0)
    description = data.get("description", "").lower()
    
    if "backup" in description or "бэкап" in description or "бекап" in description:
        status_msg = (await run_backup())["message"]
    else:
        status_msg = "ℹ️ Неизвестная команда. Поддерживается только: 'сделай бекап'."
        
    # Send result back via Event Bus to Stepan
    await event_bus.publish("TASK_COMPLETED", {
        "task_id": task_id,
        "completed_by": "devops",
        "chat_id": chat_id,
        "text": f"🛠 <b>Отчет DevOps-бота (Системный администратор):</b>\n\n{status_msg}"
    }, "devops_bot")

async def main():
    logger.info("Starting DevOps Bot Microservice...")
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    
    app = web.Application()
    app.router.add_post('/n8n-webhook', handle_n8n_webhook)
    await event_bus.start_listening(8092, app)
    
    # ── Bot Bus: задачи от Стёпана и из веб-админки ──
    # Словарь обработчиков был пустым: любая адресная задача (в том числе
    # «Бекап БД» из админки) отклонялась как «неизвестное действие» и
    # после трёх попыток уходила в failed.
    from shared.bot_bus import start_listener as bus_listen
    asyncio.create_task(bus_listen("devops_bot", {
        "daily_backup": bus_daily_backup,
    }))

    from shared.health import start_heartbeat
    asyncio.create_task(start_heartbeat("devops_bot"))

    logger.info("DevOps Bot running on port 8092")
    
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
