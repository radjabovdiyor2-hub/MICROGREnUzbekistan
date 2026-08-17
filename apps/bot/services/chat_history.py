"""
💬 CHAT HISTORY — память разговора клиента, переживающая деплой.

История AI-разговора жила в словаре процесса (`ai_seller.conversation_history`),
и каждый деплой — то есть каждый push в main — обнулял её всем сразу. Клиент,
который на третьем сообщении описывал своё блюдо, после рестарта получал
собеседника, впервые о нём слышащего. Ровно та же ошибка уже стоила корзин:
`cart_storage` перевели в Redis именно поэтому (см. комментарий к REDIS_URL в
docker-compose.prod.yml).

Хранилище то же, что у корзин, — Redis по `REDIS_URL`, с тем же поведением при
его недоступности: работаем без памяти, но не падаем. Ответ клиенту важнее
контекста, а вот молча притворяться, что контекст есть, нельзя.

Своя реализация, а не импорт из `apps/tgas/shared/chat_memory.py`: прямые
импорты между модулями запрещены конституцией, у витрины свой процесс и свой
Redis-клиент. Общее здесь — правило, а не код.
"""

import json
import logging
import os
from typing import Dict, List

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "")
REDIS_PREFIX = "mcg:chat:"

#: Сколько реплик держим. Десять — это пять обменов: достаточно, чтобы помнить
#: блюдо и вкус, о которых говорили, и мало, чтобы не платить за пересылку
#: всего разговора в каждом запросе.
MAX_MESSAGES = 20
CONTEXT_MESSAGES = 10

#: Сутки. Разговор, к которому не возвращались день, продолжением не считается.
REDIS_TTL = 86400


class _Memory:
    """Redis, если он есть; иначе — словарь процесса, как было раньше."""

    def __init__(self, redis_url: str):
        self.client = None
        self._local: Dict[int, List[dict]] = {}
        if not redis_url:
            logger.warning("REDIS_URL не задан — история AI-чата не переживёт рестарт")
            return
        try:
            import redis

            self.client = redis.from_url(redis_url, decode_responses=True)
            self.client.ping()
            logger.info("✅ История AI-чата в Redis")
        except Exception as e:
            self.client = None
            logger.warning(f"Redis недоступен, история AI-чата только в памяти: {e}")

    def _key(self, user_id: int) -> str:
        return f"{REDIS_PREFIX}{user_id}"

    def get(self, user_id: int, limit: int = CONTEXT_MESSAGES) -> List[dict]:
        if self.client is None:
            return self._local.get(user_id, [])[-limit:]
        try:
            raw = self.client.lrange(self._key(user_id), -limit, -1)
        except Exception as e:
            logger.warning(f"История AI-чата недоступна: {e}")
            return []
        out: List[dict] = []
        for item in raw:
            try:
                entry = json.loads(item)
            except (json.JSONDecodeError, TypeError):
                continue
            if entry.get("content"):
                out.append(entry)
        return out

    def add(self, user_id: int, role: str, content: str) -> None:
        entry = {"role": role, "content": str(content or "")[:4000]}
        if not entry["content"]:
            return
        if self.client is None:
            self._local.setdefault(user_id, []).append(entry)
            self._local[user_id] = self._local[user_id][-MAX_MESSAGES:]
            return
        try:
            key = self._key(user_id)
            pipe = self.client.pipeline()
            pipe.rpush(key, json.dumps(entry, ensure_ascii=False))
            pipe.ltrim(key, -MAX_MESSAGES, -1)
            pipe.expire(key, REDIS_TTL)
            pipe.execute()
        except Exception as e:
            logger.warning(f"Не смог записать историю AI-чата: {e}")

    def clear(self, user_id: int) -> None:
        self._local.pop(user_id, None)
        if self.client is None:
            return
        try:
            self.client.delete(self._key(user_id))
        except Exception as e:
            logger.warning(f"Не смог очистить историю AI-чата: {e}")


_memory = _Memory(REDIS_URL)


def get_history(user_id: int, limit: int = CONTEXT_MESSAGES) -> List[dict]:
    """Последние реплики разговора: [{role, content}, ...]."""
    return _memory.get(user_id, limit)


def add_to_history(user_id: int, role: str, content: str) -> None:
    """Дописать реплику и обрезать хвост."""
    _memory.add(user_id, role, content)


def clear_history(user_id: int) -> None:
    """Забыть разговор — «очистить историю» должно что-то менять и после рестарта."""
    _memory.clear(user_id)
