"""
Shared Event Bus — Кросс-бот интеграция через Redis Pub/Sub.

Позволяет ботам обмениваться событиями в реальном времени.
Когда Sales бот создаёт заказ, PM бот автоматически получает уведомление.
"""
import json
import asyncio
import logging
import aiohttp
from aiohttp import web
from datetime import datetime
from typing import Callable, Dict, List, Optional
from shared.config import settings

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

class EventBus:
    """HTTP Webhook event bus (n8n integration)"""

    def __init__(self):
        self._handlers: Dict[str, List[Callable]] = {}
        self._runner: Optional[web.AppRunner] = None
        # n8n global webhook URL for internal routing
        self._n8n_url = "http://host.docker.internal:5678/webhook/internal-bus"

    async def connect(self):
        """Mock method for backward compatibility"""
        pass

    async def publish(self, event_type: str, data: dict, source_bot: str = "unknown"):
        """Отправить событие в n8n и напрямую другим ботам в сети Docker."""
        message = {
            "event": event_type,
            "data": data,
            "source": source_bot,
            "timestamp": datetime.now().isoformat(),
        }
        
        # 1. Пытаемся отправить в n8n
        try:
            async with aiohttp.ClientSession() as session:
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
            ("mg_pm", 8087),
            ("mg_analytics", 8088),
            ("mg_content", 8089),
        ]
        
        async def send_direct(host, port):
            try:
                url = f"http://{host}:{port}/event"
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=message, timeout=aiohttp.ClientTimeout(total=3)) as resp:
                        if resp.status == 200:
                            logger.info(f"Direct EventBus: [{source_bot}] → {host}:{port} ({event_type})")
            except Exception:
                pass

        async def broadcast():
            await asyncio.gather(*(send_direct(h, p) for h, p in bot_endpoints))

        asyncio.create_task(broadcast())

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

    async def start_listening(self, port: int = 0):
        """Начать слушать события от n8n через aiohttp."""
        if port == 0:
            logger.warning("EventBus: port 0 provided, running without dedicated webhook server (relying on main app server if any)")
            return
            
        app = web.Application()
        app.router.add_post('/event', self._handle_webhook)
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, '0.0.0.0', port)
        await site.start()
        logger.info(f"EventBus: слушатель (n8n) запущен на порту {port}")

    async def stop(self):
        """Остановить слушатель."""
        if self._runner:
            await self._runner.cleanup()

# Глобальный экземпляр
event_bus = EventBus()

