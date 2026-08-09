"""
Инструменты служебных отделов: QA (качество урожая), R&D (опыты), DevOps.

У этих трёх ботов нет Telegram-интерфейса — они работают только по задачам с
шины. Тем важнее, чтобы у них были настоящие инструменты: иначе задача «проверь
партию» закрывалась текстом без единой записи.

КУДА ПИШУТСЯ ОТК И ОПЫТЫ

Раньше оба журнала писались в `tasks` со статусом `done`, а докстринг уверял,
что «отдельной таблицы под журнал качества в схеме нет». Это было неправдой:
`quality_controls` и `experiments` есть в `schema.prisma`, их ведёт веб-админка
(вкладки «ОТК» и «Эксперименты»), и `get_quality_report` читает именно
`quality_controls`. То есть QA-бот записывал брак — и ни отчёт по качеству, ни
владелец в админке этого не видели никогда.

Теперь записи идут в настоящие таблицы через `shared/production_repo.py`
(HTTP к витрине). Эскалация брака задачей отделу `pm` осталась: это
уведомление производству, и ему место именно в `tasks`.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import text

from shared import bot_registry, production_repo
from shared.database import get_session_ctx
from shared.tools.registry import Tool, register

QA = ["qa"]
RND = ["rnd"]
DEVOPS = ["devops"]


async def log_quality_check(
    batch: str, verdict: str, issues: str = "", crop: str = ""
) -> Dict[str, Any]:
    """Записать результат проверки партии в журнал ОТК."""
    ok = str(verdict).lower() in ("ok", "pass", "годна", "принята")

    written = await production_repo.log_quality(
        batch_id=batch,
        status="passed" if ok else "defect",
        defect_type="" if ok else str(verdict),
        notes=f"Культура: {crop or '—'}. Вердикт: {verdict}. Замечания: {issues or 'нет'}",
    )
    if not written.get("ok"):
        # Отказ витрины — отказ операции. Молча «записать» в другую таблицу
        # нельзя: именно так журнал ОТК и разошёлся с админкой.
        return {
            "ok": False,
            "error": written.get("error", ""),
            "note": "Проверка НЕ записана в журнал ОТК. Не говори, что записал.",
        }

    record = written.get("data") or {}
    result: Dict[str, Any] = {"ok": True, "record_id": record.get("id"), "passed": ok}
    if not ok:
        # Брак — это не только запись в журнале: производство должно узнать.
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO tasks (title, assignee, department, status, priority, "
                    "description, created_at) "
                    "VALUES (:t, 'pm', 'pm', 'todo', 'high', :descr, NOW())"
                ),
                {
                    "t": f"Брак в партии {batch} — разобраться"[:255],
                    "descr": f"QA забраковал партию {batch}. Замечания: {issues or '—'}",
                },
            )
            await session.commit()
        result["escalated_to"] = "pm"
    return result


async def log_experiment(
    hypothesis: str, crop: str = "", result: str = "", metric: Optional[float] = None
) -> Dict[str, Any]:
    """Записать опыт R&D в журнал экспериментов: гипотеза, культура, результат."""
    written = await production_repo.log_experiment(
        title=f"{crop or 'Опыт'}: {hypothesis}",
        hypothesis=(
            f"Культура: {crop or '—'}\n"
            f"Гипотеза: {hypothesis}\n"
            f"Результат: {result or 'ещё идёт'}\n"
            f"Показатель: {metric if metric is not None else '—'}"
        ),
        status="success" if result else "ongoing",
    )
    if not written.get("ok"):
        return {
            "ok": False,
            "error": written.get("error", ""),
            "note": "Опыт НЕ записан. Не говори, что записал.",
        }

    record = written.get("data") or {}
    return {
        "ok": True,
        "experiment_id": record.get("id"),
        "closed": bool(result),
    }


async def get_bot_health() -> Dict[str, Any]:
    """Кто из ботов на связи, а кто молчит."""
    try:
        import redis.asyncio as aioredis

        from shared.config import settings

        client = aioredis.from_url(settings.redis_url, decode_responses=True)
        alive, silent = [], []
        for bot in bot_registry.BOTS:
            beat = await client.hget(f"bot:heartbeat:{bot.name}", "ts")
            (alive if beat else silent).append(bot.name)
        return {"alive": alive, "silent": silent, "total": len(bot_registry.BOTS)}
    except Exception as exc:
        return {"error": f"Пульс ботов недоступен: {exc}"}


async def run_backup() -> Dict[str, Any]:
    """Снять резервную копию базы."""
    try:
        from shared import backup

        path = await backup.create_backup()
        return {"ok": bool(path), "backup": path or "не создан"}
    except Exception as exc:
        return {"ok": False, "message": f"Бэкап не выполнен: {exc}"}


register(
    Tool(
        name="log_quality_check",
        description=(
            "Записать результат проверки партии урожая. Если партия забракована, "
            "производству автоматически ставится задача разобраться."
        ),
        run=log_quality_check,
        departments=QA,
        params={
            "batch": {"type": "string", "description": "Номер или название партии"},
            "verdict": {"type": "string", "description": "Годна / брак и почему"},
            "issues": {"type": "string", "description": "Замечания: плесень, вытягивание, всхожесть"},
            "crop": {"type": "string", "description": "Культура"},
        },
        required=["batch", "verdict"],
    )
)

register(
    Tool(
        name="log_experiment",
        description="Записать опыт R&D: гипотеза, культура, результат, показатель.",
        run=log_experiment,
        departments=RND,
        params={
            "hypothesis": {"type": "string", "description": "Что проверяем"},
            "crop": {"type": "string", "description": "Культура или субстрат"},
            "result": {"type": "string", "description": "Итог, если опыт завершён"},
            "metric": {"type": "number", "description": "Числовой показатель (урожайность, дни)"},
        },
        required=["hypothesis"],
    )
)

register(
    Tool(
        name="get_bot_health",
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
        confirm=lambda a: "Снять резервную копию базы",
    )
)
