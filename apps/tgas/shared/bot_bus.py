"""
🔗 BOT BUS — Межботовая шина задач
====================================
Позволяет ботам отправлять задачи друг другу
и получать результаты выполнения.

Использует файловую очередь (JSON) для надёжности.
Атомарная публикация и claim.
"""

import os
import json
import uuid
import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List, Callable, Awaitable
from pathlib import Path

logger = logging.getLogger(__name__)

# Директории для очереди задач
TASKS_DIR = Path(__file__).resolve().parent.parent / "bus_tasks"
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


async def send_task(
    from_bot: str,
    to_bot: str,
    action: str,
    params: Dict[str, Any] = None,
) -> str:
    """
    Отправить задачу другому боту атомарно.
    """
    task_id = str(uuid.uuid4())[:8]
    task = {
        "task_id": task_id,
        "from_bot": from_bot,
        "to_bot": to_bot,
        "action": action,
        "params": params or {},
        "status": "pending",
        "result": None,
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
        "attempts": 0,
    }

    tmp_path = TMP_DIR / f"{task_id}_{uuid.uuid4().hex[:6]}.json"
    pending_path = _pending_path(task_id)

    try:
        # Atomic write
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(task, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        # Atomic publish
        os.replace(tmp_path, pending_path)
        logger.info(
            f"[BUS] Задача {task_id} отправлена: {from_bot} → {to_bot} | {action}"
        )
        return task_id
    except Exception as e:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        logger.error(f"[BUS] Ошибка записи задачи {task_id}: {e}")
        raise


async def get_pending_tasks(bot_name: str) -> List[Dict]:
    """Получить все ожидающие задачи для указанного бота."""
    import time

    now = time.time()

    # 1. Восстановление зависших задач (stale processing)
    try:
        for f in PROCESSING_DIR.glob("*.json"):
            try:
                if now - f.stat().st_mtime > 3600:
                    task = json.loads(f.read_text(encoding="utf-8"))
                    if task.get("to_bot") == bot_name:
                        os.replace(f, _pending_path(task["task_id"]))
                        logger.warning(
                            f"[BUS] Восстановлена зависшая задача {task['task_id']}"
                        )
            except OSError:
                pass
    except Exception as e:
        logger.error(f"[BUS] Ошибка восстановления задач: {e}")

    # 2. Получение текущих задач
    pending = []
    try:
        for f in PENDING_DIR.glob("*.json"):
            try:
                task = json.loads(f.read_text(encoding="utf-8"))
                if task.get("to_bot") == bot_name:
                    pending.append(task)
            except (json.JSONDecodeError, OSError):
                continue
    except Exception as e:
        logger.error(f"[BUS] Ошибка чтения задач: {e}")
    return pending


async def claim_task(task_id: str) -> bool:
    """Пометить задачу как 'в работе' (атомарный claim)."""
    pending_path = _pending_path(task_id)
    processing_path = _processing_path(task_id)

    try:
        # Atomic rename: only one consumer will succeed
        os.replace(pending_path, processing_path)
        # rename сохраняет mtime, из-за чего задача старше 1 часа в pending мгновенно считалась
        # "зависшей" в processing и воскрешалась в pending повторно (пинг-понг + дублированное выполнение).
        os.utime(processing_path, None)
        return True
    except FileNotFoundError:
        # Проигранный claim или задачи нет
        return False
    except OSError as e:
        logger.error(f"[BUS] Ошибка ФС при claim_task {task_id}: {e}")
        return False


async def complete_task(task_id: str, result: Any = None, error: str = None):
    """Пометить задачу как выполненную или вернуть в очередь при ошибке."""
    processing_path = _processing_path(task_id)
    if not processing_path.exists():
        return

    try:
        task = json.loads(processing_path.read_text(encoding="utf-8"))
        task["completed_at"] = datetime.now().isoformat()

        if error:
            attempts = task.get("attempts", 0) + 1
            task["attempts"] = attempts
            task["error"] = error

            tmp_path = TMP_DIR / f"{task_id}_retry_{uuid.uuid4().hex[:6]}.json"

            if attempts < 3:
                task["status"] = "pending"
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(task, f, ensure_ascii=False, indent=2)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp_path, _pending_path(task_id))
                logger.info(
                    f"[BUS] Задача {task_id} возвращена в pending (попытка {attempts}/3)"
                )
            else:
                task["status"] = "error"
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(task, f, ensure_ascii=False, indent=2)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp_path, _failed_path(task_id))
                logger.error(
                    f"[BUS] Задача {task_id} перемещена в failed (превышен лимит)"
                )

            try:
                processing_path.unlink()
            except OSError:
                pass
        else:
            task["status"] = "done"
            task["result"] = result
            task["error"] = None

            tmp_path = TMP_DIR / f"{task_id}_done_{uuid.uuid4().hex[:6]}.json"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(task, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())

            os.replace(tmp_path, _completed_path(task_id))
            try:
                processing_path.unlink()
            except OSError:
                pass
            logger.info(f"[BUS] Задача {task_id} завершена: OK")

    except Exception as e:
        logger.error(f"[BUS] Ошибка завершения задачи: {e}")


# Как часто заглядывать за результатом.
#
# Было 2 секунды, и вместе с 3-секундным шагом слушателя (POLL_INTERVAL ниже)
# это давало 3–5 секунд ЧИСТОГО ожидания на каждое нажатие в «Пульте ИИ» —
# даже когда бот выполнял действие мгновенно. Владелец жал кнопку и смотрел на
# крутилку, пока две петли сходились по фазе.
#
# Очередь файловая и лежит на локальном томе: одна проверка существования
# файла стоит меньше микросекунды, и учащение опроса ничего не нагружает.
RESULT_POLL_SEC = 0.25


async def get_result(task_id: str, timeout: int = 120) -> Optional[Dict]:
    """
    Ожидать результат задачи с таймаутом.
    Возвращает dict с результатом или None при таймауте.
    """
    paths_to_check = [_completed_path(task_id), _failed_path(task_id)]

    for _ in range(int(timeout / RESULT_POLL_SEC)):
        for path in paths_to_check:
            if path.exists():
                try:
                    task = json.loads(path.read_text(encoding="utf-8"))
                    if task["status"] in ("done", "error"):
                        try:
                            path.unlink()
                        except OSError:
                            pass
                        return task
                except (json.JSONDecodeError, OSError):
                    pass
        await asyncio.sleep(RESULT_POLL_SEC)

    logger.warning(f"[BUS] Таймаут ожидания задачи {task_id}")
    return None


# Шаг слушателя — вторая половина той же задержки, см. RESULT_POLL_SEC.
# Полсекунды: чтение каталога `bus_tasks/pending` на тринадцати ботах — это
# тринадцать listdir по локальному тому, а не сетевые запросы.
POLL_INTERVAL_SEC = 0.5


async def start_listener(
    bot_name: str,
    handlers: Dict[str, Callable[..., Awaitable]],
    poll_interval: float = POLL_INTERVAL_SEC,
):
    """Фоновый слушатель задач для бота."""
    logger.info(f"[BUS] Слушатель запущен для {bot_name}")

    while True:
        try:
            tasks = await get_pending_tasks(bot_name)
            for task in tasks:
                task_id = task["task_id"]
                action = task["action"]
                params = task.get("params", {})

                claimed = await claim_task(task_id)
                if not claimed:
                    continue

                if action not in handlers:
                    # claim уже сделан — complete_task найдёт файл в processing
                    # и через 3 попытки переместит его в failed (иначе задача
                    # навсегда зависла бы в pending и перечитывалась каждый цикл)
                    await complete_task(
                        task_id, error=f"Неизвестное действие: {action}"
                    )
                    continue

                logger.info(f"[BUS] {bot_name} выполняет: {action} (task: {task_id})")

                try:
                    result = await handlers[action](params)
                    await complete_task(task_id, result=result)
                except Exception as e:
                    logger.error(
                        f"[BUS] Ошибка выполнения {action}: {e}", exc_info=True
                    )
                    await complete_task(task_id, error=str(e))

        except Exception as e:
            logger.error(f"[BUS] Ошибка слушателя: {e}")

        await asyncio.sleep(poll_interval)


# ── Очистка старых задач (>24 часов) ──────────────────────────────────────


async def cleanup_old_tasks(max_age_hours: int = 24):
    """Удаляет старые задачи из всех папок."""
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
