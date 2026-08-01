"""
Миграция content_status.json → таблица content_publications.

Запустить ОДИН РАЗ после prisma db push:
  cd apps/tgas && python scripts/migrate_content_status.py
"""

import json
import asyncio
import logging
import sys
from pathlib import Path

# Путь к проекту
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared.database import get_session_ctx
from sqlalchemy import text

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

STATE_FILE = (
    Path(__file__).resolve().parent.parent / "bus_tasks" / "content_status.json"
)


async def migrate() -> None:
    if not STATE_FILE.exists():
        logger.info("content_status.json не найден — мигрировать нечего")
        return

    state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    count = 0

    async with get_session_ctx() as session:
        for day, slots in state.items():
            if not isinstance(slots, dict):
                continue
            for slot, rec in slots.items():
                if not isinstance(rec, dict):
                    continue
                await session.execute(
                    text(
                        "INSERT INTO content_publications "
                        "(date, slot, published_at, ig_posted, media_id, file_path, caption, title, "
                        "reach, likes, comments) "
                        "VALUES (:d, :s, :at, :ig, :mid, :fp, :cap, :ttl, :reach, :likes, :comments) "
                        "ON CONFLICT (date, slot) DO NOTHING"
                    ),
                    {
                        "d": day,
                        "s": slot,
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
                count += 1

    logger.info(
        f"✅ Перенесено {count} записей из content_status.json → content_publications"
    )
    # Переименовываем файл, чтобы не мигрировать повторно
    backup = STATE_FILE.with_suffix(".json.migrated")
    STATE_FILE.rename(backup)
    logger.info(f"📁 Файл переименован в {backup.name}")


if __name__ == "__main__":
    asyncio.run(migrate())
