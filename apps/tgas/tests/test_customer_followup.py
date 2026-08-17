"""
Ответ «Нет» на вопрос о тёзке клиента — словами и реплаем.

ЗАЧЕМ ЭТИ ТЕСТЫ

16.08.2026 бот спросил «Похоже, «Nozi» уже есть… это он?», менеджер ответил
реплаем «Нет» — и ответ пропал. Состояния вопроса не существовало вовсе, кнопок
не было, а единственным работающим ответом считалось слово `force_new`, которого
человек не напишет никогда. Клиент не завёлся.

Здесь проверяется, что короткий ответ доходит до той самой заявки и заводит
карточку, а чужая реплика ответом не считается.
"""

from __future__ import annotations

import types

import pytest

from bots.stepan_bot.handlers import assistant, customer_ui


PENDING = {
    "params": {"name": "Nozi", "phone": "+998975773203", "customer_type": "b2b"},
    "candidates": [{"id": 28, "name": "Noxat", "phone": "+998907776655"}],
}


class FakeMessage:
    def __init__(self, text: str, reply_to_id: int | None = None):
        self.text = text
        self.voice = None
        self.answers: list[str] = []
        self.chat = types.SimpleNamespace(id=42, type="supergroup")
        self.from_user = types.SimpleNamespace(id=777, username="amir")
        self.bot = types.SimpleNamespace(id=1000)
        self.reply_to_message = (
            types.SimpleNamespace(message_id=reply_to_id) if reply_to_id else None
        )

    async def answer(self, text, **kwargs):
        self.answers.append(str(text))
        return types.SimpleNamespace(message_id=555)


@pytest.fixture
def open_customer_question(monkeypatch):
    """Незакрытый вопрос о клиенте без Redis: проверяем проводку, не хранилище."""
    state = {"question": {"token": "t1", "message_id": 500, "pending": PENDING}}
    calls: list[tuple] = []

    async def open_question(chat_id):
        return state["question"]

    async def drop_pending(token):
        calls.append(("drop", token))

    async def forget_open(chat_id):
        state["question"] = None

    async def run_add_customer(params):
        calls.append(("add", params))
        return {
            "ok": True,
            "created": True,
            "customer_id": 30,
            "summary": "Клиент «Nozi» заведён в CRM (#30).",
        }

    async def upsert(**kwargs):
        calls.append(("upsert", kwargs))
        return {"id": 28, "name": "Noxat"}

    monkeypatch.setattr(customer_ui, "open_question", open_question)
    monkeypatch.setattr(customer_ui, "drop_pending", drop_pending)
    monkeypatch.setattr(customer_ui, "forget_open", forget_open)
    monkeypatch.setattr(customer_ui, "run_add_customer", run_add_customer)

    from shared import customer_repo

    monkeypatch.setattr(customer_repo, "upsert", upsert)
    return {"calls": calls, "state": state}


@pytest.mark.parametrize("reply", ["Нет", "нет", "yo'q", "новый", "другой", "Yangi"])
@pytest.mark.asyncio
async def test_no_creates_the_card(open_customer_question, reply):
    """«Нет» на всех трёх языках группы заводит отдельную карточку."""
    message = FakeMessage(reply)
    said = await assistant._answer_open_customer_question(message, reply)

    calls = open_customer_question["calls"]
    added = [c for c in calls if c[0] == "add"]
    assert added, f"ответ «{reply}» не завёл клиента"
    assert added[0][1]["force_new"] is True
    assert added[0][1]["name"] == "Nozi", "данные заявки потерялись"
    assert said and "#30" in "".join(message.answers)


@pytest.mark.parametrize("reply", ["Да", "да", "ha", "это он"])
@pytest.mark.asyncio
async def test_yes_keeps_the_existing_card(open_customer_question, reply):
    """«Да» дописывает известное в старую карточку и НЕ заводит вторую."""
    message = FakeMessage(reply)
    await assistant._answer_open_customer_question(message, reply)

    calls = open_customer_question["calls"]
    assert not [c for c in calls if c[0] == "add"], "завелась вторая карточка"
    upserts = [c for c in calls if c[0] == "upsert"]
    assert upserts and upserts[0][1]["customer_id"] == 28
    # Телефон из распоряжения не теряется: в старой карточке его могло не быть.
    assert upserts[0][1]["raw_phone"] == "+998975773203"


@pytest.mark.parametrize(
    "reply",
    [
        "зарегистрируй продажу 10 гороха ресторану Навруз",
        "сколько у нас сегодня заказов",
        "нет времени сейчас, давай позже посмотрим отчёт по марже",
    ],
)
@pytest.mark.asyncio
async def test_other_messages_are_not_answers(open_customer_question, reply):
    """Чужая реплика не должна закрывать вопрос: она о другом.

    Ошибка здесь дороже переспроса — клиент привяжется не к той карточке.
    """
    message = FakeMessage(reply)
    said = await assistant._answer_open_customer_question(message, reply)

    assert said is None
    assert not open_customer_question["calls"]


@pytest.mark.asyncio
async def test_reply_by_swipe_counts_even_when_wordy(open_customer_question):
    """Реплай на ТОТ вопрос — уже адрес: длина реплики больше не мешает.

    Без этого «Нет, это другой ресторан, у них свой номер» пролетало мимо
    заявки: перехват брал только реплики короче тридцати символов.
    """
    text = "Нет"
    message = FakeMessage(text, reply_to_id=500)
    await assistant._answer_open_customer_question(message, text)

    assert [c for c in open_customer_question["calls"] if c[0] == "add"]


@pytest.mark.asyncio
async def test_no_open_question_means_no_interception(monkeypatch):
    """Нет открытого вопроса — «да» это обычная реплика, а не команда."""

    async def nothing(chat_id):
        return None

    monkeypatch.setattr(customer_ui, "open_question", nothing)
    message = FakeMessage("да")
    assert await assistant._answer_open_customer_question(message, "да") is None


@pytest.mark.asyncio
async def test_ambiguous_yes_asks_to_press_a_button(monkeypatch):
    """«Да» при нескольких кандидатах — не выбор, а повод уточнить.

    Угадать здесь нельзя: заказы и долги уйдут не тому клиенту, а заметят это
    на сверке, то есть месяцем позже.
    """
    two = {
        "params": {"name": "Жасмин", "phone": ""},
        "candidates": [{"id": 7, "name": "Жасмин"}, {"id": 9, "name": "Жасмина"}],
    }

    async def open_question(chat_id):
        return {"token": "t2", "message_id": 501, "pending": two}

    monkeypatch.setattr(customer_ui, "open_question", open_question)

    result = await customer_ui.confirm_existing(42)
    assert result["ok"] is False
    assert "кнопкой" in result["error"]
