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
from shared.utils import (
    format_price,
    generate_order_number,
    simulate_typing,
    get_greeting,
    escape_md,
)


def __getattr__(name: str) -> dict:
    """Ленивая выдача AIEngine (PEP 562).

    Раньше AIEngine импортировался здесь же, наверху. После выделения движка
    в пакет mg_ai это означало, что ЛЮБОЙ импорт из shared — включая
    `from shared.health import ALL_BOTS`, где нет ни строчки про AI, — тянул
    за собой mg_ai. Пакет ставится только внутри контейнера (apps/tgas/
    Dockerfile: pip install /opt/mg_ai), поэтому вне Docker падали
    scripts/check_bot_roster.py и scripts/check_prompts.py — те самые
    сверки, на которые ссылается CLAUDE.md как на способ проверить работу.

    Публичный контракт не меняется: `from shared import AIEngine` работает
    как прежде, просто движок подгружается в момент обращения.
    """
    if name == "AIEngine":
        from shared.ai_engine import AIEngine

        return AIEngine
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


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
