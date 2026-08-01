import logging
import os
from pathlib import Path
from aiogram import Bot

from shared.backup.core import create_backup, cleanup_old_backups
from shared.backup.offsite import verify_backup, copy_offsite

logger = logging.getLogger(__name__)


async def run_backup_cycle() -> dict:
    path = await create_backup()
    if not path:
        return {
            "ok": False,
            "file": None,
            "size": 0,
            "offsite": False,
            "message": "🚨 Бэкап БД НЕ создан. Проверьте место на диске и доступность PostgreSQL.",
        }

    name = Path(path).name
    size = Path(path).stat().st_size if Path(path).exists() else 0

    if not await verify_backup(path):
        return {
            "ok": False,
            "file": name,
            "size": size,
            "offsite": False,
            "message": f"🚨 Бэкап повреждён: {name}. Вероятно, кончилось место.",
        }

    offsite = await copy_offsite(path)
    await cleanup_old_backups()

    if not offsite and os.getenv("BACKUP_REMOTE_TARGET", "").strip():
        return {
            "ok": True,
            "file": name,
            "size": size,
            "offsite": False,
            "message": f"⚠️ Бэкап создан, но не уехал наружу: {name}. Копия только на этом сервере.",
        }

    return {
        "ok": True,
        "file": name,
        "size": size,
        "offsite": offsite,
        "message": f"✅ Бэкап готов: {name} ({size // 1024} КБ)",
    }


async def daily_backup_task(bot: Bot=None) -> None:
    logger.info("Запуск ежедневного бэкапа...")
    result = await run_backup_cycle()

    if not result["ok"] or not result["offsite"]:
        if bot is not None:
            try:
                from shared.notifications import alert_admins
                await alert_admins(bot, f"<b>Бэкап БД</b>\n\n{result['message']}")
            except Exception as e:
                logger.error("Не удалось разослать алерт о бэкапе: %s", e)

        try:
            from shared.owner_alerts import raise_alert, SEVERITY_CRITICAL, SEVERITY_WARNING
            await raise_alert(
                kind="backup_failed",
                severity=SEVERITY_CRITICAL if not result["ok"] else SEVERITY_WARNING,
                title="Бэкап базы не удался" if not result["ok"] else "Бэкап не уехал наружу",
                message=result["message"],
                source="devops_bot",
                suggested_action={"action": "daily_backup", "bot": "devops_bot"},
            )
        except Exception as e:
            logger.error("Не удалось поднять сигнал о бэкапе в админке: %s", e)

    logger.info("Ежедневный бэкап завершён: %s", result["message"])
