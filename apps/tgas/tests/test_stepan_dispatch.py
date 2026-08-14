"""
Разбор вызовов инструментов у Стёпана: он обязан СКАЗАТЬ, что сделал.

Случай из группы «Продажа»: «Клиент <имя>, <номер>, ЗАРЕГИСТРИРУЙ».
Бот поставил 👍 и не ответил ничего. Инструмент `add_customer` при этом
отработал — карточка в CRM появилась, — но разбор печатал в чат только ключ
`message`, которого у CRM-инструментов нет: они возвращают `summary`, а
`find_customer` вообще голые поля `{found, count, customers}`. Второго прохода
к модели у Стёпана не было (у отделов он есть — `shared/tool_runtime.py`), а при
function calling `content` пуст — значит тишина.

Для руководителя молчание неотличимо от «бот не понял»: он повторяет
распоряжение, хотя оно уже выполнено. Поэтому проверяем не формат ответа, а
единственное, что здесь важно: после ЛЮБОГО вызова инструмента в чат уходит
хотя бы одно сообщение.
"""

from __future__ import annotations

import types

import pytest

from bots.stepan_bot.handlers import assistant


class FakeMessage:
    """Сообщение Telegram ровно в том объёме, в каком его трогает разбор."""

    def __init__(self, text: str = "зарегистрируй клиента Ахмад Каримов"):
        self.text = text
        self.voice = None
        self.answers: list[str] = []
        self.chat = types.SimpleNamespace(id=-100500, type="private")
        self.from_user = types.SimpleNamespace(id=1, username="owner")
        self.bot = types.SimpleNamespace()

    async def answer(self, text, **kwargs):
        self.answers.append(str(text))

    async def answer_voice(self, *args, **kwargs):
        pass


def _tool_call(name: str, arguments: str = "{}"):
    return types.SimpleNamespace(
        function=types.SimpleNamespace(name=name, arguments=arguments)
    )


@pytest.fixture
def stepan(monkeypatch):
    """Стёпан без сети и без базы: остаётся только разбор вызовов инструментов."""

    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(assistant, "set_reaction", noop)
    monkeypatch.setattr(assistant, "simulate_typing", noop)
    monkeypatch.setattr(assistant, "_get_db_context", noop)
    monkeypatch.setattr(assistant, "_open_sale_prompt", lambda chat_id: _empty())
    monkeypatch.setattr(assistant, "_answer_open_sale_question", noop)

    from shared import assistant_memory, stepan_tools

    monkeypatch.setattr(assistant_memory, "load_context", noop)
    monkeypatch.setattr(assistant_memory, "append", noop)

    async def no_remote(runtime="tg"):
        return []

    monkeypatch.setattr(stepan_tools, "load_registry", no_remote)
    return monkeypatch


async def _empty() -> str:
    return ""


def _script(monkeypatch, calls, content=""):
    """Модель отвечает заданными вызовами инструментов и текстом."""

    async def chat_with_tools(*args, **kwargs):
        return types.SimpleNamespace(content=content, tool_calls=calls)

    async def chat_completion(*args, **kwargs):
        # Второй проход: движок-заглушка в conftest отдаёт "", и это важный
        # случай — ответ всё равно обязан быть, из фактов.
        return ""

    monkeypatch.setattr(
        assistant,
        "ai",
        types.SimpleNamespace(
            chat_with_tools=chat_with_tools,
            chat_completion=chat_completion,
            generate_speech=None,
        ),
    )


# Формы ответа, которые реально возвращают инструменты офиса.
# `summary` — CRM (add_customer), голые поля — find_customer, `error` —
# `registry.call`, когда инструмент упал, пустой словарь — крайний случай.
@pytest.mark.parametrize(
    "result",
    [
        {"ok": True, "created": True, "customer_id": 7, "summary": "Клиент заведён."},
        {"found": True, "count": 1, "customers": [{"id": 7, "name": "Ахмад Каримов"}]},
        {"ok": False, "needs": "confirmation", "error": "Похоже, такой уже есть"},
        {"error": "инструмент «add_customer» не отработал: нет связи с базой"},
        {},
    ],
    ids=["summary", "bare-fields", "needs-confirmation", "error", "empty"],
)
@pytest.mark.asyncio
async def test_office_tool_result_always_reaches_the_owner(stepan, result):
    """Инструмент отработал — руководитель обязан это увидеть."""
    _script(stepan, [_tool_call("add_customer", '{"name": "Ахмад Каримов"}')])

    async def fake_call(name, args):
        return result

    stepan.setattr(assistant.tool_registry, "call", fake_call)

    message = FakeMessage()
    await assistant._process_brain(message, message.text, state=None)

    assert message.answers, (
        "инструмент отработал, а в чат не ушло ничего — для руководителя это "
        "выглядит как «бот не понял», и он повторит распоряжение"
    )


@pytest.mark.asyncio
async def test_tool_message_is_not_duplicated_by_a_second_pass(stepan):
    """Инструмент сказал сам — второй проход не добавляет пересказ поверх.

    Иначе к фактам из базы приписывался бы комментарий модели, и на экране
    оказались бы два ответа на один вопрос, местами противоречащих друг другу.
    """
    _script(stepan, [_tool_call("find_customer", '{"query": "Ахмад Каримов"}')])

    async def fake_call(name, args):
        return {"message": "Ахмад Каримов, +998 90 000-00-00, 0 заказов."}

    stepan.setattr(assistant.tool_registry, "call", fake_call)

    message = FakeMessage()
    await assistant._process_brain(message, message.text, state=None)

    assert message.answers == ["Ахмад Каримов, +998 90 000-00-00, 0 заказов."]


@pytest.mark.asyncio
async def test_unknown_tool_does_not_end_in_silence(stepan):
    """Имени нет ни в офисе, ни на витрине — это тоже ответ, а не тишина.

    Ветка витрины при недоступном `STOREFRONT_API_URL` возвращает
    `{"status": "error"}`, и её сообщение об ошибке — единственное, что
    руководитель может увидеть.
    """
    _script(stepan, [_tool_call("инструмента_с_таким_именем_нет", "{}")])

    from shared import stepan_tools

    async def fake_remote(name, params=None):
        return {"status": "error", "error": "витрина недоступна"}

    stepan.setattr(stepan_tools, "execute_remote", fake_remote)

    message = FakeMessage()
    await assistant._process_brain(message, message.text, state=None)

    assert message.answers
    assert any("витрина недоступна" in a for a in message.answers)
