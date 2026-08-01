from sqlalchemy import text
from shared.database import get_session_ctx
from shared.content_archive.core import RETENTION_DAYS
from shared.content_archive.db import _load_day

def load_state() -> dict:
    import asyncio
    async def _load() -> dict:
        state = {}
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT DISTINCT date FROM content_publications ORDER BY date DESC LIMIT :n"
                ),
                {"n": RETENTION_DAYS + 1},
            )
            days = [row[0] for row in res.fetchall()]
            for day in days:
                entries = await _load_day(session, day)
                if entries:
                    state[day] = entries
        return state

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, _load()).result(timeout=10)
    else:
        return asyncio.run(_load())

def _save_state(state: dict) -> None:
    import asyncio
    async def _save() -> None:
        async with get_session_ctx() as session:
            for day, slots in state.items():
                if not isinstance(slots, dict):
                    continue
                for slot_name, rec in slots.items():
                    if not isinstance(rec, dict):
                        continue
                    await session.execute(
                        text(
                            "INSERT INTO content_publications "
                            "(date, slot, published_at, ig_posted, media_id, file_path, caption, title, reach, likes, comments) "
                            "VALUES (:d, :s, :at, :ig, :mid, :fp, :cap, :ttl, :reach, :likes, :comments) "
                            "ON CONFLICT (date, slot) DO UPDATE SET "
                            "published_at = EXCLUDED.published_at, ig_posted = EXCLUDED.ig_posted, "
                            "media_id = COALESCE(EXCLUDED.media_id, content_publications.media_id), "
                            "file_path = COALESCE(EXCLUDED.file_path, content_publications.file_path), "
                            "caption = COALESCE(EXCLUDED.caption, content_publications.caption), "
                            "title = COALESCE(EXCLUDED.title, content_publications.title), "
                            "reach = COALESCE(EXCLUDED.reach, content_publications.reach), "
                            "likes = COALESCE(EXCLUDED.likes, content_publications.likes), "
                            "comments = COALESCE(EXCLUDED.comments, content_publications.comments)"
                        ),
                        {
                            "d": day,
                            "s": slot_name,
                            "at": rec.get("at"),
                            "ig": bool(rec.get("ig")),
                            "mid": rec.get("media_id"),
                            "fp": rec.get("file"),
                            "cap": rec.get("caption"),
                            "ttl": rec.get("title"),
                            "reach": rec.get("reach"),
                            "likes": rec.get("likes"),
                            "comments": rec.get("comments"),
                        },
                    )

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(asyncio.run, _save()).result(timeout=10)
    else:
        asyncio.run(_save())
