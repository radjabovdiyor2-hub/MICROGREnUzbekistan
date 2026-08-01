import logging
from pathlib import Path

logger = logging.getLogger(__name__)

TASKS_DIR = Path(__file__).resolve().parent.parent.parent / "bus_tasks"
PENDING_DIR = TASKS_DIR / "pending"
PROCESSING_DIR = TASKS_DIR / "processing"
TMP_DIR = TASKS_DIR / "tmp"
FAILED_DIR = TASKS_DIR / "failed"
COMPLETED_DIR = TASKS_DIR / "completed"

for d in (TASKS_DIR, PENDING_DIR, PROCESSING_DIR, TMP_DIR, FAILED_DIR, COMPLETED_DIR):
    d.mkdir(parents=True, exist_ok=True)


def _pending_path(task_id: str) -> Path:
    return PENDING_DIR / f"{task_id}.json"


def _processing_path(task_id: str) -> Path:
    return PROCESSING_DIR / f"{task_id}.json"


def _failed_path(task_id: str) -> Path:
    return FAILED_DIR / f"{task_id}.json"


def _completed_path(task_id: str) -> Path:
    return COMPLETED_DIR / f"{task_id}.json"


async def cleanup_old_tasks(max_age_hours: int = 24) -> None:
    import time

    now = time.time()
    count = 0
    for d in (PENDING_DIR, PROCESSING_DIR, FAILED_DIR, COMPLETED_DIR, TMP_DIR):
        for f in d.glob("*.json"):
            try:
                if now - f.stat().st_mtime > max_age_hours * 3600:
                    f.unlink()
                    count += 1
            except OSError:
                pass
    if count:
        logger.info(f"[BUS] Очищено {count} старых задач")
