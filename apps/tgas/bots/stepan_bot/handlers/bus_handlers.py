import logging
from sqlalchemy import text
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)


async def bus_get_tasks(params: dict) -> dict:
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT id, title, department, status, priority, deadline FROM tasks "
                    "WHERE status NOT IN ('done', 'cancelled') "
                    "ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, deadline ASC NULLS LAST LIMIT 20"
                )
            )
            rows = res.fetchall()
            res2 = await session.execute(
                text("SELECT status, COUNT(*) FROM tasks GROUP BY status")
            )
            stats = {r[0]: r[1] for r in res2.fetchall()}
        tasks_list = [
            {
                "id": r[0],
                "title": r[1],
                "department": r[2],
                "status": r[3],
                "priority": r[4],
                "deadline": str(r[5]) if r[5] else None,
            }
            for r in rows
        ]
        return {
            "status": "ok",
            "message": f"Активных задач: {len(tasks_list)}",
            "data": {"tasks": tasks_list, "stats": stats},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def bus_get_deadlines(params: dict) -> dict:
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT id, title, deadline, priority, department FROM tasks "
                    "WHERE deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND status NOT IN ('done', 'cancelled') "
                    "ORDER BY deadline ASC"
                )
            )
            rows = res.fetchall()
        deadlines = [
            {
                "id": r[0],
                "title": r[1],
                "deadline": str(r[2]),
                "priority": r[3],
                "department": r[4],
            }
            for r in rows
        ]
        return {
            "status": "ok",
            "message": f"Дедлайнов в ближайшие 7 дней: {len(deadlines)}",
            "data": deadlines,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def bus_force_learning_cycle(params: dict) -> dict:
    """Прогнать петли обучения по всем ботам сейчас — кнопка в админке."""
    from shared.feedback_loop import feedback_loop

    pairs: list[tuple[str, str]] = []
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text("SELECT DISTINCT bot, metric FROM bot_learnings ORDER BY bot, metric")
            )
            pairs = [(r[0], r[1]) for r in res.fetchall()]
    except Exception as exc:
        return {"status": "error", "message": f"Не удалось прочитать петли: {exc}"}

    if not pairs:
        return {
            "status": "ok",
            "message": "Петли ещё не запускались — нечего пересчитывать. "
            "Дождитесь первого планового цикла.",
        }

    done, failed = 0, 0
    for bot_name, metric in pairs:
        try:
            await feedback_loop.evaluate_and_adapt(
                bot=bot_name,
                metric=metric,
                current_data={"trigger": "manual", "source": "web_admin"},
                benchmark_data={},
            )
            done += 1
        except Exception as exc:
            logger.warning(
                "force_learning_cycle: %s/%s упал: %s", bot_name, metric, exc
            )
            failed += 1

    return {
        "status": "ok",
        "message": f"Петли пересчитаны: {done} успешно, {failed} с ошибкой",
        "processed": done,
        "failed": failed,
    }
