import json
import os
import redis.asyncio as redis
from typing import List, Dict

# Assuming redis is on host mg_redis based on typical docker-compose setup
REDIS_URL = os.getenv("REDIS_URL", "redis://mg_redis:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

class DebateManager:
    @staticmethod
    async def get_history(chat_id: int) -> List[Dict[str, str]]:
        key = f"debate:history:{chat_id}"
        items = await redis_client.lrange(key, 0, -1)
        return [json.loads(item) for item in items]

    @staticmethod
    async def add_message(chat_id: int, sender: str, message: str):
        key = f"debate:history:{chat_id}"
        data = json.dumps({"sender": sender, "message": message})
        await redis_client.rpush(key, data)
        await redis_client.expire(key, 3600)  # Expire after 1 hour

    @staticmethod
    async def clear_history(chat_id: int):
        key = f"debate:history:{chat_id}"
        await redis_client.delete(key)
        
    @staticmethod
    async def get_active_debate(chat_id: int) -> dict:
        key = f"debate:active:{chat_id}"
        data = await redis_client.get(key)
        if data:
            return json.loads(data)
        return None

    @staticmethod
    async def set_active_debate(chat_id: int, topic: str, participants: list):
        key = f"debate:active:{chat_id}"
        data = json.dumps({
            "topic": topic,
            "participants": participants,
            "turn_index": 0
        })
        await redis_client.set(key, data, ex=3600)
        await DebateManager.clear_history(chat_id)

    @staticmethod
    async def end_debate(chat_id: int):
        key = f"debate:active:{chat_id}"
        await redis_client.delete(key)
        await DebateManager.clear_history(chat_id)
        
debate_manager = DebateManager()
