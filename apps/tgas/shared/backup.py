"""
💾 AUTO BACKUP — Автоматическое резервное копирование PostgreSQL
================================================================
Создаёт ежедневные бэкапы БД, хранит последние 7 штук.
"""

import asyncio
import logging
import os
import glob
from datetime import datetime
from pathlib import Path
from shared.config import settings

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

MAX_BACKUPS = 7  # Хранить последние 7 бэкапов


async def create_backup() -> str:
    """
    Создаёт бэкап PostgreSQL через pg_dump.
    Возвращает путь к файлу бэкапа.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"tgas_backup_{timestamp}.sql"
    
    # Формируем URL для pg_dump
    db_url = settings.sync_database_url
    
    # Извлекаем компоненты из URL
    # postgresql://user:pass@host:port/dbname
    try:
        from urllib.parse import urlparse
        parsed = urlparse(db_url)
        
        env = os.environ.copy()
        env["PGPASSWORD"] = parsed.password or ""
        
        cmd = [
            "pg_dump",
            "-h", parsed.hostname or "localhost",
            "-p", str(parsed.port or 5432),
            "-U", parsed.username or "postgres",
            "-d", parsed.path.lstrip("/"),
            "-f", str(backup_file),
            "--no-owner",
            "--no-acl",
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            size_mb = backup_file.stat().st_size / (1024 * 1024)
            logger.info(f"Бэкап создан: {backup_file.name} ({size_mb:.1f} MB)")
            
            # Очистка старых бэкапов
            await cleanup_old_backups()
            
            return str(backup_file)
        else:
            error_msg = stderr.decode("utf-8", errors="replace")
            logger.error(f"pg_dump ошибка: {error_msg}")
            return None
            
    except Exception as e:
        logger.error(f"Ошибка создания бэкапа: {e}", exc_info=True)
        return None


async def cleanup_old_backups():
    """Удаляет старые бэкапы, оставляя последние MAX_BACKUPS."""
    backups = sorted(BACKUP_DIR.glob("tgas_backup_*.sql"), key=lambda f: f.stat().st_mtime)
    
    while len(backups) > MAX_BACKUPS:
        old = backups.pop(0)
        old.unlink()
        logger.info(f"Удалён старый бэкап: {old.name}")


async def list_backups() -> list:
    """Возвращает список существующих бэкапов."""
    backups = []
    for f in sorted(BACKUP_DIR.glob("tgas_backup_*.sql"), reverse=True):
        size_mb = f.stat().st_size / (1024 * 1024)
        backups.append({
            "name": f.name,
            "size_mb": round(size_mb, 1),
            "created": datetime.fromtimestamp(f.stat().st_mtime).strftime("%d.%m.%Y %H:%M"),
        })
    return backups


async def daily_backup_task():
    """Задача для планировщика: ежедневный бэкап в 03:00."""
    logger.info("Запуск ежедневного бэкапа...")
    result = await create_backup()
    if result:
        logger.info(f"Ежедневный бэкап завершён: {result}")
    else:
        logger.error("Ежедневный бэкап не удался!")
