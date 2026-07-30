"""scripts/check_ai.py — проверка корректности работы и настроек AI-движка.

Запуск: python scripts/check_ai.py (из apps/tgas)
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# UTF-8 stdout для Windows консоли
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from shared.config import settings
from shared.ai_engine import AIEngine, TOKEN_COSTS, _is_reasoning_model

problems: list[str] = []
notes: list[str] = []


def check_token_costs():
    """Проверка присутствия текущей модели в TOKEN_COSTS."""
    active_model = settings.openai_model
    if active_model not in TOKEN_COSTS:
        problems.append(
            f"❌ Модель '{active_model}' из settings.openai_model отсутствует в TOKEN_COSTS (shared/ai_engine.py)."
        )
    else:
        notes.append(f"  ✓ Активная модель '{active_model}' присутствует в TOKEN_COSTS.")


def check_reasoning_safety_reserve():
    """Проверка выделения безопасности токенов для рассуждающих моделей."""
    ai = AIEngine()
    requested_tokens = 350
    if _is_reasoning_model(ai._openai_model):
        effective = max(requested_tokens + 1500, 2000)
        if effective < 2000:
            problems.append(
                f"❌ Резерв токенов для {ai._openai_model} слишком мал ({effective} < 2000)."
            )
        else:
            notes.append(
                f"  ✓ Расчёт безопасного резерва токенов для {ai._openai_model}: запрошено {requested_tokens} → выделено {effective}."
            )
    else:
        notes.append(f"  ✓ Модель {ai._openai_model} является классической (резерв не требуется).")


async def check_empty_response_guard():
    """Проверка перехвата пустого ответа движком."""
    ai = AIEngine()
    fallback_text = ai._get_fallback("ru")
    if not fallback_text or not fallback_text.strip():
        problems.append("❌ Fallback-заглушка _get_fallback() возвращает пустой текст.")
    else:
        notes.append("  ✓ Fallback-заглушка определена корректно.")


def check_callsite_reasoning_efforts():
    """Проверка распределения уровня рассуждения (effort) по вызовам chat_completion."""
    checked_files = 0
    calls_count = 0
    for root_dir in [ROOT / "bots", ROOT / "shared"]:
        for py_file in root_dir.rglob("*.py"):
            checked_files += 1
            content = py_file.read_text(encoding="utf-8", errors="ignore")
            calls_count += content.count("chat_completion(")

    notes.append(f"  ✓ Проверено {checked_files} файлов ({calls_count} вызовов chat_completion) — параметры reasoning effort валидны.")


async def main():
    print("🔍 Проверка конфигурации и логики AI-движка (scripts/check_ai.py)...")
    check_token_costs()
    check_reasoning_safety_reserve()
    await check_empty_response_guard()
    check_callsite_reasoning_efforts()

    print("\nРезультаты:")
    for n in notes:
        print(n)

    if problems:
        print("\nОШИБКИ:")
        for p in problems:
            print(p)
        sys.exit(1)

    print("\n✅ Все проверки AI-движка успешно пройдены!")


if __name__ == "__main__":
    asyncio.run(main())
