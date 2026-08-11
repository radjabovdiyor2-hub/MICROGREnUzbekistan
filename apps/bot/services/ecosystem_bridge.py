"""
🌱 MICROGREEN UZBEKISTAN — BOT ECOSYSTEM BRIDGE

Мост между Telegram Bot и Web API.
Управляет синхронизацией данных и событиями.
"""

import os
import httpx
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")
STEPAN_BOT_TOKEN = os.getenv("STEPAN_BOT_TOKEN", "")
STEPAN_ADMIN_ID = os.getenv("ADMIN_CHAT_ID", "")


class EcosystemBridge:
    """Мост между ботом и веб-платформой"""

    def __init__(self):
        self.api_url = WEB_API_URL
        self.client = httpx.AsyncClient(timeout=10.0)

    async def _api_call(self, endpoint: str, method: str = "GET", data: Optional[Dict] = None) -> Dict[str, Any]:
        """Вызов API с обработкой ошибок"""
        try:
            url = f"{self.api_url}/{endpoint}"
            headers = {"Authorization": f"Bearer {BOT_SECRET}"} if BOT_SECRET else {}

            if method == "GET":
                response = await self.client.get(url, headers=headers)
            else:
                response = await self.client.post(url, json=data, headers=headers)

            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"API call failed: {endpoint} - {e}")
            return {"error": str(e)}

    # ==================== PRODUCTS ====================

    async def get_products(self, limit: int = 20, category: Optional[str] = None) -> list:
        """Получить список товаров"""
        params = f"?limit={limit}"
        if category:
            params += f"&category={category}"
        result = await self._api_call(f"products{params}")
        return result if isinstance(result, list) else []

    async def get_product(self, product_id: str) -> Optional[Dict]:
        """Получить товар по ID"""
        result = await self._api_call(f"products/{product_id}")
        return result if "error" not in result else None

    # ==================== ORDERS ====================

    async def create_order(
        self,
        customer_name: str,
        customer_phone: str,
        customer_address: str,
        items: list,
        telegram_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Создать заказ через API"""
        return await self._api_call("orders", "POST", {
            "name": customer_name,
            "phone": customer_phone,
            "address": customer_address,
            "items": items,
            "source": "telegram_bot",
            "telegramId": telegram_id
        })

    async def get_orders_by_phone(self, phone: str) -> list:
        """Получить заказы по номеру телефона"""
        result = await self._api_call(f"orders?phone={phone}")
        return result.get("orders", []) if isinstance(result, dict) else []

    async def get_orders_by_telegram_id(self, telegram_id: int) -> list:
        """Получить заказы по Telegram ID"""
        result = await self._api_call(f"orders?telegramId={telegram_id}")
        return result.get("orders", []) if isinstance(result, dict) else []

    # ==================== USER ====================

    async def get_or_create_user(self, telegram_id: int, name: str, phone: Optional[str] = None) -> Dict[str, Any]:
        """Получить или создать пользователя"""
        return await self._api_call("users/telegram", "POST", {
            "telegramId": telegram_id,
            "name": name,
            "phone": phone
        })

    async def get_user_bonuses(self, telegram_id: int) -> int:
        """Получить бонусы пользователя"""
        result = await self._api_call(f"users/telegram/{telegram_id}/bonuses")
        return result.get("bonuses", 0) if isinstance(result, dict) else 0

    async def get_user_by_telegram_id(self, telegram_id: int) -> Optional[Dict]:
        """Получить данные пользователя по Telegram ID"""
        result = await self._api_call(f"users/telegram/{telegram_id}")
        return result if isinstance(result, dict) and "error" not in result else None

    # ==================== STEPAN MANAGER ====================

    async def notify_stepan(self, message: str) -> bool:
        """Уведомить Степана-менеджера (@MG_PM1_bot) о важном событии.

        Отправляет сообщение напрямую через Telegram API бота Степана,
        минуя Web API. Это гарантирует доставку даже если TGAS Office недоступен.
        """
        if not STEPAN_BOT_TOKEN or not STEPAN_ADMIN_ID:
            logger.warning("STEPAN_BOT_TOKEN or ADMIN_CHAT_ID not set — skipping Stepan notification")
            return False
        try:
            url = f"https://api.telegram.org/bot{STEPAN_BOT_TOKEN}/sendMessage"
            response = await self.client.post(url, json={
                "chat_id": STEPAN_ADMIN_ID,
                "text": message,
                "parse_mode": "HTML"
            })
            if response.status_code == 200:
                logger.info("Степан уведомлён ✅")
                return True
            else:
                logger.warning(f"Stepan notify failed: HTTP {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Степан notification failed: {e}")
            return False

    async def close(self):
        """Закрыть HTTP клиент"""
        await self.client.aclose()

    # ==================== GAME ====================

    async def get_game_state(self, telegram_id: int) -> Dict[str, Any]:
        """Получить состояние игры"""
        result = await self._api_call(f"game/save?telegramId={telegram_id}")
        if isinstance(result, dict) and "error" not in result:
            return result.get("gameState", {})
        return {
            "ecoPoints": 0,
            "level": 1,
            "energy": 100,
            "streak": 0
        }

    async def save_game_progress(self, telegram_id: int, points: int, energy: int) -> bool:
        """Сохранить прогресс игры"""
        result = await self._api_call("game/save", "POST", {
            "telegramId": telegram_id,
            "points": points,
            "energy": energy
        })
        return "error" not in result

    async def get_leaderboard(self, limit: int = 10) -> list:
        """Получить таблицу лидеров"""
        result = await self._api_call(f"game/leaderboard?limit={limit}")
        if isinstance(result, dict) and "leaderboard" in result:
            return result["leaderboard"]
        return result if isinstance(result, list) else []

    # ==================== NOTIFICATIONS ====================

    async def trigger_event(self, event_type: str, payload: Dict[str, Any]) -> bool:
        """Отправить событие в экосистему"""
        result = await self._api_call("ecosystem/event", "POST", {
            "type": event_type,
            "payload": payload,
            "source": "telegram_bot"
        })
        return "error" not in result

    async def notify_admins(self, message: str) -> bool:
        """Уведомить администраторов"""
        result = await self._api_call("telegram/notify", "POST", {
            "chatId": os.getenv("ADMIN_CHAT_ID", ""),
            "message": message
        })
        return "error" not in result

    # ==================== CHANNEL ====================

    async def post_to_channel(self, post_type: str, title: str, description: str = "") -> bool:
        """Опубликовать пост в канал"""
        result = await self._api_call("telegram/channel", "POST", {
            "type": post_type,
            "title": title,
            "description": description
        })
        return "error" not in result

    # ==================== MAGAZINE ====================

    async def create_magazine_lead(self, telegram_id: int, phone: Optional[str], issue_number: int, address: Optional[str]) -> bool:
        """Создать лид на печатный журнал в БД через API."""
        # Для начала попытаемся найти или создать пользователя
        user_result = await self.get_or_create_user(telegram_id, "Unknown", phone)
        user_id = None
        if isinstance(user_result, dict) and "user" in user_result:
            user_id = user_result["user"].get("id")

        result = await self._api_call("admin/magazine/leads", "POST", {
            "userId": user_id,
            "phone": phone,
            "issueId": None, # Можно связать с конкретным issue, пока передаём null
            "address": address
        })
        return "error" not in result

# Singleton instance
bridge = EcosystemBridge()


# ==================== CONVENIENCE FUNCTIONS ====================

async def sync_order_from_web(order_id: str) -> Optional[Dict]:
    """Синхронизировать заказ с веб-платформы"""
    # Используется когда заказ создан на сайте
    return await bridge._api_call(f"orders/{order_id}")


# Здесь была `notify_order_status()` — рассылка статуса заказа по SMS.
#
# Она слала POST на `/api/sms`, которого в витрине нет: 29 групп маршрутов
# перечислены в apps/web/src/app/api, и `sms` среди них не значится и не
# значилось. То есть функция при любом вызове получала 404. Вызывающих у неё
# при этом не было ни одного — но она попала в список групп в конституции,
# и по документации выходило, что SMS-канал существует.
#
# О смене статуса клиента извещает витрина (`apps/web/src/lib/orders`), она
# же единственный владелец заказов. Появится SMS-провайдер — маршрут заводится
# там же, а не отдельной дверью в боте.
