"""
Microgreen Uzbekistan — Общая библиотека (shared)
==================================================
Переиспользуемые модули для всех AI-ботов сотрудников:
- config: настройки из .env
- database: асинхронное подключение к PostgreSQL
- ai_engine: интеграция с OpenAI
- utils: вспомогательные функции
"""

from shared.config import settings
from shared.database import get_async_session, init_db, AsyncSessionLocal
from shared.ai_engine import AIEngine
from shared.utils import (
    format_price,
    generate_order_number,
    simulate_typing,
    get_greeting,
    escape_md,
)

__all__ = [
    # Конфигурация
    "settings",
    # База данных
    "get_async_session",
    "init_db",
    "AsyncSessionLocal",
    # AI-движок
    "AIEngine",
    # Утилиты
    "format_price",
    "generate_order_number",
    "simulate_typing",
    "get_greeting",
    "escape_md",
]

__version__ = "1.0.0"
