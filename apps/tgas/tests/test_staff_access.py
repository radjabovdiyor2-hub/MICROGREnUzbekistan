"""
Кого Стёпан слушает в рабочей группе и что ему при этом можно.

ЗАЧЕМ ЭТИ ТЕСТЫ

16.08.2026 бот спросил про тёзку клиента, менеджер ответил «Нет» — и ответ был
отброшен молча: в `brain` стояло `if not is_admin(...): return`. Ни ответа, ни
отказа; при этом оркестратор ставил 👍, как будто распоряжение выполнено.

Теперь сотрудник рабочей группы услышан, но права владельца не расширены:
клиенты и каталог — можно, задачи, деньги и рассылки — нет. Ограничение задано
НАБОРОМ ИНСТРУМЕНТОВ, потому что просьбу в промпте модель может обойти.
"""

from __future__ import annotations

import types

import pytest

from bots.stepan_bot.handlers import assistant
from shared.config import settings


OWNER_ID = 1
STAFF_ID = 777
SALES_GROUP = -1001234567890


def _message(user_id: int, chat_id: int, chat_type: str = "supergroup"):
    return types.SimpleNamespace(
        text="есть такой клиент?",
        voice=None,
        chat=types.SimpleNamespace(id=chat_id, type=chat_type),
        from_user=types.SimpleNamespace(id=user_id, username="u"),
        bot=types.SimpleNamespace(id=1000),
        reply_to_message=None,
    )


@pytest.fixture
def group(monkeypatch):
    monkeypatch.setattr(assistant, "ADMIN_IDS", [OWNER_ID])
    monkeypatch.setattr(settings, "sales_group_id", SALES_GROUP)
    return monkeypatch


def test_owner_is_heard_everywhere(group):
    assert assistant.may_command(_message(OWNER_ID, -999, "group"))
    assert assistant.may_command(_message(OWNER_ID, OWNER_ID, "private"))


def test_staff_is_heard_in_the_work_group(group):
    """Ответ менеджера в группе «Продажа» больше не пропадает."""
    assert assistant.may_command(_message(STAFF_ID, SALES_GROUP))


def test_stranger_elsewhere_is_ignored(group):
    """Бот руководителя — не открытая приёмная: чужой чат и личка молчат."""
    assert not assistant.may_command(_message(STAFF_ID, -555))
    assert not assistant.may_command(_message(STAFF_ID, STAFF_ID, "private"))


def test_no_group_configured_means_owner_only(monkeypatch):
    """`sales_group_id` не задан — прежнее поведение, без случайных прав."""
    monkeypatch.setattr(assistant, "ADMIN_IDS", [OWNER_ID])
    monkeypatch.setattr(settings, "sales_group_id", 0)
    assert not assistant.may_command(_message(STAFF_ID, 0))
    assert not assistant.may_command(_message(STAFF_ID, SALES_GROUP))


# ── Набор инструментов сотрудника ───────────────────────────────────────
def _schema(name: str):
    return {"type": "function", "function": {"name": name, "description": name}}


@pytest.fixture
def brain_probe(monkeypatch):
    """Прогон `_process_brain` с перехватом того, ЧТО получила модель."""
    seen: dict = {}

    async def noop(*args, **kwargs):
        return None

    async def empty_str(*args, **kwargs):
        return ""

    monkeypatch.setattr(assistant, "set_reaction", noop)
    monkeypatch.setattr(assistant, "simulate_typing", noop)
    monkeypatch.setattr(assistant, "_get_db_context", noop)
    monkeypatch.setattr(assistant, "_open_sale_prompt", empty_str)
    monkeypatch.setattr(assistant, "_open_customer_prompt", empty_str)
    monkeypatch.setattr(assistant, "_answer_open_sale_question", noop)
    monkeypatch.setattr(assistant, "_answer_open_customer_question", noop)
    monkeypatch.setattr(assistant, "ADMIN_IDS", [OWNER_ID])
    monkeypatch.setattr(settings, "sales_group_id", SALES_GROUP)

    from shared import assistant_memory, stepan_tools

    monkeypatch.setattr(assistant_memory, "load_context", noop)
    monkeypatch.setattr(assistant_memory, "append", noop)

    async def registry(runtime="tg"):
        return [
            _schema("find_customer"),
            _schema("add_customer"),
            _schema("create_task"),
            _schema("change_product_price"),
            _schema("broadcast"),
        ]

    monkeypatch.setattr(stepan_tools, "load_registry", registry)

    async def chat_with_tools(system_prompt, user_message, tools, **kwargs):
        seen["tools"] = [t["function"]["name"] for t in tools]
        seen["prompt"] = system_prompt
        return types.SimpleNamespace(content="Готово.", tool_calls=None)

    monkeypatch.setattr(
        assistant,
        "ai",
        types.SimpleNamespace(
            chat_with_tools=chat_with_tools, chat_completion=None, generate_speech=None
        ),
    )
    return seen


class _Msg:
    def __init__(self, user_id: int):
        self.text = "есть такой клиент?"
        self.voice = None
        self.answers: list[str] = []
        self.chat = types.SimpleNamespace(id=SALES_GROUP, type="supergroup")
        self.from_user = types.SimpleNamespace(id=user_id, username="u")
        self.bot = types.SimpleNamespace(id=1000)
        self.reply_to_message = None

    async def answer(self, text, **kwargs):
        self.answers.append(str(text))
        return types.SimpleNamespace(message_id=1)

    async def answer_voice(self, *args, **kwargs):
        pass


@pytest.mark.asyncio
async def test_staff_gets_customers_but_not_money(brain_probe):
    """Сотруднику — клиенты и каталог; задачи, цены и рассылки недоступны."""
    message = _Msg(STAFF_ID)
    await assistant._process_brain(message, message.text, state=None)

    assert brain_probe["tools"] == ["find_customer", "add_customer"], (
        "сотрудник получил инструменты, которых ему не давали"
    )
    assert message.answers, "сотруднику ответили тишиной"


@pytest.mark.asyncio
async def test_owner_keeps_every_tool(brain_probe):
    message = _Msg(OWNER_ID)
    await assistant._process_brain(message, message.text, state=None)

    assert "create_task" in brain_probe["tools"]
    assert "broadcast" in brain_probe["tools"]
