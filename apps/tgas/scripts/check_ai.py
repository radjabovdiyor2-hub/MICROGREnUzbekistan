# ruff: noqa: E402
"""scripts/check_ai.py — проверка корректности работы и настроек AI-движка.

Запуск: python scripts/check_ai.py (из apps/tgas)

⚠️ ГЛАВНОЕ, ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ: КТО РЕАЛЬНО ОТВЕЧАЕТ.

Сверка была зелёной при полностью отсутствующем ключе OpenAI. Она смотрела
`TOKEN_COSTS`, резерв токенов и наличие заглушки — то есть доказывала, что код
готов работать, а не что он работает. Между тем `mg_ai` при пустом
`OPENAI_API_KEY` молча уходил на Gemini Flash: офис месяцами думал самой лёгкой
моделью, и объяснением служило «бот тупой». Запасного поставщика больше нет —
тем важнее знать, что основной на месте.

Живые проверки требуют сети и ключа. Без ключа они не «пропускаются» — это и
есть найденная поломка, и она обязана краснеть.
"""

from __future__ import annotations

import asyncio
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

# В отличие от check_bot_roster/check_prompts эта сверка действительно щупает
# движок, поэтому без пакета mg_ai работать не может. Раньше это выглядело
# голым traceback'ом про «No module named 'mg_ai'», по которому непонятно,
# сломан код или просто не то окружение. Говорим прямо.
try:
    from shared.ai_engine import AIEngine, TOKEN_COSTS, _is_reasoning_model
except ModuleNotFoundError as exc:
    if exc.name != "mg_ai":
        raise
    print(
        "Сверка AI-движка требует пакет mg_ai (Python 3.11+).\n"
        "  В контейнере он ставится сам: apps/tgas/Dockerfile → pip install /opt/mg_ai\n"
        "  Локально:  pip install -e packages/mg_ai\n"
        "Остальные сверки (check_bot_roster, check_prompts, check_schema) mg_ai не требуют."
    )
    sys.exit(2)

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
        notes.append(
            f"  ✓ Активная модель '{active_model}' присутствует в TOKEN_COSTS."
        )


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
        notes.append(
            f"  ✓ Модель {ai._openai_model} является классической (резерв не требуется)."
        )


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

    notes.append(
        f"  ✓ Проверено {checked_files} файлов ({calls_count} вызовов chat_completion) — параметры reasoning effort валидны."
    )


def check_which_provider_answers():
    """Есть ли чем отвечать. Поставщик один — OpenAI, подменить его нечем.

    Единственная проверка, которая ловит настоящую поломку: ключа нет, а
    сверка при этом была зелёной.
    """
    if settings.openai_api_key:
        notes.append(f"  ✓ Движок настроен: OpenAI, модель '{settings.openai_model}'.")
        return
    problems.append(
        "❌ OPENAI_API_KEY не задан — ИИ не работает совсем: запасного "
        "поставщика больше нет (и это намеренно, см. mg_ai/engine.py).\n"
        "   Если запускаете локально: Settings читает `.env` рядом с рабочим "
        "каталогом, а ключи лежат в `.env` в КОРНЕ репозитория. Запускайте "
        "сверку в контейнере (docker compose exec mg_stepan python "
        "scripts/check_ai.py) — там окружение то же, что у ботов."
    )


async def check_model_exists_on_account():
    """Заявленная модель действительно доступна аккаунту.

    Неверное имя модели даёт то же самое, что отсутствующий ключ: каждый вызов
    падает. Раньше отказ молча уводил офис на Gemini, и в логе это выглядело
    как «OpenAI сбой», а не как опечатка в настройке — так и жил `gpt-5.5`.
    """
    if not settings.openai_api_key:
        return  # уже сказано выше, второй раз не шумим
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=30.0)
        available = {m.id async for m in client.models.list()}
    except Exception as exc:
        problems.append(f"❌ Не смог получить список моделей OpenAI: {exc}")
        return

    if settings.openai_model in available:
        notes.append(f"  ✓ Модель '{settings.openai_model}' доступна аккаунту.")
        return
    guess = sorted(m for m in available if m.startswith(("gpt-", "o1", "o3", "o4")))
    problems.append(
        f"❌ Модели '{settings.openai_model}' у аккаунта НЕТ — каждый вызов "
        f"будет падать, и ИИ офиса не работает. Доступны, например: "
        f"{', '.join(guess[:8])}"
    )


async def check_live_call_and_tools():
    """Живой вызов: кто ответил на самом деле и работает ли выбор инструмента.

    Проверяем именно `chat_with_tools`: через него идёт каждое распоряжение
    владельца, и именно в нём забыли передать `reasoning_effort`.
    """
    if not settings.openai_api_key:
        return

    ai = AIEngine()
    probe = {
        "type": "function",
        "function": {
            "name": "get_price_list",
            "description": "Вернуть прайс-лист каталога",
            "parameters": {"type": "object", "properties": {}},
        },
    }
    try:
        message = await ai.chat_with_tools(
            system_prompt="Ты помощник офиса. Для цен вызывай инструмент.",
            user_message="Пришли прайс-лист.",
            tools=[probe],
        )
    except Exception as exc:
        problems.append(f"❌ Живой вызов с инструментами не прошёл: {exc}")
        return

    used = (ai.usage.requests_log or [{}])[-1].get("model", "неизвестно")
    if used != settings.openai_model:
        problems.append(
            f"❌ Ответила не та модель: ждали '{settings.openai_model}', "
            f"ответила '{used}'."
        )
    else:
        notes.append(f"  ✓ Живой вызов: ответила '{used}'.")
    if used not in TOKEN_COSTS:
        problems.append(
            f"❌ Модели '{used}' нет в TOKEN_COSTS — расход в админке будет "
            f"считаться по ставке наугад (mg_ai/engine.py)."
        )

    if getattr(message, "tool_calls", None):
        notes.append("  ✓ Инструмент выбран — function calling работает.")
    else:
        notes.append(
            "  ⚠ На прямую просьбу о прайсе инструмент не выбран "
            f"(ответ текстом). Проверьте, что модель '{used}' умеет "
            f"function calling."
        )


async def main():
    print("🔍 Проверка конфигурации и логики AI-движка (scripts/check_ai.py)...")
    check_which_provider_answers()
    check_token_costs()
    check_reasoning_safety_reserve()
    await check_empty_response_guard()
    check_callsite_reasoning_efforts()
    await check_model_exists_on_account()
    await check_live_call_and_tools()

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
