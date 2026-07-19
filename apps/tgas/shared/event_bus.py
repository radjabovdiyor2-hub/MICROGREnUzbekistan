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
    """HTTP Webhook event bus (n8n integration)"""

    def __init__(self):
        self._handlers: Dict[str, List[Callable]] = {}
        self._runner: Optional[web.AppRunner] = None
        self._background_tasks = set()
        self._session: Optional[aiohttp.ClientSession] = None
        # n8n global webhook URL for internal routing
        self._n8n_url = "http://host.docker.internal:5678/webhook/internal-bus"

    async def connect(self):
        """Инициализировать общую HTTP-сессию."""
        if not self._session or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=5)
            )

    async def publish(self, event_type: str, data: dict, source_bot: str = "unknown"):
        """Отправить событие в n8n и напрямую другим ботам в сети Docker."""
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

        # 2. Прямая доставка ботам в Docker сети (для надежности при 404 от n8n)
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

    async def start_listening(self, port: int = 0, app: Optional[web.Application] = None):
        """Начать слушать события от n8n через aiohttp."""
        if port == 0:
            logger.warning("EventBus: port 0 provided, running without dedicated webhook server (relying on main app server if any)")
            return
            
        if app is None:
            app = web.Application()
            
        # Убедимся, что маршрут еще не добавлен
        has_event_route = any(route.resource and route.resource.canonical == '/event' for route in app.router.routes())
        if not has_event_route:
            app.router.add_post('/event', self._handle_webhook)
            
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, '0.0.0.0', port)
        await site.start()
        logger.info(f"EventBus: слушатель (n8n) запущен на порту {port}")

    async def stop(self):
        """Остановить слушатель и закрыть HTTP-сессию."""
        if self._runner:
            await self._runner.cleanup()
        if self._session and not self._session.closed:
            await self._session.close()

# Глобальный экземпляр
event_bus = EventBus()

