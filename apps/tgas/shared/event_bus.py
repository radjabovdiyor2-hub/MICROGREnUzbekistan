"""
Shared Event Bus — Кросс-бот интеграция через Redis Pub/Sub.

Позволяет ботам обмениваться событиями в реальном времени.
Когда Sales бот создаёт заказ, PM бот автоматически получает уведомление.
"""
import asyncio
import logging
import aiohttp
from aiohttp import web
from datetime import datetime
from typing import Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# ─── Типы событий ───────────────────────────────────────────
class Events:
    ORDER_CREATED = "order_created"
    ORDER_STATUS_CHANGED = "order_status_changed"
    B2B_LEAD_CREATED = "b2b_lead_created"
    CUSTOMER_REGISTERED = "customer_registered"
    COMPLAINT_RECEIVED = "complaint_received"
    FEEDBACK_RECEIVED = "feedback_received"
    IG_DM_RECEIVED = "ig_dm_received"
    EXPENSE_RECORDED = "expense_recorded"
    INCOME_RECORDED = "income_recorded"
    LARGE_EXPENSE_ALERT = "large_expense_alert"
    APPLICATION_RECEIVED = "application_received"
    EMPLOYEE_ADDED = "employee_added"
    CAMPAIGN_LAUNCHED = "campaign_launched"
    PROMO_CREATED = "promo_created"
    TASK_CREATED = "task_created"
    TASK_COMPLETED = "task_completed"
    NEW_MESSAGE = "new_message"
    DELIVERY_STATUS_REPORT = "DELIVERY_STATUS_REPORT"
    MAGAZINE_PUBLISHED = "magazine_published"
    FRANCHISE_REPORT_GENERATED = "franchise_report_generated"
    
class BotBusActions:
    GENERATE_MAGAZINE_FACTS = "generate_magazine_facts"
    GET_TOP_PRODUCTS = "get_top_products"
    PICK_RESTAURANT = "pick_restaurant_of_week"
    SELL_MAGAZINE_ADS = "sell_magazine_ads"
    DRAFT_MAGAZINE = "draft_magazine"
    PUBLISH_MAGAZINE = "publish_magazine"

class EventBus:
    """Redis Pub/Sub event bus with HTTP webhook backup and n8n integration"""

    def __init__(self):
        self._handlers: Dict[str, List[Callable]] = {}
        self._runner: Optional[web.AppRunner] = None
        self._background_tasks = set()
        self._session: Optional[aiohttp.ClientSession] = None
        self._redis_client = None
        self._pubsub_task = None
        # n8n global webhook URL for internal routing
        self._n8n_url = "http://host.docker.internal:5678/webhook/internal-bus"

    async def connect(self):
        """Инициализировать общую HTTP-сессию и подключение к Redis."""
        if not self._session or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=5)
            )
        if not self._redis_client:
            import redis.asyncio as redis
            from shared.config import settings
            self._redis_client = redis.from_url(settings.redis_url, decode_responses=True)

    async def publish(self, event_type: str, data: dict, source_bot: str = "unknown"):
        """Отправить событие в n8n (HTTP) и опубликовать в Redis Pub/Sub для ботов."""
        message = {
            "event": event_type,
            "data": data,
            "source": source_bot,
            "timestamp": datetime.now().isoformat(),
        }
        
        # 1. Пытаемся отправить в n8n
        session = self._session or aiohttp.ClientSession()
        try:
            async with session.post(self._n8n_url, json=message, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status in (200, 201):
                    logger.info(f"EventBus (n8n): [{source_bot}] → {event_type}")
                else:
                    logger.warning(f"EventBus (n8n): Failed to publish {event_type}, HTTP {resp.status}")
        except Exception as e:
            logger.error(f"EventBus (n8n): Ошибка публикации: {e}")

        # 2. Публикуем в Redis Pub/Sub
        import json
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

        # 3. Резервный канал (HTTP Direct) — только если Redis Pub/Sub не сработал
        if not published_to_redis:
            logger.warning("EventBus: Redis Pub/Sub недоступен, используем резервную прямую доставку по HTTP.")
            bot_endpoints = [
                ("mg_stepan", 8081),
                ("mg_sales", 8082),
                ("mg_support", 8083),
                ("mg_hr", 8084),
                ("mg_finance", 8085),
                ("mg_marketing", 8086),
                ("mg_analytics", 8088),
                ("mg_content", 8089),
                ("mg_qa", 8090),
                ("mg_rnd", 8091),
                ("mg_devops", 8092),
                ("mg_franchise", 8093),
            ]
            
            async def send_direct(host, port):
                try:
                    url = f"http://{host}:{port}/event"
                    async with session.post(url, json=message, timeout=aiohttp.ClientTimeout(total=3)) as resp:
                        if resp.status == 200:
                            logger.info(f"Direct EventBus: [{source_bot}] → {host}:{port} ({event_type})")
                except Exception:
                    pass

            async def broadcast():
                try:
                    await asyncio.gather(*(send_direct(h, p) for h, p in bot_endpoints))
                except Exception as e:
                    logger.error(f"Error during event broadcast: {e}")

            task = asyncio.create_task(broadcast())
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)

    def on(self, event_type: str, handler: Callable):
        """Зарегистрировать обработчик события.

        Имена событий сравниваются БЕЗ учёта регистра: в проекте одни боты
        публикуют 'TASK_CREATED', другие — Events.TASK_CREATED ('task_created').
        Нормализуем ключ к верхнему регистру, чтобы доставка не рвалась.
        """
        key = (event_type or "").upper()
        if key not in self._handlers:
            self._handlers[key] = []
        self._handlers[key].append(handler)
        logger.info(f"EventBus: подписка на {event_type}")

    async def _handle_webhook(self, request: web.Request):
        try:
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
            
    async def _run_handler(self, handler, payload):
        try:
            await handler(payload)
        except Exception as e:
            logger.error(f"EventBus: ошибка обработчика: {e}")

    async def _listen_redis_pubsub(self):
        import json
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

    async def start_listening(self, port: int = 0, app: Optional[web.Application] = None):
        """Начать слушать события от n8n через aiohttp и от других ботов через Redis Pub/Sub."""
        if port != 0:
            if app is None:
                app = web.Application()
                
            has_event_route = any(route.resource and route.resource.canonical == '/event' for route in app.router.routes())
            if not has_event_route:
                app.router.add_post('/event', self._handle_webhook)
                
            self._runner = web.AppRunner(app)
            await self._runner.setup()
            site = web.TCPSite(self._runner, '0.0.0.0', port)
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

    async def stop(self):
        """Остановить слушатель и закрыть HTTP-сессию и Redis."""
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

# Глобальный экземпляр
event_bus = EventBus()

