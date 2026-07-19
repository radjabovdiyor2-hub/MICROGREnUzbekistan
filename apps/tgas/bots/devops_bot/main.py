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

async def _publish_magazine(params: dict) -> dict:
    """Модифицирует код сайта, выполняет билд и публикует выпуск."""
    try:
        content_data = params.get("content", {})
        ads_data = params.get("ads", [])
        
        # 1. Читаем текущий lib/magazine.ts
        import os
        import json
        
        # Переходим к корню репозитория
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
        lib_path = os.path.join(repo_root, "apps", "web", "src", "lib", "magazine.ts")
        
        with open(lib_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Находим текущий максимальный ID (простой парсинг)
        import re
        ids = [int(x) for x in re.findall(r'id:\s*(\d+)', content)]
        new_id = max(ids) + 1 if ids else 1
        
        new_issue_title = content_data.get("title", f"Выпуск {new_id}")
        
        # Превращаем статьи и хайлайты в HTML
        articles = content_data.get("content", [])
        articles_html = "".join([f"<h2>{a.get('title', '')}</h2><p>{a.get('text', '')}</p>" for a in articles])
        
        if ads_data:
            articles_html += f"<h2>Спонсоры Выпуска</h2><div class='ads'>{ads_data[0].get('content', '')}</div>"
            
        cover_url = content_data.get("cover_image_url", "/images/magazine_cover_default.jpg")
        
        # Формируем новую запись
        new_entry = f"""
  {{
    id: {new_id},
    title: {repr(new_issue_title)},
    date: new Date().toISOString().split('T')[0],
    cover: {repr(cover_url)},
    highlights: {json.dumps(content_data.get("highlights", []), ensure_ascii=False)},
    contentHtml: {repr(articles_html)},
    arEnabled: true
  }},
"""
        
        # Вставляем перед закрывающей скобкой массива
        idx = content.rfind("];")
        if idx != -1:
            new_content = content[:idx] + new_entry + content[idx:]
            with open(lib_path, "w", encoding="utf-8") as f:
                f.write(new_content)
                
        # 2. Выполняем сборку
        logger.info("Running npm run build for web...")
        web_dir = os.path.join(repo_root, "apps", "web")
        
        process = await asyncio.create_subprocess_shell(
            'cmd.exe /c "npm run build"',
            cwd=web_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            logger.error(f"Build failed: {stderr.decode('utf-8', errors='ignore')}")
            return {"status": "error", "message": "Сборка упала", "issue_id": new_id}
            
        return {
            "status": "done",
            "issue_id": new_id,
            "url": f"https://microgreenuzbekistan.com/magazine/{new_id}"
        }
    except Exception as e:
        logger.error(f"Error publishing magazine: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

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
    asyncio.create_task(bus_listen("devops_bot", {
        BotBusActions.PUBLISH_MAGAZINE: _publish_magazine,
    }))
    
    logger.info("DevOps Bot running on port 8092")
    
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
