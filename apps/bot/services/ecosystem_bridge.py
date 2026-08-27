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
        """Получить список товаров.

        Тонкий делегат к `services.catalog`: разбор ответа и приведение полей
        живут там, в одном месте. Здесь была своя проверка
        `isinstance(result, list)`, а роут отдаёт `{items, pagination}` —
        функция возвращала пустой список ВСЕГДА, и все пять вызывающих
        (объединённое меню, избранное, поиск по каналу, контекст AI-продавца)
        показывали пустой каталог без единой ошибки в логах.
        """
        from services.catalog import fetch_products

        return await fetch_products(category=category, limit=limit)

    async def get_product(self, product_id: str) -> Optional[Dict]:
        """Получить товар по ID"""
        from services.catalog import fetch_product

        return await fetch_product(product_id)

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

    async def get_or_create_user(
        self,
        telegram_id: int,
        name: str,
        phone: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Получить или создать пользователя витрины.

        `language` передаётся, только если его выбрали ЯВНО: иначе каждый
        вызов затирал бы выбор пользователя умолчанием.
        """
        payload: Dict[str, Any] = {
            "telegramId": telegram_id,
            "name": name,
            "phone": phone,
        }
        if language:
            payload["language"] = language
        return await self._api_call("users/telegram", "POST", payload)

    async def get_user_bonuses(self, telegram_id: int) -> int:
        """Получить бонусы пользователя"""
        result = await self._api_call(f"users/telegram/{telegram_id}/bonuses")
        return result.get("bonuses", 0) if isinstance(result, dict) else 0

    async def get_user_by_telegram_id(self, telegram_id: int) -> Optional[Dict]:
        """Получить данные пользователя по Telegram ID.

        Три несовпадения подряд были здесь. Путь `users/telegram/{id}` —
        такого роута нет (есть `users/telegram/{id}/bonuses`), и запрос
        отдавал 404. Роут, который нужен, — `users/telegram?telegramId=…`, и
        он заворачивает ответ в `{user: {...}}`, а вызывающие читали плоский
        объект. Поэтому экран «Профиль» у КАЖДОГО показывал «телефон не
        указан», даже когда телефон в базе был.
        """
        result = await self._api_call(f"users/telegram?telegramId={telegram_id}")
        if not isinstance(result, dict) or "error" in result:
            return None
        user = result.get("user")
        return user if isinstance(user, dict) else None

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

    # ==================== NOTIFICATIONS ====================

    # Здесь были три метода игры — `get_game_state`, `save_game_progress`,
    # `get_leaderboard` — и `trigger_event`.
    #
    # Игра ходила в `/api/game/save` и `/api/game/leaderboard`. Такой
    # группы маршрутов на витрине НЕТ и не было: приложение игры удалено,
    # каталога `apps/game` не существует. То есть любой вызов возвращал
    # 404, а `get_game_state` молча отдавал нули — «ноль очков, уровень
    # один» выглядит как честный ответ новому игроку, а не как отказ.
    #
    # `trigger_event` слал события в `/api/ecosystem/event`, который их
    # только писал в лог и отвечал `{"received": true}`. То есть дверь
    # выглядела рабочей, ничего при этом не делая. Роут удалён вместе с
    # методом: пустая дверь хуже её отсутствия — на неё полагаются.
    #
    # Вызывающих не было ни у одного из четырёх.

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

# Здесь была `sync_order_from_web()` — чтение заказа с витрины по id.
#
# Вызывающих у неё не было ни одного, а заказы бот и так читает через
# `get_orders_by_telegram_id` и `get_user_orders`. Отдельная функция,
# лезущая в приватный `_api_call` мимо публичных методов моста, только
# предлагала второй способ делать то же самое.


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
