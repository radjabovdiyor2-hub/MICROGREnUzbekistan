"""
💾 AUTO BACKUP — Автоматическое резервное копирование PostgreSQL
================================================================
Создаёт ежедневные бэкапы БД, хранит последние 7 штук.
"""

import asyncio
import logging
import os
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


async def verify_backup(backup_file: str) -> bool:
    """
    Проверяет, что дамп не пустой и заканчивается корректно.

    Без этой проверки «успешный» бэкап мог оказаться обрезанным (кончилось
    место, убили процесс) — и выяснялось бы это только в момент аварии.
    """
    try:
        path = Path(backup_file)
        if not path.exists() or path.stat().st_size < 1024:
            logger.error("Бэкап подозрительно мал или отсутствует: %s", backup_file)
            return False

        # pg_dump штатно завершает файл этой строкой.
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            tail = fh.readlines()[-20:]
        if not any("PostgreSQL database dump complete" in line for line in tail):
            logger.error("Бэкап не содержит маркера завершения — вероятно, обрезан: %s", backup_file)
            return False

        return True
    except Exception as e:
        logger.error("Не удалось проверить бэкап %s: %s", backup_file, e)
        return False


async def copy_offsite(backup_file: str) -> bool:
    """
    Копирует дамп за пределы сервера.

    Зачем: бэкапы лежали в apps/tgas/backups/ на той же машине, что и база.
    Отказ диска или потеря VPS уничтожали разом и данные, и все резервные
    копии — восстанавливать было бы нечем и некому.

    Адрес назначения задаётся в .env, чтобы не зашивать инфраструктуру в код:
      BACKUP_REMOTE_TARGET=user@backup-host:/srv/microgreen-backups/
      BACKUP_SSH_KEY=/home/ubuntu/.ssh/backup_key   (необязательно)

    Не задан — копирование пропускается с предупреждением (не ошибка: на
    dev-машине внешнего хранилища нет).
    """
    target = os.getenv("BACKUP_REMOTE_TARGET", "").strip()
    if not target:
        logger.warning(
            "BACKUP_REMOTE_TARGET не задан — копия бэкапа остаётся только на этом сервере"
        )
        return False

    ssh_key = os.getenv("BACKUP_SSH_KEY", "").strip()
    ssh_cmd = "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
    if ssh_key:
        ssh_cmd += f" -i {ssh_key}"

    cmd = ["rsync", "-az", "--partial", "-e", ssh_cmd, backup_file, target]

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()

        if process.returncode == 0:
            logger.info("Бэкап скопирован за пределы сервера: %s", target)
            return True

        logger.error(
            "Не удалось скопировать бэкап на %s: %s",
            target,
            stderr.decode("utf-8", errors="replace"),
        )
        return False
    except FileNotFoundError:
        logger.error("rsync не установлен — внешняя копия бэкапа не сделана")
        return False
    except Exception as e:
        logger.error("Ошибка копирования бэкапа наружу: %s", e)
        return False


async def daily_backup_task(bot=None):
    """
    Задача для планировщика: ежедневный бэкап в 03:00.

    Полный цикл: создать → проверить целостность → скопировать наружу.
    О провале любого шага сообщаем ВСЕМ администраторам: молчаливо неудачный
    бэкап — худший из возможных вариантов, потому что его отсутствие
    обнаруживается только когда он уже нужен.
    """
    logger.info("Запуск ежедневного бэкапа...")

    async def _alert(text: str) -> None:
        if bot is None:
            return
        try:
            from shared.notifications import alert_admins
            await alert_admins(bot, text)
        except Exception as e:
            logger.error("Не удалось разослать алерт о бэкапе: %s", e)

    result = await create_backup()
    if not result:
        logger.error("Ежедневный бэкап не удался!")
        await _alert("🚨 <b>Бэкап БД НЕ создан</b>\n\nПроверьте место на диске и доступность PostgreSQL.")
        return

    if not await verify_backup(result):
        await _alert(f"🚨 <b>Бэкап повреждён</b>\n\nФайл: {Path(result).name}\nВероятно, кончилось место.")
        return

    offsite = await copy_offsite(result)
    if not offsite and os.getenv("BACKUP_REMOTE_TARGET", "").strip():
        await _alert(
            f"⚠️ <b>Бэкап создан, но не уехал наружу</b>\n\nФайл: {Path(result).name}\n"
            "Копия существует только на этом сервере."
        )

    logger.info("Ежедневный бэкап завершён: %s (внешняя копия: %s)", result, offsite)
