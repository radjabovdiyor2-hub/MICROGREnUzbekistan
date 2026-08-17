"""Bot handlers package — matches main.py router registration.

Импорты здесь нужны ради побочного эффекта: каждый модуль при загрузке
регистрирует свой Router. `__all__` объявлен, чтобы автоисправление ruff не
приняло их за мёртвые и не выкинуло — это молча отключило бы половину бота.
"""
from . import start
from . import ai_seller
from . import shop
from . import orders
from . import admin
from . import unified
from . import group
from . import magazine

__all__ = [
    "start",
    "ai_seller",
    "shop",
    "orders",
    "admin",
    "unified",
    "group",
    "magazine",
]
