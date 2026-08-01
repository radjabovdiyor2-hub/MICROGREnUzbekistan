import logging
from sqlalchemy import text
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

async def _ensure_seen_table() -> None:
    pass

async def _already_seen(comment_id: str) -> bool:
    try:
        async with get_session_ctx() as s:
            r = await s.execute(
                text("SELECT 1 FROM ig_comment_seen WHERE comment_id = :c"),
                {"c": comment_id},
            )
            return r.fetchone() is not None
    except Exception:
        return False

async def _mark_seen(comment_id: str) -> None:
    try:
        async with get_session_ctx() as s:
            await s.execute(
                text(
                    "INSERT INTO ig_comment_seen (comment_id) VALUES (:c) ON CONFLICT DO NOTHING"
                ),
                {"c": comment_id},
            )
            await s.commit()
    except Exception as e:
        logger.warning(f"mark_seen error: {e}")
