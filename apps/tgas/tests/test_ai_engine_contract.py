"""
Договор с движком: поставщик один, модель одна, цена известна.

ЗАЧЕМ ЭТИ ТЕСТЫ

Три поломки жили рядом и маскировали друг друга:

1. `OPENAI_API_KEY` пуст или модель названа неверно → каждый вызов падает;
2. падение молча уводило офис на `gemini-2.5-flash` (слабее, хуже с
   инструментами) — в логе оставалась одна строка `warning`;
3. имя модели было вписано в четыре места (config, compose, .env.example,
   mg_ai), и они разошлись.

Итог для владельца: «бот тупой» без единой зацепки. Здесь проверяется то, что
чтением кода не проверяется: движок физически не умеет подменить поставщика,
рассуждающая модель получает правильные параметры, а цена активной модели
известна — иначе расход в админке считается по ставке наугад.

⚠️ Модуль движка загружается НАПРЯМУЮ из packages/mg_ai, а не через
`shared.ai_engine`: вне контейнера `tests/conftest.py` подменяет `mg_ai`
заглушкой, и проверять пришлось бы заглушку.
"""

from __future__ import annotations

import importlib.util
import inspect
import sys
import types
from pathlib import Path

import pytest

from shared.config import settings

ENGINE_PATH = (
    Path(__file__).resolve().parents[3] / "packages" / "mg_ai" / "mg_ai" / "engine.py"
)


def _real_engine_module():
    """Настоящий mg_ai.engine, минуя заглушку из conftest."""
    spec = importlib.util.spec_from_file_location("mg_ai_engine_real", ENGINE_PATH)
    module = importlib.util.module_from_spec(spec)
    # Регистрация обязательна до exec_module: `@dataclass` внутри модуля
    # разрешает аннотации через `sys.modules[cls.__module__]`, и без записи
    # загрузка падает на UsageStats.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def engine():
    if not ENGINE_PATH.exists():
        pytest.fail(f"пакет mg_ai не найден по пути {ENGINE_PATH}")
    return _real_engine_module()


# ── Поставщик один ──────────────────────────────────────────────────────
def test_engine_cannot_take_a_second_provider(engine):
    """Ключа другого поставщика в конструкторе нет — подменить нечем.

    Пока параметр существовал, подмена была одной строкой в обёртке, и
    вернуть её мог кто угодно, не заметив последствий.
    """
    params = set(inspect.signature(engine.AIEngine.__init__).parameters)
    assert not [p for p in params if "gemini" in p], (
        f"в конструкторе снова есть ключ запасного поставщика: {sorted(params)}"
    )
    assert "on_failure" in params, (
        "отказ движка должен сообщаться приложению, иначе он опять станет "
        "строкой в логе"
    )


def test_office_wrapper_passes_only_openai(monkeypatch):
    """Обёртка офиса не передаёт движку ничего, кроме OpenAI, и ловит отказ."""
    from shared import ai_engine

    captured: dict = {}

    def fake_init(self, **kwargs):
        captured.update(kwargs)
        self.usage = None

    monkeypatch.setattr(ai_engine._BaseAIEngine, "__init__", fake_init)
    ai_engine.AIEngine()

    assert not [k for k in captured if "gemini" in k], (
        f"офис снова передаёт запасной движок: {sorted(captured)}"
    )
    assert captured["openai_model"] == settings.openai_model
    assert captured["on_failure"] is ai_engine._notify_ai_failure
    assert captured["persist_fn"] is ai_engine._persist_usage


def test_tools_call_raises_instead_of_switching(engine):
    """Без ключа `chat_with_tools` ОТКАЗЫВАЕТ, а не отвечает кем-то другим.

    Молчаливый ответ другой моделью здесь опаснее всего: этот вызов решает,
    какое действие выполнить.
    """
    ai = engine.AIEngine(openai_key="")
    with pytest.raises(Exception, match="OpenAI"):
        import asyncio

        asyncio.get_event_loop_policy().new_event_loop().run_until_complete(
            ai.chat_with_tools(system_prompt="s", user_message="u", tools=[])
        )


# ── Параметры модели ────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "model,reasoning",
    [
        ("gpt-5.6-sol", True),
        ("gpt-5.6-terra", True),
        ("gpt-5.6-luna", True),
        ("o4-mini", True),
        ("gpt-4o", False),
        ("gpt-4o-mini", False),
    ],
)
def test_reasoning_family_is_recognised(engine, model, reasoning):
    """Ошибка здесь = 400 на каждом вызове.

    Рассуждающие модели принимают `max_completion_tokens` и отвергают
    `max_tokens`. Префикс `gpt-5` однажды убрали из этой проверки — и всё
    семейство 5.x стало нерабочим.
    """
    assert engine._is_reasoning_model(model) is reasoning


def test_active_model_has_a_price(engine):
    """Цена активной модели известна — иначе расход в админке недостоверен."""
    assert settings.openai_model in engine.TOKEN_COSTS, (
        f"модель '{settings.openai_model}' не найдена в TOKEN_COSTS: расход "
        f"будет считаться по ставке наугад (1.0/3.0 за 1M)"
    )


def test_no_dead_prices_of_the_removed_provider(engine):
    """Цен несуществующего поставщика в прайсе нет.

    Оставленная запись — приглашение вернуть подмену: она выглядит как
    поддерживаемая модель.
    """
    assert not [m for m in engine.TOKEN_COSTS if "gemini" in m.lower()]


# ── Инструменты и эндпоинт ──────────────────────────────────────────────
#
# 18.08.2026: живой вызов с инструментами падал с 400 — «Function tools with
# reasoning_effort are not supported for gpt-5.5 in /v1/chat/completions».
# Статическая сверка при этом была зелёной, потому что смотрела наличие
# параметров, а не эндпоинт. Тесты ниже смотрят именно то, что тогда
# разошлось.


def _fake_response(*, output, status="completed"):
    """Ответ /v1/responses в том виде, в каком его отдаёт SDK."""
    return types.SimpleNamespace(output=list(output), status=status, usage=None)


def _function_call(name: str, arguments: str):
    return types.SimpleNamespace(
        type="function_call", call_id="c1", name=name, arguments=arguments
    )


def _text_message(text: str):
    return types.SimpleNamespace(
        type="message",
        content=[types.SimpleNamespace(type="output_text", text=text)],
    )


def test_tool_schemas_are_flattened_for_responses(engine):
    """Схемы отделов лежат в chat-формате, а /v1/responses ждёт плоский.

    Отдать инструмент неконвертированным — значит отдать его без имени:
    модель «не выберет ничего», и это выглядит как поглупевший бот, а не как
    ошибка формата.
    """
    chat_format = {
        "type": "function",
        "function": {
            "name": "get_price_list",
            "description": "Прайс",
            "parameters": {"type": "object", "properties": {}},
        },
    }
    flat = engine._to_responses_tools([chat_format])[0]
    assert flat["name"] == "get_price_list"
    assert "function" not in flat, f"функция осталась вложенной: {flat}"


def test_tool_flattening_is_idempotent(engine):
    """Инструмент, уже описанный плоско, переживает конвертацию."""
    flat = {"type": "function", "name": "find_product", "parameters": {}}
    assert engine._to_responses_tools([flat])[0]["name"] == "find_product"


def test_response_output_keeps_the_chat_contract(engine):
    """Форму `.content` / `.tool_calls[].function` читают три места сразу.

    `tool_runtime.run_tool_loop`, разбор Стёпана в `assistant.py` и
    `scripts/check_ai.py`. Сменить её вместе с эндпоинтом означало бы
    молчаливую поломку во всех отделах: `getattr(message, "tool_calls", None)`
    вернул бы None, и инструменты просто перестали бы вызываться.
    """
    message = engine._message_from_response(
        _fake_response(
            output=[_function_call("get_price_list", '{"a": 1}'), _text_message("готово")]
        )
    )
    assert message.tool_calls[0].function.name == "get_price_list"
    assert message.tool_calls[0].function.arguments == '{"a": 1}'
    assert message.content == "готово"


def test_tools_call_uses_responses_endpoint_and_does_not_store(engine):
    """Тот самый 400: `reasoning_effort` + инструменты на chat/completions.

    Проверяем три вещи разом, потому что разошлись они вместе: запрос уходит в
    /v1/responses (`input`, а не `messages`), размышление передаётся как
    `reasoning`, а не запрещённым `reasoning_effort`, и переписка не остаётся
    на стороне OpenAI (`store` там включён по умолчанию, у chat/completions
    его не было вовсе).
    """
    import asyncio

    captured: dict = {}

    class _Responses:
        async def create(self, **kwargs):
            captured.update(kwargs)
            return _fake_response(output=[_text_message("ок")])

    ai = engine.AIEngine(openai_key="k", openai_model="gpt-5.5")
    ai._get_openai_client = lambda: types.SimpleNamespace(responses=_Responses())

    asyncio.run(
        ai.chat_with_tools(system_prompt="s", user_message="u", tools=[], effort="high")
    )

    assert "input" in captured and "messages" not in captured, (
        f"запрос ушёл не в /v1/responses: {sorted(captured)}"
    )
    assert captured["reasoning"] == {"effort": "high"}
    assert "reasoning_effort" not in captured, (
        "`reasoning_effort` вместе с инструментами — это 400 от OpenAI"
    )
    assert captured["store"] is False
    assert captured["instructions"] == "s"
