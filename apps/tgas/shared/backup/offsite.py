import asyncio
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


async def verify_backup(backup_file: str) -> bool:
    try:
        path = Path(backup_file)
        if not path.exists() or path.stat().st_size < 1024:
            logger.error("Бэкап подозрительно мал или отсутствует: %s", backup_file)
            return False

        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            tail = fh.readlines()[-20:]
        if not any("PostgreSQL database dump complete" in line for line in tail):
            logger.error(
                "Бэкап не содержит маркера завершения — вероятно, обрезан: %s",
                backup_file,
            )
            return False

        return True
    except Exception as e:
        logger.error("Не удалось проверить бэкап %s: %s", backup_file, e)
        return False


async def copy_offsite(backup_file: str) -> bool:
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
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await process.communicate()

        if process.returncode == 0:
            logger.info("Бэкап скопирован за пределы сервера: %s", target)
            return True

        logger.error(
            "Не удалось скопировать бэкап на %s: %s", target, stderr.decode("utf-8", errors="replace")
        )
        return False
    except FileNotFoundError:
        logger.error("rsync не установлен — внешняя копия бэкапа не сделана")
        return False
    except Exception as e:
        logger.error("Ошибка копирования бэкапа наружу: %s", e)
        return False
