"""
Рубильник ИИ и бюджет закрывают ОБА пути к модели.

ЗАЧЕМ ЭТИ ТЕСТЫ

Проверка «ИИ выключен» стояла только в `chat_completion`. Второй метод,
`chat_with_tools`, наследовался из `mg_ai` без единой проверки — а через него
ходят все отделы (`tool_runtime.run_tool_loop`), исполнитель задач и главный
диалог владельца со Стёпаном, причём с `effort="high"` и по `/v1/responses`.
То есть выключатель гасил дешёвый путь и не трогал самый дорогой: владелец
выключал ИИ, видел честную заглушку в переписке — и продолжал платить.

Ровно та же история с бюджетом: `ai_daily_budget_usd` читал один потребитель —
сообщение finance-бота в 23:30. Ни один вызов модели с ним не сверялся, то есть
это была надпись, а не потолок. Вдобавок владелец правил бюджет в админке
(`app_settings`), а офис читал переменную окружения — поле не доезжало вовсе.

Поэтому проверяется не «вернулась ли заглушка», а факт: дошёл ли вызов до
транспорта. Заглушка при состоявшемся вызове выглядела бы точно так же.
"""

from __future__ import annotations

import pytest

from shared import ai_engine
from shared.ai_engine import AIEngine, AIUnavailable


@pytest.fixture
def calls(monkeypatch):
    """Считаем обращения к транспорту: их не должно быть вовсе."""
    seen: list[str] = []

    async def fake_completion(self, *args, **kwargs):
        seen.append("chat_completion")
        return "ответ модели"

    async def fake_tools(self, *args, **kwargs):
        seen.append("chat_with_tools")
        return object()

    base = AIEngine.__mro__[1]
    monkeypatch.setattr(base, "chat_completion", fake_completion, raising=False)
    monkeypatch.setattr(base, "chat_with_tools", fake_tools, raising=False)
    return seen


def _switch(monkeypatch, *, enabled: bool = True, budget: str | None = None):
    async def fake_enabled() -> bool:
        return enabled

    async def fake_budget():
        return budget

    monkeypatch.setattr(ai_engine, "_ai_enabled", fake_enabled)
    monkeypatch.setattr("shared.ai_usage.budget_block_reason", fake_budget)
    # Сигнал владельцу в тестах не шлём: у него свой тест на «раз в сутки».
    monkeypatch.setattr(ai_engine, "_notify_budget_stop", lambda reason: None)


@pytest.mark.asyncio
async def test_switch_off_blocks_plain_chat(monkeypatch, calls):
    _switch(monkeypatch, enabled=False)
    answer = await AIEngine().chat_completion(user_message="привет")

    assert calls == [], "вызов ушёл в модель при выключенном ИИ"
    assert "" != answer, "клиент должен получить честную заглушку, а не пустоту"


@pytest.mark.asyncio
async def test_switch_off_blocks_tools(monkeypatch, calls):
    """Тот самый путь, который выключатель не закрывал."""
    _switch(monkeypatch, enabled=False)

    with pytest.raises(AIUnavailable):
        await AIEngine().chat_with_tools(
            system_prompt="ты менеджер", user_message="продай 5 лотков", tools=[]
        )

    assert calls == [], "вызов с инструментами ушёл в модель при выключенном ИИ"


@pytest.mark.asyncio
async def test_budget_blocks_both_paths(monkeypatch, calls):
    _switch(monkeypatch, budget="дневной бюджет ИИ исчерпан: $6.00 из $5.00")

    await AIEngine().chat_completion(user_message="привет")
    with pytest.raises(AIUnavailable) as exc:
        await AIEngine().chat_with_tools(
            system_prompt="ты менеджер", user_message="продай 5 лотков", tools=[]
        )

    assert calls == [], "бюджет исчерпан, а вызовы продолжают уходить"
    # Причина уже человеческая: её показывают владельцу как есть.
    assert "бюджет" in str(exc.value)


@pytest.mark.asyncio
async def test_allowed_calls_reach_the_model(monkeypatch, calls):
    """Обратная сторона: включённый ИИ в пределах бюджета обязан работать.

    Без этой проверки тесты выше проходили бы и у наглухо сломанного движка.
    """
    _switch(monkeypatch)

    await AIEngine().chat_completion(user_message="привет")
    await AIEngine().chat_with_tools(
        system_prompt="ты менеджер", user_message="продай 5 лотков", tools=[]
    )

    assert calls == ["chat_completion", "chat_with_tools"]


@pytest.mark.asyncio
async def test_owner_is_told_about_budget_stop(monkeypatch):
    """Остановка на бюджете без сигнала неотличима от поломки."""
    told: list[str] = []

    async def fake_enabled() -> bool:
        return True

    async def fake_budget():
        return "месячный бюджет ИИ исчерпан: $120.00 из $100.00"

    monkeypatch.setattr(ai_engine, "_ai_enabled", fake_enabled)
    monkeypatch.setattr("shared.ai_usage.budget_block_reason", fake_budget)
    monkeypatch.setattr(ai_engine, "_notify_budget_stop", lambda reason: told.append(reason))

    with pytest.raises(AIUnavailable):
        await AIEngine().chat_with_tools(system_prompt="p", user_message="u", tools=[])

    assert told and "бюджет" in told[0]
