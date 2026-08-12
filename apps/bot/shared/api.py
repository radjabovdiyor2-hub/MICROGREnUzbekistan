"""
🔑 Заголовки для вызовов витрины.

Общий секрет бот→сайт. Был выписан дважды (`handlers/admin.py`,
`handlers/start.py`) и не был выписан там, где нужнее всего — в оформлении
заказа (`handlers/shop.py`): POST уходил без заголовков, витрина не считала
вызов доверенным (`identity.trusted` ложно) и ИГНОРИРОВАЛА присланный
`telegramId`. Клиент подтягивался upsert-ом по телефону, и у пользователя с
другим номером в профиле появлялась вторая карточка: история заказов и баллы
расходились с настоящим аккаунтом.
"""

import os

BOT_SECRET = os.getenv("BOT_SECRET", "")


def api_headers(json_body: bool = True) -> dict:
    """Заголовки для вызовов сайта: общий секрет бот→сайт."""
    headers = {"Content-Type": "application/json"} if json_body else {}
    if BOT_SECRET:
        headers["Authorization"] = f"Bearer {BOT_SECRET}"
    return headers
