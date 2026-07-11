"""
🗂 ЖУРНАЛ ПУБЛИКАЦИЙ — что и когда реально вышло
==================================================
Единый источник правды о контенте: не только «опубликовано в 07:16»,
но и САМА картинка + текст. Без этого Степан не может показать
руководителю реальный пост и вынужден отвечать отпиской.

Пишет content_bot (при каждой успешной публикации), читает Степан.
Живёт в общем docker-volume `bus_tasks/` — поэтому виден всем ботам:

  bus_tasks/content_status.json   — журнал: дата → слот → запись
  bus_tasks/content_media/        — архивные копии опубликованных картинок

Запись слота:
  {"at": "07:16", "ig": true,
   "file": "content_media/2026-07-12_morning.jpg",
   "caption": "...", "title": "..."}

⚠️ Старые записи (сделанные до появления архива) содержат только at/ig —
читатели ОБЯЗАНЫ это переживать: file/caption могут отсутствовать.
"""

import json
import logging
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Расположение (общий volume bus_tasks) ────────────────────────────────
BUS_DIR = Path(__file__).resolve().parent.parent / "bus_tasks"
STATE_FILE = BUS_DIR / "content_status.json"
MEDIA_DIR = BUS_DIR / "content_media"

# Сколько дней храним журнал и картинки
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


# ── Чтение / запись журнала ──────────────────────────────────────────────

def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
    )


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


def _prune(state: dict, now: datetime) -> dict:
    """Чистим журнал и медиа старше RETENTION_DAYS."""
    cutoff = (now - timedelta(days=RETENTION_DAYS)).strftime("%Y-%m-%d")
    state = {k: v for k, v in state.items() if k >= cutoff}
    try:
        if MEDIA_DIR.is_dir():
            for f in MEDIA_DIR.iterdir():
                # имя вида 2026-07-12_morning.jpg → дата = первые 10 символов
                if f.is_file() and f.name[:10] < cutoff:
                    f.unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"Не удалось почистить архив медиа: {e}")
    return state


def mark_published(
    slot: str,
    ig_ok: bool = True,
    image: Optional[str] = None,
    caption: Optional[str] = None,
    title: Optional[str] = None,
) -> None:
    """
    Отметить успешную публикацию слота (morning/recipe/grid) на сегодня
    И сохранить сам контент (картинку + текст), чтобы его можно было ПОКАЗАТЬ.
    """
    try:
        now = tz_now()
        day = now.strftime("%Y-%m-%d")
        state = load_state()

        record = {"at": now.strftime("%H:%M"), "ig": bool(ig_ok)}
        archived = _archive_image(image, day, slot)
        if archived:
            record["file"] = archived
        if caption:
            record["caption"] = caption
        if title:
            record["title"] = title

        state.setdefault(day, {})[slot] = record
        _save_state(_prune(state, now))
        logger.info(f"📌 Публикация записана в журнал: {day}/{slot} (медиа: {bool(archived)})")
    except Exception as e:
        logger.warning(f"mark_published error: {e}")


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
        # файл мог быть подчищен ретеншеном — отдаём только реально существующий
        if path.is_file():
            out["file"] = str(path)
    return out


def get_publications(day: Optional[str] = None) -> list:
    """
    Публикации за день (по умолчанию — сегодня), в порядке слотов.
    day: 'YYYY-MM-DD'.
    """
    day = day or tz_now().strftime("%Y-%m-%d")
    entries = load_state().get(day, {})
    return [
        _enrich(slot, entries[slot], day)
        for slot in SLOTS
        if slot in entries
    ]


def get_last_publications(limit: int = 3) -> list:
    """
    Последние публикации за любые дни (свежие первыми) — на случай, когда
    сегодня ещё ничего не выходило, а показать что-то надо.
    """
    state = load_state()
    out = []
    for day in sorted(state.keys(), reverse=True):
        entries = state[day]
        for slot in reversed(list(SLOTS)):
            if slot in entries:
                out.append(_enrich(slot, entries[slot], day))
                if len(out) >= limit:
                    return out
    return out


def status_message(now: Optional[datetime] = None) -> str:
    """Текстовый статус публикаций на сегодня (для Степана и контент-бота)."""
    now = now or tz_now()
    day = now.strftime("%Y-%m-%d")
    entries = load_state().get(day, {})

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
