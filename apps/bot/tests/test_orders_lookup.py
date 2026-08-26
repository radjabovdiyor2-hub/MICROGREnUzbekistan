"""«Мои заказы» находят заказ, оформленный в этом же боте.

ЗАЧЕМ ЭТОТ ТЕСТ

`/orders` искал заказы ТОЛЬКО по телефону из профиля витрины: нет телефона —
ответ «заказов нет». Это была неправда. Заказ, оформленный здесь же, к
аккаунту привязан — `telegramId` уходит в `POST /orders`, — и мост давно умел
спрашивать по нему: метод `get_orders_by_telegram_id` был написан и не
вызывался ниоткуда.

Клиент видел пустой экран при существующем заказе и шёл спрашивать статус
человеком. Проверяется поэтому не текст ответа, а то, каким ключом бот вообще
идёт искать.
"""

import re
from pathlib import Path

BOT = Path(__file__).resolve().parent.parent
UNIFIED = BOT / "handlers" / "unified.py"


def _orders_handler() -> str:
    """Тело обработчика `/orders` — от декоратора до следующего."""
    text = UNIFIED.read_text(encoding="utf-8")
    start = text.index('@router.message(Command("orders"))')
    nxt = text.index("@router.message(", start + 10)
    return text[start:nxt]


def test_orders_are_looked_up_by_telegram_id():
    body = _orders_handler()
    assert "get_orders_by_telegram_id" in body, (
        "поиск заказов снова идёт только по телефону — клиент без телефона "
        "в профиле увидит «заказов нет» при существующем заказе"
    )


def test_phone_stays_as_a_fallback():
    """Телефон нужен: заказ мог быть оформлен на сайте без входа."""
    body = _orders_handler()
    assert "get_orders_by_phone" in body


def test_telegram_lookup_goes_first():
    """Порядок важен: свой аккаунт — точнее чужого номера в профиле."""
    body = _orders_handler()
    assert body.index("get_orders_by_telegram_id") < body.index("get_orders_by_phone")


def test_bridge_still_offers_both_keys():
    bridge = (BOT / "services" / "ecosystem_bridge.py").read_text(encoding="utf-8")
    for name in ("get_orders_by_telegram_id", "get_orders_by_phone"):
        assert re.search(rf"async def {name}\b", bridge), f"{name} исчез из моста"
