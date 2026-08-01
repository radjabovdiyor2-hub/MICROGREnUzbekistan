import json
import os
import uuid
import logging
from datetime import datetime
from typing import Dict

from shared.bot_bus.core import TMP_DIR, _pending_path

logger = logging.getLogger(__name__)


async def send_task(
    from_bot: str,
    to_bot: str,
    action: str,
    params: Dict[str] = None,
) -> str:
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
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(task, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, pending_path)
        logger.info(f"[BUS] Задача {task_id} отправлена: {from_bot} → {to_bot} | {action}")
        return task_id
    except Exception as e:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        logger.error(f"[BUS] Ошибка записи задачи {task_id}: {e}")
        raise
