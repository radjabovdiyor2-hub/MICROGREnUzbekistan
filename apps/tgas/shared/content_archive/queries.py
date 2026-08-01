from typing import Optional
from datetime import datetime
from shared.database import get_session_ctx
from shared.content_archive.core import SLOTS, BUS_DIR, tz_now, expected_slots, plan_time, RETENTION_DAYS
from shared.content_archive.db import _load_day

def _enrich(slot: str, rec: dict, day: str) -> dict:
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
    day = day or tz_now().strftime("%Y-%m-%d")
    async with get_session_ctx() as session:
        entries = await _load_day(session, day)
    return [_enrich(slot, entries[slot], day) for slot in SLOTS if slot in entries]

def get_publications(day: Optional[str] = None) -> list:
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, get_publications_async(day)).result(timeout=10)
    else:
        return asyncio.run(get_publications_async(day))

async def get_last_publications_async(limit: int = 3) -> list:
    out = []
    from sqlalchemy import text
    async with get_session_ctx() as session:
        res = await session.execute(
            text("SELECT DISTINCT date FROM content_publications ORDER BY date DESC LIMIT :n"),
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
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, get_last_publications_async(limit)).result(timeout=10)
    else:
        return asyncio.run(get_last_publications_async(limit))

async def status_message_async(now: Optional[datetime] = None) -> str:
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
            lines.append(f"⏳ {name}: ещё не опубликован — по плану в {plan_time(slot, now)}")

    return (
        f"🗓 <b>Статус публикаций на сегодня ({now.strftime('%d.%m')})</b>\n"
        + "\n".join(lines)
    )

def status_message(now: Optional[datetime] = None) -> str:
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, status_message_async(now)).result(timeout=10)
    else:
        return asyncio.run(status_message_async(now))
