"""
Инструменты DevOps — отдела без Telegram-интерфейса.

Заводится отдельно от `common.py`: DevOps работает только по задачам с шины,
и без собственных инструментов задача «сними бэкап» закрывалась бы текстом
без единого действия.
"""

from __future__ import annotations

from typing import Any, Dict

from shared import bot_registry
from shared.tools.registry import Tool, register

DEVOPS = ["devops"]


async def get_bot_health() -> Dict[str, Any]:
    """Кто из ботов на связи, а кто молчит."""
    client = None
    try:
        import redis.asyncio as aioredis

        from shared.config import settings

        client = aioredis.from_url(settings.redis_url, decode_responses=True)
        alive: list[str] = []
        silent: list[str] = []
        for bot in bot_registry.BOTS:
            beat = await client.hget(f"bot:heartbeat:{bot.name}", "ts")
            (alive if beat else silent).append(bot.name)
        return {"alive": alive, "silent": silent, "total": len(bot_registry.BOTS)}
    except Exception as exc:
        return {"error": f"Пульс ботов недоступен: {exc}"}
    finally:
        # Соединение закрываем: инструмент вызывается на каждую задачу DevOps,
        # и незакрытый клиент тёк по одному коннекту за вызов.
        if client is not None:
            try:
                await client.aclose()
            except Exception:
                pass


async def run_backup() -> Dict[str, Any]:
    """Снять резервную копию базы: дамп, проверка, копия на сторону.

    Именно `run_backup_cycle`, а не голый `create_backup`. Цикл сам объявляет
    себя единственной реализацией бэкапа: он проверяет дамп (`verify_backup`)
    и уносит копию с сервера (`copy_offsite`). Инструмент звал только первый
    шаг — обрезанный дамп (кончилось место, процесс убит) возвращал путь с
    кодом 0, и владельцу докладывали «бэкап удался», хотя восстановить из
    такого файла нельзя, да и лежал он только на той же машине.
    """
    try:
        from shared import backup

        result = await backup.run_backup_cycle()
    except Exception as exc:
        return {"ok": False, "message": f"Бэкап не выполнен: {exc}"}

    # run_backup_cycle отдаёт {ok, file, size, message, offsite}.
    ok = bool(result.get("ok"))
    return {
        "ok": ok,
        "backup": result.get("file") or "не создан",
        "size": result.get("size"),
        "offsite": result.get("offsite"),
        "message": result.get("message")
        or ("Бэкап снят, проверен и скопирован." if ok else "Бэкап не удался."),
    }


register(
    Tool(
        name="get_bot_health",
        admin_tab="bot_health",
        description="Кто из ботов офиса на связи, а кто молчит.",
        run=get_bot_health,
        departments=DEVOPS,
    )
)

register(
    Tool(
        name="run_backup",
        description="Снять резервную копию базы данных.",
        run=run_backup,
        departments=DEVOPS,
        risky=True,
        admin_tab="bot_health",
        confirm=lambda a: "Снять резервную копию базы",
        # Бэкап ничего не портит и ничего не тратит — держать его за
        # подтверждением незачем. Тем более что у безголового DevOps этот
        # инструмент из-за подтверждения не выполнялся вообще никогда.
        auto_when=lambda a, lim: True,
    )
)
