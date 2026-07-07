"""
🔗 BOT BUS — Межботовая шина задач
====================================
Позволяет ботам отправлять задачи друг другу
и получать результаты выполнения.

Использует файловую очередь (JSON) для надёжности.
"""

import json
import uuid
import asyncio
import logging
import os
from datetime import datetime
from typing import Optional, Dict, Any, List, Callable, Awaitable
from pathlib import Path

logger = logging.getLogger(__name__)

# Директория для очереди задач
TASKS_DIR = Path(__file__).resolve().parent.parent / "bus_tasks"
TASKS_DIR.mkdir(exist_ok=True)


def _task_path(task_id: str) -> Path:
    return TASKS_DIR / f"{task_id}.json"


async def send_task(
    from_bot: str,
    to_bot: str,
    action: str,
    params: Dict[str, Any] = None,
) -> str:
    """
    Отправить задачу другому боту.
    Возвращает task_id для отслеживания.
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
    }
    
    path = _task_path(task_id)
    path.write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"[BUS] Задача {task_id} отправлена: {from_bot} → {to_bot} | {action}")
    return task_id


async def get_pending_tasks(bot_name: str) -> List[Dict]:
    """Получить все ожидающие задачи для указанного бота."""
    pending = []
    try:
        for f in TASKS_DIR.glob("*.json"):
            try:
                task = json.loads(f.read_text(encoding="utf-8"))
                if task.get("to_bot") == bot_name and task.get("status") == "pending":
                    pending.append(task)
            except (json.JSONDecodeError, OSError):
                continue
    except Exception as e:
        logger.error(f"[BUS] Ошибка чтения задач: {e}")
    return pending


async def claim_task(task_id: str) -> bool:
    """Пометить задачу как 'в работе' (processing)."""
    path = _task_path(task_id)
    if not path.exists():
        return False
    try:
        task = json.loads(path.read_text(encoding="utf-8"))
        if task["status"] != "pending":
            return False
        task["status"] = "processing"
        path.write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8")
        return True
    except Exception:
        return False


async def complete_task(task_id: str, result: Any = None, error: str = None):
    """Пометить задачу как выполненную или ошибочную."""
    path = _task_path(task_id)
    if not path.exists():
        return
    try:
        task = json.loads(path.read_text(encoding="utf-8"))
        task["status"] = "error" if error else "done"
        task["result"] = result
        task["error"] = error
        task["completed_at"] = datetime.now().isoformat()
        path.write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(f"[BUS] Задача {task_id} завершена: {'ERROR' if error else 'OK'}")
    except Exception as e:
        logger.error(f"[BUS] Ошибка завершения задачи: {e}")


async def get_result(task_id: str, timeout: int = 120) -> Optional[Dict]:
    """
    Ожидать результат задачи с таймаутом.
    Возвращает dict с результатом или None при таймауте.
    """
    path = _task_path(task_id)
    for _ in range(timeout // 2):
        if path.exists():
            try:
                task = json.loads(path.read_text(encoding="utf-8"))
                if task["status"] in ("done", "error"):
                    # Удаляем файл после получения результата
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
):
    """
    Фоновый слушатель задач для бота.
    
    handlers — словарь {action: async handler_func(params) -> result}
    """
    logger.info(f"[BUS] Слушатель запущен для {bot_name}")
    
    while True:
        try:
            tasks = await get_pending_tasks(bot_name)
            for task in tasks:
                task_id = task["task_id"]
                action = task["action"]
                params = task.get("params", {})
                
                if action not in handlers:
                    await complete_task(task_id, error=f"Неизвестное действие: {action}")
                    continue
                
                claimed = await claim_task(task_id)
                if not claimed:
                    continue
                
                logger.info(f"[BUS] {bot_name} выполняет: {action} (task: {task_id})")
                
                try:
                    result = await handlers[action](params)
                    await complete_task(task_id, result=result)
                except Exception as e:
                    logger.error(f"[BUS] Ошибка выполнения {action}: {e}", exc_info=True)
                    await complete_task(task_id, error=str(e))
                    
        except Exception as e:
            logger.error(f"[BUS] Ошибка слушателя: {e}")
        
        await asyncio.sleep(poll_interval)


# ── Очистка старых задач (>24 часов) ──────────────────────────────────────

async def cleanup_old_tasks(max_age_hours: int = 24):
    """Удаляет файлы задач старше max_age_hours."""
    import time
    now = time.time()
    count = 0
    for f in TASKS_DIR.glob("*.json"):
        try:
            if now - f.stat().st_mtime > max_age_hours * 3600:
                f.unlink()
                count += 1
        except OSError:
            pass
    if count:
        logger.info(f"[BUS] Очищено {count} старых задач")
