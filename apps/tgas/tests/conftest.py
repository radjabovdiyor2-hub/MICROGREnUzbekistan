"""
Общая настройка тестов офиса.

Пакет `mg_ai` ставится только внутри контейнера (`Dockerfile`: pip install
/opt/mg_ai), поэтому вне Docker любой импорт `shared.ai_engine` падает с
ModuleNotFoundError — а его тянет за собой почти каждый бот. Из-за этого
`tests/test_smoke.py` было нечем запустить локально, и в CLAUDE.md появилась
строчка «прогнать тесты тут нечем».

Здесь движок подменяется заглушкой, ЕСЛИ настоящего пакета нет. Внутри
контейнера подмена не срабатывает и тесты идут против реального mg_ai.
Заглушка не делает сетевых вызовов: тесты проверяют проводку офиса, а не
поведение модели.
"""

from __future__ import annotations

import os
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Настройки читаются из .env; в CI его нет, а Settings требует хотя бы дефолтов.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/microgreen")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")


def _install_mg_ai_stub() -> None:
    try:
        import mg_ai.engine  # noqa: F401

        return  # настоящий пакет на месте — ничего не подменяем
    except ModuleNotFoundError:
        pass

    package = types.ModuleType("mg_ai")
    engine = types.ModuleType("mg_ai.engine")

    class _StubEngine:
        """Движок-заглушка: ничего не вызывает и ничего не выдумывает."""

        def __init__(self, *args, **kwargs) -> None:
            self.usage = types.SimpleNamespace(total_errors=0)

        async def chat_completion(self, *args, **kwargs) -> str:
            return ""

        async def chat_with_tools(self, *args, **kwargs):
            return types.SimpleNamespace(content="", tool_calls=[])

        async def generate_image(self, *args, **kwargs):
            return None

        async def embed(self, *args, **kwargs):
            return None

    engine.AIEngine = _StubEngine
    engine.UsageStats = object
    engine.TOKEN_COSTS = {}
    engine._is_reasoning_model = lambda model: False
    engine.GEMINI_BASE_URL = ""
    package.engine = engine

    sys.modules["mg_ai"] = package
    sys.modules["mg_ai.engine"] = engine


_install_mg_ai_stub()
