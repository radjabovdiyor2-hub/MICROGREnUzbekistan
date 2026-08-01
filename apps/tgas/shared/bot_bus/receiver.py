import json
import os
import uuid
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Callable, Awaitable, Optional

from shared.bot_bus.core import (
    PROCESSING_DIR,
    PENDING_DIR,
    TMP_DIR,
    _pending_path,
    _processing_path,
    _failed_path,
    _completed_path,
)

logger = logging.getLogger(__name__)


async def get_pending_tasks(bot_name: str) -> List[Dict]:
    import time
    now = time.time()

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
    pending_path = _pending_path(task_id)
    processing_path = _processing_path(task_id)

    try:
        os.replace(pending_path, processing_path)
        os.utime(processing_path, None)
        return True
    except FileNotFoundError:
        return False
    except OSError as e:
        logger.error(f"[BUS] Ошибка ФС при claim_task {task_id}: {e}")
        return False


async def complete_task(task_id: str, result: dict = None, error: str = None) -> None:
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


async def get_result(task_id: str, timeout: int = 120) -> Optional[Dict]:
    paths_to_check = [_completed_path(task_id), _failed_path(task_id)]

    for _ in range(timeout // 2):
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
        await asyncio.sleep(2)

    logger.warning(f"[BUS] Таймаут ожидания задачи {task_id}")
    return None


async def start_listener(
    bot_name: str,
    handlers: Dict[str, Callable[..., Awaitable]],
    poll_interval: int = 3,
) -> None:
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
                    await complete_task(task_id, error=f"Неизвестное действие: {action}")
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
