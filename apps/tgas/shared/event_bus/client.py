import asyncio
import logging
import json
import typing
from datetime import datetime
from typing import Callable, Dict, List, Optional
import aiohttp
from aiohttp import web

from shared.event_bus.fallback import run_direct_broadcast

logger = logging.getLogger(__name__)

class EventBus:
    def __init__(self) -> None:
        self._handlers: Dict[str, List[Callable]] = {}
        self._runner: Optional[web.AppRunner] = None
        self._background_tasks = set()
        self._session: Optional[aiohttp.ClientSession] = None
        self._redis_client = None
        self._pubsub_task = None
        self._n8n_url = "http://host.docker.internal:5678/webhook/internal-bus"

    async def connect(self) -> None:
        if not self._session or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5))
        if not self._redis_client:
            import redis.asyncio as redis
            from shared.config import settings
            self._redis_client = redis.from_url(settings.redis_url, decode_responses=True)

    async def publish(self, event_type: str, data: dict, source_bot: str = "unknown") -> None:
        message = {
            "event": event_type,
            "data": data,
            "source": source_bot,
            "timestamp": datetime.now().isoformat(),
        }

        session = self._session or aiohttp.ClientSession()
        try:
            async with session.post(self._n8n_url, json=message, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status in (200, 201):
                    logger.info(f"EventBus (n8n): [{source_bot}] → {event_type}")
                else:
                    logger.warning(f"EventBus (n8n): Failed to publish {event_type}, HTTP {resp.status}")
        except Exception as e:
            logger.error(f"EventBus (n8n): Ошибка публикации: {e}")

        published_to_redis = False
        try:
            if not self._redis_client:
                await self.connect()
            if self._redis_client:
                payload_str = json.dumps(message)
                await self._redis_client.publish("microgreen_events", payload_str)
                logger.info(f"EventBus (Redis): [{source_bot}] → {event_type}")
                published_to_redis = True
        except Exception as e:
            logger.error(f"EventBus (Redis) publish error: {e}")

        if not published_to_redis:
            logger.warning("EventBus: Redis Pub/Sub недоступен, используем резервную прямую доставку по HTTP.")
            run_direct_broadcast(message, source_bot, event_type, session, self._background_tasks)

    def on(self, event_type: str, handler: Callable) -> None:
        key = (event_type or "").upper()
        if key not in self._handlers:
            self._handlers[key] = []
        self._handlers[key].append(handler)
        logger.info(f"EventBus: подписка на {event_type}")

    async def _handle_webhook(self, request: web.Request) -> dict:
        try:
            from shared.config import settings
            secret = getattr(settings, "event_bus_secret", None)
            if secret and request.headers.get("X-Bot-Secret") != secret:
                logger.warning("EventBus: отклонено событие без валидного X-Bot-Secret")
                return web.json_response({"error": "unauthorized"}, status=401)
            payload = await request.json()
            event_type = payload.get("event")
            if not event_type:
                return web.json_response({"error": "Missing event type"}, status=400)

            handlers = self._handlers.get((event_type or "").upper(), [])
            for handler in handlers:
                asyncio.create_task(self._run_handler(handler, payload))
            return web.json_response({"status": "received", "event": event_type})
        except Exception as e:
            logger.error(f"EventBus webhook error: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def _run_handler(self: typing.dict, handler: typing.dict, payload: dict) -> None:
        try:
            await handler(payload)
        except Exception as e:
            logger.error(f"EventBus: ошибка обработчика: {e}")

    async def _listen_redis_pubsub(self) -> None:
        pubsub = self._redis_client.pubsub()
        await pubsub.subscribe("microgreen_events")
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        payload = json.loads(message["data"])
                        event_type = payload.get("event")
                        if event_type:
                            handlers = self._handlers.get((event_type or "").upper(), [])
                            for handler in handlers:
                                asyncio.create_task(self._run_handler(handler, payload))
                    except Exception as e:
                        logger.error(f"EventBus: ошибка обработки сообщения из Redis: {e}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"EventBus: ошибка в цикле прослушивания Redis Pub/Sub: {e}")
            await asyncio.sleep(5)
            self._pubsub_task = asyncio.create_task(self._listen_redis_pubsub())
        finally:
            await pubsub.unsubscribe("microgreen_events")

    async def start_listening(self, port: int = 0, app: Optional[web.Application] = None) -> None:
        if port != 0:
            if app is None:
                app = web.Application()

            has_event_route = any(
                route.resource and route.resource.canonical == "/event"
                for route in app.router.routes()
            )
            if not has_event_route:
                app.router.add_post("/event", self._handle_webhook)

            self._runner = web.AppRunner(app)
            await self._runner.setup()
            site = web.TCPSite(self._runner, "0.0.0.0", port)
            await site.start()
            logger.info(f"EventBus: HTTP-слушатель запущен на порту {port}")

        try:
            if not self._redis_client:
                await self.connect()
            if self._redis_client:
                self._pubsub_task = asyncio.create_task(self._listen_redis_pubsub())
                logger.info("EventBus: Redis Pub/Sub слушатель запущен")
        except Exception as e:
            logger.error(f"EventBus: ошибка запуска Redis Pub/Sub слушателя: {e}")

    async def stop(self) -> None:
        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
        if self._runner:
            await self._runner.cleanup()
        if self._session and not self._session.closed:
            await self._session.close()
        if self._redis_client:
            await self._redis_client.close()

event_bus = EventBus()
