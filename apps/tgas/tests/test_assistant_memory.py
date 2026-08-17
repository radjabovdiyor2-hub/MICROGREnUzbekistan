"""
Стёпан обязан помнить, что сам сказал минуту назад.

ЗАЧЕМ ЭТИ ТЕСТЫ

`_remember` стоял только на быстрых перехватах (показ поста, статус, совещание).
Главный путь — ответ модели и ответ с вызовом инструмента — писал историю ТОЛЬКО
в FSM, а в начале обработки общая память её перетирала:
`if shared_history: history = shared_history`.

Итог: собственный вопрос «Похоже, «Nozi» уже есть — это он?» не сохранялся
нигде. Следующее «Нет» приходило к модели как реплика ни о чём, и разговор
начинался с нуля — то самое «бот не помнит, о чём мы говорили».
"""

from __future__ import annotations

import types

import pytest

from bots.stepan_bot.handlers import assistant


# ── Склейка историй ─────────────────────────────────────────────────────
def test_local_only_turns_survive_the_merge():
    """То, что попало лишь в FSM, не должно исчезать при чтении общей нити."""
    shared = [{"role": "user", "content": "как дела"}]
    local = [
        {"role": "user", "content": "как дела"},  # то же самое — не дублируем
        {"role": "assistant", "content": "Похоже, «Nozi» уже есть — это он?"},
    ]

    merged = assistant._merge_history(shared, local)

    assert [m["content"] for m in merged] == [
        "как дела",
        "Похоже, «Nozi» уже есть — это он?",
    ]


def test_merge_keeps_only_the_tail():
    """Историю режем по лимиту: в промпт не должно уезжать полотно."""
    shared = [{"role": "user", "content": str(i)} for i in range(30)]
    merged = assistant._merge_history(shared, [], limit=5)
    assert [m["content"] for m in merged] == ["25", "26", "27", "28", "29"]


# ── Реплай как адрес ────────────────────────────────────────────────────
def _message(text="Нет", quoted=None, quoted_from_bot=False):
    bot_id = 1000
    reply = None
    if quoted is not None:
        author = types.SimpleNamespace(
            id=bot_id if quoted_from_bot else 55, full_name="Амир"
        )
        reply = types.SimpleNamespace(
            text=quoted, caption=None, message_id=500, from_user=author
        )
    message = types.SimpleNamespace(
        text=text,
        voice=None,
        chat=types.SimpleNamespace(id=42, type="supergroup"),
        from_user=types.SimpleNamespace(id=1, username="owner"),
        bot=types.SimpleNamespace(id=bot_id),
        reply_to_message=reply,
    )
    return message


def test_reply_to_our_own_message_becomes_context():
    block = assistant._reply_context(_message(quoted="Это он?", quoted_from_bot=True))
    assert "ОТВЕЧАЕТ НА ТВОЁ СООБЩЕНИЕ" in block
    assert "Это он?" in block


def test_reply_to_a_colleague_is_quoted_too():
    block = assistant._reply_context(_message(quoted="Ресторан NOZI новый клиент"))
    assert "ЦИТИРУЕТ" in block and "Амир" in block


def test_no_reply_no_block():
    assert assistant._reply_context(_message()) == ""


# ── Главный путь пишет в память ─────────────────────────────────────────
class FakeMessage:
    def __init__(self, text: str, user_id: int = 1, chat_type: str = "private"):
        self.text = text
        self.voice = None
        self.answers: list[str] = []
        self.chat = types.SimpleNamespace(id=42, type=chat_type)
        self.from_user = types.SimpleNamespace(id=user_id, username="owner")
        self.bot = types.SimpleNamespace(id=1000)
        self.reply_to_message = None

    async def answer(self, text, **kwargs):
        self.answers.append(str(text))
        return types.SimpleNamespace(message_id=1)

    async def answer_voice(self, *args, **kwargs):
        pass


@pytest.fixture
def stepan(monkeypatch):
    """Стёпан без сети и базы; записи в общую память складываем в список."""
    written: list[tuple[str, str]] = []
    scopes: list = []

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
    monkeypatch.setattr(assistant, "ADMIN_IDS", [1])

    from shared import assistant_memory, stepan_tools

    async def load_context(limit=20, scope=None):
        scopes.append(("load", scope))
        return []

    async def append(role, content, tool_calls=None, scope=None):
        written.append((role, content))
        scopes.append(("append", scope))
        return True

    monkeypatch.setattr(assistant_memory, "load_context", load_context)
    monkeypatch.setattr(assistant_memory, "append", append)

    async def no_remote(runtime="tg"):
        return []

    monkeypatch.setattr(stepan_tools, "load_registry", no_remote)
    return {"written": written, "scopes": scopes, "monkeypatch": monkeypatch}


def _script(monkeypatch, calls, content=""):
    async def chat_with_tools(*args, **kwargs):
        return types.SimpleNamespace(content=content, tool_calls=calls)

    monkeypatch.setattr(
        assistant,
        "ai",
        types.SimpleNamespace(
            chat_with_tools=chat_with_tools,
            chat_completion=None,
            generate_speech=None,
        ),
    )


@pytest.mark.asyncio
async def test_plain_answer_is_remembered(stepan):
    _script(stepan["monkeypatch"], calls=None, content="Выручка за сегодня — 1 200 000.")

    message = FakeMessage("сколько выручки")
    await assistant._process_brain(message, message.text, state=None)

    assert stepan["written"] == [
        ("user", "сколько выручки"),
        ("assistant", "Выручка за сегодня — 1 200 000."),
    ]


@pytest.mark.asyncio
async def test_question_about_a_namesake_is_remembered(stepan):
    """Ветка с инструментом — та самая, которая не писала в память ничего."""
    call = types.SimpleNamespace(
        function=types.SimpleNamespace(
            name="add_customer", arguments='{"name": "Nozi", "phone": "+998975773203"}'
        )
    )
    _script(stepan["monkeypatch"], calls=[call])

    candidates = [{"id": 28, "name": "Noxat", "phone": "+998907776655"}]

    async def fake_call(name, args):
        return {
            "ok": False,
            "needs": "confirmation",
            "candidates": candidates,
            "error": "«Nozi» похож на то, что уже есть в CRM",
            "data": {
                "needs": "customer_confirm",
                "candidates": candidates,
                "pending": {"name": "Nozi", "phone": "+998975773203"},
            },
        }

    stepan["monkeypatch"].setattr(assistant.tool_registry, "call", fake_call)

    # Заявка в Redis здесь не проверяется — проверяется память разговора.
    from bots.stepan_bot.handlers import customer_ui

    async def save_pending(payload):
        return "tok"

    async def remember_open(chat_id, token, message_id):
        return None

    stepan["monkeypatch"].setattr(customer_ui, "save_pending", save_pending)
    stepan["monkeypatch"].setattr(customer_ui, "remember_open", remember_open)

    message = FakeMessage("зарегистрируй нового клиента Nozi +998975773203")
    await assistant._process_brain(message, message.text, state=None)

    assert message.answers, "вопрос о тёзке не дошёл до чата"
    roles = [r for r, _ in stepan["written"]]
    assert roles == ["user", "assistant"], (
        "ответ с вызовом инструмента снова не попал в память — следующее «Нет» "
        "придёт к модели без вопроса, на который отвечают"
    )
    assert "Noxat" in stepan["written"][1][1]


@pytest.mark.asyncio
async def test_empty_model_answer_is_not_silence(stepan):
    """Модель ничего не сказала — бот всё равно отвечает, а не молчит."""
    _script(stepan["monkeypatch"], calls=None, content="")

    message = FakeMessage("...")
    await assistant._process_brain(message, message.text, state=None)

    assert message.answers, "бот промолчал — для человека это «не понял и не ответил»"


@pytest.mark.asyncio
async def test_staff_reply_does_not_go_into_the_owner_thread(stepan):
    """Реплика сотрудника не выдаётся за слова владельца.

    Нить в базе ключуется владельцем (`AssistantConversation.ownerKey`), и
    чужие сообщения в ней читались бы как его собственные.
    """
    _script(stepan["monkeypatch"], calls=None, content="Клиент есть в CRM.")

    message = FakeMessage("есть такой клиент?", user_id=777)  # не администратор
    await assistant._process_brain(message, message.text, state=None)

    assert message.answers, "сотруднику не ответили"
    assert stepan["written"] == [], "чужая реплика попала в нить владельца"


# ── Комната разговора ───────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_private_chat_uses_the_owner_thread(stepan):
    """Личка и веб-админка — один разговор одного человека."""
    _script(stepan["monkeypatch"], calls=None, content="Готово.")

    message = FakeMessage("что там по заказам")
    await assistant._process_brain(message, message.text, state=None)

    assert {s for _, s in stepan["scopes"]} == {None}


@pytest.mark.asyncio
async def test_group_chat_gets_its_own_thread(stepan):
    """У рабочей группы своя нить: её реплики не всплывают в личке владельца.

    Пока нить была одна на всё, вопрос бота в группе «Продажа» и переписка
    владельца в личке лежали вперемешку, и модель отвечала репликой из
    соседнего разговора.
    """
    _script(stepan["monkeypatch"], calls=None, content="Готово.")

    message = FakeMessage("что там по заказам", chat_type="supergroup")
    await assistant._process_brain(message, message.text, state=None)

    assert {s for _, s in stepan["scopes"]} == {"chat42"}
