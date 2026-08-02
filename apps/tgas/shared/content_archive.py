"""
🗂 ЖУРНАЛ ПУБЛИКАЦИЙ — что и когда реально вышло
==================================================
Единый источник правды о контенте: не только «опубликовано в 07:16»,
но и САМА картинка + текст. Без этого Степан не может показать
руководителю реальный пост и вынужден отвечать отпиской.

Пишет content_bot (при каждой успешной публикации), читает Степан.

Хранение: таблица content_publications (Prisma-управляемая).
Медиафайлы: bus_tasks/content_media/ (общий docker-volume).
"""

import logging
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import text

from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

# ── Медиа-архив (общий volume bus_tasks) ─────────────────────────────────
BUS_DIR = Path(__file__).resolve().parent.parent / "bus_tasks"
MEDIA_DIR = BUS_DIR / "content_media"

# Сколько дней храним медиа
RETENTION_DAYS = 7

# ── Слоты контента (порядок = порядок показа) ────────────────────────────
SLOTS = {
    "morning": {"name": "Утренний сторис", "kind": "story"},
    "recipe": {"name": "Рецепт дня", "kind": "story"},
    "grid": {"name": "Пост недели в ленту", "kind": "feed"},
}

TZ = timezone(timedelta(hours=5))  # Узбекистан


def tz_now() -> datetime:
    return datetime.now(TZ)


def plan_time(slot: str, now: Optional[datetime] = None) -> str:
    """Плановое время публикации слота (для «ещё не опубликован — по плану в …»)."""
    now = now or tz_now()
    if slot == "morning":
        return "07:15" if 4 <= now.month <= 9 else "08:15"
    if slot == "recipe":
        return "18:00"
    if slot == "grid":
        return "12:00"
    return "—"


def expected_slots(now: Optional[datetime] = None) -> list:
    """Какие слоты вообще ожидаются сегодня (пост в ленту — только в субботу)."""
    now = now or tz_now()
    slots = ["morning", "recipe"]
    if now.weekday() == 5:  # суббота
        slots.append("grid")
    return slots


# ── Чтение / запись через PostgreSQL ─────────────────────────────────────


async def _load_day(session, day: str) -> dict:
    """Загрузить все публикации за день из БД."""
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


def load_state() -> dict:
    """Синхронная обёртка для обратной совместимости — загружает из БД.

    ВНИМАНИЕ: вызывается из синхронного кода (instagram_analytics).
    Поскольку asyncio event loop может быть занят, используем отдельный блокирующий путь.
    """
    import asyncio

    async def _load():
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
        # Внутри уже работающего event loop — создаём задачу
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, _load()).result(timeout=10)
    else:
        return asyncio.run(_load())


def _save_state(state: dict) -> None:
    """Синхронная обёртка для обратной совместимости — сохраняет в БД."""
    import asyncio

    async def _save():
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


def _archive_image(image: str, day: str, slot: str) -> Optional[str]:
    """
    Копирует опубликованную картинку в архив и возвращает путь ОТНОСИТЕЛЬНО
    bus_tasks (чтобы он одинаково резолвился в контейнере любого бота).

    Копия обязательна: content_bot публикует из temp_story.jpg / temp_img.jpg,
    которые перезатираются следующей же публикацией.
    """
    if not image:
        return None
    src = Path(image)
    if not src.is_file():
        # image может быть внешним URL (не локальный файл) — архивировать нечего
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
    """Чистим записи и медиа старше RETENTION_DAYS."""
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
    """
    Отметить успешную публикацию слота (morning/recipe/grid) на сегодня.
    Сохраняет контент (картинку + текст + media_id) в PostgreSQL.
    """
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


async def get_format_performance_weights_async(formats: list[str]) -> dict[str, float]:
    """Возвращает веса форматов контента на основе их исторических показателей охвата/вовлечённости."""
    weights = {fmt: 1.0 for fmt in formats}
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT slot, title, reach FROM content_publications WHERE reach IS NOT NULL"
                ),
            )
            scores: dict[str, list[float]] = {fmt: [] for fmt in formats}
            for row in res.fetchall():
                slot_name, row_title, reach = (
                    row[0],
                    (row[1] or "").lower(),
                    row[2] or 0,
                )
                score = reach
                for fmt in formats:
                    if fmt in slot_name or fmt in row_title:
                        if score > 0:
                            scores[fmt].append(score)

            for fmt, values in scores.items():
                if values:
                    avg = sum(values) / len(values)
                    weights[fmt] = max(0.5, min(2.0, avg / 100.0))
    except Exception as e:
        logger.warning(f"get_format_performance_weights error: {e}")
    return weights


def get_format_performance_weights(formats: list[str]) -> dict[str, float]:
    """Синхронная обёртка для обратной совместимости."""
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(
                asyncio.run, get_format_performance_weights_async(formats)
            ).result(timeout=10)
    else:
        return asyncio.run(get_format_performance_weights_async(formats))


# ── Чтение для Степана ───────────────────────────────────────────────────


def _enrich(slot: str, rec: dict, day: str) -> dict:
    """Дополняет сырую запись именем слота и АБСОЛЮТНЫМ путём к картинке."""
    out = {
        "slot": slot,
        "name": SLOTS.get(slot, {}).get("name", slot),
        "day": day,
        "at": rec.get("at", ""),
        "ig": bool(rec.get("ig")),
        "caption": rec.get("caption", ""),
        "title": rec.get("title", ""),
        "file": None,
    }
    rel = rec.get("file")
    if rel:
        path = BUS_DIR / rel
        if path.is_file():
            out["file"] = str(path)
    return out


async def get_publications_async(day: Optional[str] = None) -> list:
    """Публикации за день (по умолчанию — сегодня), в порядке слотов."""
    day = day or tz_now().strftime("%Y-%m-%d")
    async with get_session_ctx() as session:
        entries = await _load_day(session, day)
    return [_enrich(slot, entries[slot], day) for slot in SLOTS if slot in entries]


def get_publications(day: Optional[str] = None) -> list:
    """Синхронная обёртка для обратной совместимости."""
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, get_publications_async(day)).result(
                timeout=10
            )
    else:
        return asyncio.run(get_publications_async(day))


async def get_last_publications_async(limit: int = 3) -> list:
    """Последние публикации за любые дни (свежие первыми)."""
    out = []
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
            for slot in reversed(list(SLOTS)):
                if slot in entries:
                    out.append(_enrich(slot, entries[slot], day))
                    if len(out) >= limit:
                        return out
    return out


def get_last_publications(limit: int = 3) -> list:
    """Синхронная обёртка для обратной совместимости."""
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, get_last_publications_async(limit)).result(
                timeout=10
            )
    else:
        return asyncio.run(get_last_publications_async(limit))


async def status_message_async(now: Optional[datetime] = None) -> str:
    """Текстовый статус публикаций на сегодня (для Степана и контент-бота)."""
    now = now or tz_now()
    day = now.strftime("%Y-%m-%d")
    async with get_session_ctx() as session:
        entries = await _load_day(session, day)

    lines = []
    for slot in expected_slots(now):
        rec = entries.get(slot)
        name = SLOTS[slot]["name"]
        if rec:
            where = "в Instagram" if rec.get("ig") else "только в Telegram"
            lines.append(f"✅ {name}: опубликован в {rec['at']} ({where})")
        else:
            lines.append(
                f"⏳ {name}: ещё не опубликован — по плану в {plan_time(slot, now)}"
            )

    return (
        f"🗓 <b>Статус публикаций на сегодня ({now.strftime('%d.%m')})</b>\n"
        + "\n".join(lines)
    )


def status_message(now: Optional[datetime] = None) -> str:
    """Синхронная обёртка для обратной совместимости."""
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, status_message_async(now)).result(
                timeout=10
            )
    else:
        return asyncio.run(status_message_async(now))
