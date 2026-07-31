"""
mg_ai — единый AI-транспорт для Microgreen Uzbekistan.
======================================================

Чистый пакет без зависимости на shared.config, shared.brand, shared.ai_usage.
API-ключи и модели передаются явно через аргументы конструктора.

Потребители:
  · apps/tgas/shared/ai_engine.py — обёртка, подставляющая ключи из shared.config
  · apps/bot/services/ai_service.py — обёртка для витринного бота
"""

from mg_ai.engine import (  # noqa: F401
    AIEngine,
    UsageStats,
    TOKEN_COSTS,
)
from mg_ai.tts import (  # noqa: F401
    openai_tts,
    edge_tts_generate,
)

__version__ = "1.0.0"
