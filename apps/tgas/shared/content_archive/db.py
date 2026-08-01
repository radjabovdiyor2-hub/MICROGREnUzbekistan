import logging
import shutil
from datetime import timedelta
from pathlib import Path
from typing import Optional
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.content_archive.core import tz_now, RETENTION_DAYS, MEDIA_DIR, BUS_DIR

logger = logging.getLogger(__name__)

async def _load_day(session, day: str) -> dict:
    res = await session.execute(
        text(
            "SELECT slot, published_at, ig_posted, media_id, file_path, caption, title, "
            "reach, likes, comments FROM content_publications WHERE date = :d"
        ),
        {"d": day},
    )
    entries = {}
    for row in res.fetchall():
        entries[row[0]] = {
            "at": row[1] or "",
            "ig": bool(row[2]),
            "media_id": row[3],
            "file": row[4],
            "caption": row[5] or "",
            "title": row[6] or "",
            "reach": row[7],
            "likes": row[8],
            "comments": row[9],
        }
    return entries

def _archive_image(image: str, day: str, slot: str) -> Optional[str]:
    if not image:
        return None
    src = Path(image)
    if not src.is_file():
        return None
    try:
        MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        dst = MEDIA_DIR / f"{day}_{slot}{src.suffix or '.jpg'}"
        shutil.copyfile(src, dst)
        return str(dst.relative_to(BUS_DIR)).replace("\\", "/")
    except Exception as e:
        logger.warning(f"Не удалось заархивировать картинку {image}: {e}")
        return None

async def _prune_old_records() -> None:
    cutoff = (tz_now() - timedelta(days=RETENTION_DAYS)).strftime("%Y-%m-%d")
    try:
        async with get_session_ctx() as session:
            await session.execute(
                text("DELETE FROM content_publications WHERE date < :cutoff"),
                {"cutoff": cutoff},
            )
    except Exception as e:
        logger.warning(f"prune content_publications: {e}")
    try:
        if MEDIA_DIR.is_dir():
            for f in MEDIA_DIR.iterdir():
                if f.is_file() and f.name[:10] < cutoff:
                    f.unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"prune content_media: {e}")

async def mark_published(
    slot: str,
    ig_ok: bool = True,
    image: Optional[str] = None,
    caption: Optional[str] = None,
    title: Optional[str] = None,
    media_id: Optional[str] = None,
) -> None:
    try:
        now = tz_now()
        day = now.strftime("%Y-%m-%d")
        archived = _archive_image(image, day, slot)

        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO content_publications "
                    "(date, slot, published_at, ig_posted, media_id, file_path, caption, title) "
                    "VALUES (:d, :s, :at, :ig, :mid, :fp, :cap, :ttl) "
                    "ON CONFLICT (date, slot) DO UPDATE SET "
                    "published_at = EXCLUDED.published_at, ig_posted = EXCLUDED.ig_posted, "
                    "media_id = COALESCE(EXCLUDED.media_id, content_publications.media_id), "
                    "file_path = COALESCE(EXCLUDED.file_path, content_publications.file_path), "
                    "caption = COALESCE(EXCLUDED.caption, content_publications.caption), "
                    "title = COALESCE(EXCLUDED.title, content_publications.title)"
                ),
                {
                    "d": day,
                    "s": slot,
                    "at": now.strftime("%H:%M"),
                    "ig": bool(ig_ok),
                    "mid": str(media_id) if media_id else None,
                    "fp": archived,
                    "cap": caption,
                    "ttl": title,
                },
            )

        await _prune_old_records()
        logger.info(f"📌 Публикация записана: {day}/{slot} (media_id: {media_id})")
    except Exception as e:
        logger.warning(f"mark_published error: {e}")
