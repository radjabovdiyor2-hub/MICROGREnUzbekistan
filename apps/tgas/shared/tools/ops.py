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

from shared import bot_registry, production_repo, tasks_repo
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
        # defect_type — VarChar(50) в схеме. Свободный вердикт модели туда не
        # влезал, и запись падала на длине; полный текст и так идёт в notes.
        defect_type="" if ok else str(verdict)[:50],
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
        # Через tasks_repo.create, потому что голый INSERT не публиковал
        # TASK_CREATED — задача «разобраться с браком» создавалась мёртвой,
        # и производство о браке не узнавало никогда.
        escalation = await tasks_repo.create(
            title=f"Брак в партии {batch} — разобраться"[:500],
            department="pm",
            description=f"QA забраковал партию {batch}. Замечания: {issues or '—'}",
            priority="high",
            deadline_days=1,
        )
        result["escalated_to"] = "pm"
        result["escalation_task_id"] = escalation.get("task_id")
    return result


async def log_experiment(
    hypothesis: str, crop: str = "", result: str = "", metric: Optional[float] = None
) -> Dict[str, Any]:
    """Записать опыт R&D в журнал экспериментов: гипотеза, культура, результат."""
    written = await production_repo.log_experiment(
        title=f"{crop or 'Опыт'}: {hypothesis}",
        hypothesis=f"Культура: {crop or '—'}\nГипотеза: {hypothesis}",
        # Итог — в СВОЮ колонку `result`, а не внутрь гипотезы: её и читает
        # столбец «Результат» на вкладке «Эксперименты».
        result=(
            f"{result}"
            + (f" (показатель: {metric})" if metric is not None else "")
            if result
            else ""
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
    client = None
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
        name="log_quality_check",
        description=(
            "Записать результат проверки партии урожая в журнал ОТК. Сначала "
            "возьми id партии через get_grow_batches — запись идёт по нему. "
            "Если партия забракована, производству ставится задача разобраться."
        ),
        run=log_quality_check,
        departments=QA,
        params={
            # Не «номер или название»: журнал ОТК ссылается на grow_batches по
            # id, и прозаическое название давало нарушение внешнего ключа на
            # каждом вызове. Источник id — get_grow_batches, теперь видимый QA.
            "batch": {"type": "string", "description": "id партии из get_grow_batches"},
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
        admin_tab="bot_health",
        confirm=lambda a: "Снять резервную копию базы",
        # Бэкап ничего не портит и ничего не тратит — держать его за
        # подтверждением незачем. Тем более что у безголового DevOps этот
        # инструмент из-за подтверждения не выполнялся вообще никогда.
        auto_when=lambda a, lim: True,
    )
)
