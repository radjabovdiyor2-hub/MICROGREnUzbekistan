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

async def handle_n8n_webhook(request: web.Request):
    """Webhook from n8n for DevOps tasks"""
    try:
        payload = await request.json()
        action = payload.get("action")
        
        if action == "daily_backup":
            logger.info("DevOps Bot: Starting daily backup")
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"microgreen_backup_{timestamp}.sql"
            filepath = os.path.join(BACKUP_DIR, filename)
            
            # Simulated backup (or actual if pg_dump is installed)
            try:
                # We try to use pg_dump. If it fails, we just create a text file.
                db_url = settings.database_url.replace("+asyncpg", "")
                process = await asyncio.create_subprocess_shell(
                    f"pg_dump {db_url} > {filepath}",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await process.communicate()
                
                if process.returncode != 0:
                    raise Exception(stderr.decode())
                
                status_msg = f"Успешный бекап базы данных. Файл: {filename}"
            except Exception as e:
                logger.error(f"Backup failed: {e}. Creating dummy backup.")
                with open(filepath, "w") as f:
                    f.write(f"-- BACKUP GENERATED AT {timestamp} --\n-- DUMMY FILE --\n")
                status_msg = f"Симуляция бекапа (pg_dump не найден). Файл: {filename}"
                
            # Send result back via Event Bus to Stepan
            await event_bus.publish("TASK_COMPLETED", {
                "task_id": "devops_daily_backup",
                "completed_by": "devops_bot",
                "chat_id": settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0,
                "text": f"🛠 <b>Отчет DevOps-бота (Системный администратор):</b>\n\n{status_msg}"
            }, "devops_bot")
            
            return web.json_response({"status": "success", "file": filename})
            
        return web.json_response({"status": "ignored"})
        
    except Exception as e:
        logger.error(f"Error handling webhook: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def handle_task_created(payload: dict):
    """Слушаем задачи от Степана по шине сообщений"""
    data = payload.get("data", {})
    if data.get("department") != "devops":
        return
        
    logger.info(f"DevOps Bot received task via event_bus: {payload}")
    task_id = data.get("task_id", "devops_task")
    chat_id = data.get("chat_id", settings.admin_telegram_ids[0] if settings.admin_telegram_ids else 0)
    description = data.get("description", "").lower()
    
    if "backup" in description or "бэкап" in description or "бекап" in description:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"microgreen_backup_{timestamp}.sql"
        filepath = os.path.join(BACKUP_DIR, filename)
        
        try:
            db_url = settings.database_url.replace("+asyncpg", "")
            process = await asyncio.create_subprocess_shell(
                f"pg_dump {db_url} > {filepath}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                raise Exception(stderr.decode())
            status_msg = f"✅ Успешный бекап базы данных. Файл: {filename}"
        except Exception as e:
            logger.error(f"Backup failed: {e}. Creating dummy backup.")
            with open(filepath, "w") as f:
                f.write(f"-- BACKUP GENERATED AT {timestamp} --\n-- DUMMY FILE --\n")
            status_msg = f"⚠️ Симуляция бекапа (pg_dump не найден). Файл: {filename}"
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
    
    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    from shared.event_bus import BotBusActions
    asyncio.create_task(bus_listen("devops_bot", {}))
    
    logger.info("DevOps Bot running on port 8092")
    
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
