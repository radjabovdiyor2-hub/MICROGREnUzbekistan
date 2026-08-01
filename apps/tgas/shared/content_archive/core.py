from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

BUS_DIR = Path(__file__).resolve().parent.parent.parent / "bus_tasks"
MEDIA_DIR = BUS_DIR / "content_media"

RETENTION_DAYS = 7

SLOTS = {
    "morning": {"name": "Утренний сторис", "kind": "story"},
    "recipe": {"name": "Рецепт дня", "kind": "story"},
    "grid": {"name": "Пост недели в ленту", "kind": "feed"},
}

TZ = timezone(timedelta(hours=5))

def tz_now() -> datetime:
    return datetime.now(TZ)

def plan_time(slot: str, now: Optional[datetime] = None) -> str:
    now = now or tz_now()
    if slot == "morning":
        return "07:15" if 4 <= now.month <= 9 else "08:15"
    if slot == "recipe":
        return "18:00"
    if slot == "grid":
        return "12:00"
    return "—"

def expected_slots(now: Optional[datetime] = None) -> list:
    now = now or tz_now()
    slots = ["morning", "recipe"]
    if now.weekday() == 5:
        slots.append("grid")
    return slots
