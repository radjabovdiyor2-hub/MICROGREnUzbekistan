import logging
from typing import Optional
from sqlalchemy import text
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

async def get_job_overrides(bot: str) -> dict[str, dict]:
    overrides: dict[str, dict] = {}
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT name, kind, hour, minute, day_of_week, day_of_month, "
                    "seconds, enabled FROM bot_jobs WHERE bot = :bot"
                ),
                {"bot": bot},
            )
            for row in res.fetchall():
                overrides[row[0]] = {
                    "kind": row[1],
                    "hour": row[2],
                    "minute": row[3],
                    "day_of_week": row[4],
                    "day_of_month": row[5],
                    "seconds": row[6],
                    "enabled": row[7],
                }
    except Exception as exc:
        logger.debug("settings_store: расписания %s не прочитаны (%s)", bot, exc)
    return overrides

async def register_job(bot: str, name: str, kind: str, **fields: dict) -> None:
    try:
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO bot_jobs (id, bot, name, kind, hour, minute, "
                    "day_of_week, day_of_month, seconds, enabled, updated_at) "
                    "VALUES (gen_random_uuid()::text, :bot, :name, :kind, :hour, :minute, "
                    ":dow, :dom, :seconds, TRUE, NOW()) "
                    "ON CONFLICT (bot, name) DO NOTHING"
                ),
                {
                    "bot": bot,
                    "name": name,
                    "kind": kind,
                    "hour": fields.get("hour"),
                    "minute": fields.get("minute"),
                    "dow": fields.get("day_of_week"),
                    "dom": fields.get("day_of_month"),
                    "seconds": fields.get("seconds"),
                },
            )
    except Exception as exc:
        logger.debug("settings_store: задача %s/%s не зарегистрирована (%s)", bot, name, exc)

async def record_job_run(bot: str, name: str, status: str, error: Optional[str] = None) -> None:
    try:
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "UPDATE bot_jobs SET last_run_at = NOW(), last_status = :status, "
                    "last_error = :error WHERE bot = :bot AND name = :name"
                ),
                {
                    "bot": bot,
                    "name": name,
                    "status": status,
                    "error": (error or "")[:1000] or None,
                },
            )
    except Exception as exc:
        logger.debug("settings_store: факт запуска %s/%s не записан (%s)", bot, name, exc)
