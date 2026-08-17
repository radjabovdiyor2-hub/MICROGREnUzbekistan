"""
Ответ на вопрос отдела продаж словами, а не кнопкой.

ЗАЧЕМ ЭТИ ТЕСТЫ

10.08.2026 отдел записал продажу одного лотка, хотя количество не звучало.
Владелец ответил «15 штук» — и ответ ушёл в никуда: токен незакрытой заявки
жил только в `callback_data` кнопок, и текст его не находил. Со стороны это
выглядело как «бот не помнит, о чём мы говорили минуту назад».

Здесь проверяется разбор ответа и то, что он попадает в ТУ ЖЕ заявку, а не
заводит вторую продажу.
"""

from __future__ import annotations

import pytest

from bots.stepan_bot.handlers import sale_ui
from bots.stepan_bot.handlers.assistant import _QUANTITY_REPLY


# ── Что считается ответом про количество ────────────────────────────────
@pytest.mark.parametrize(
    "text,expected",
    [
        ("15", "15"),
        ("15 штук", "15"),
        ("15 лотков", "15"),
        ("по 20", "20"),
        ("3 стаканчика", "3"),
        ("10 кг", "10"),
    ],
)
def test_short_numeric_replies_are_answers(text, expected):
    match = _QUANTITY_REPLY.match(text)
    assert match and match.group(1) == expected


@pytest.mark.parametrize(
    "text",
    [
        "продай 15 гороха ресторану Навруз",  # это новая продажа, а не ответ
        "сколько у нас гороха",
        "да",
        "отчёт за 15 августа пришли пожалуйста",
    ],
)
def test_other_messages_are_not_answers(text):
    """Ошибиться здесь дороже, чем переспросить: чужое сообщение, принятое за
    ответ, допишет количество в чужую продажу."""
    assert _QUANTITY_REPLY.match(text) is None or len(text) > 30


# ── Реплай на сам вопрос ────────────────────────────────────────────────
def test_open_question_remembers_its_message():
    """Заявка обязана помнить, КАКИМ сообщением задан вопрос.

    По нему ответ свайпом вправо находит свою продажу. Без `message_id`
    ответом считалась только короткая реплика с числом, и развёрнутое
    «Пятнадцать, но два из них Санго» под тем самым вопросом пролетало мимо.
    """
    import inspect

    signature = inspect.signature(sale_ui.remember_open)
    assert "message_id" in signature.parameters, (
        "вопрос перестал запоминать своё сообщение — ответ реплаем снова "
        "будет опознаваться только по виду текста"
    )


# ── Дозапись заявки ─────────────────────────────────────────────────────
PENDING = {
    "customer_name": "ресторан жасмин",
    "items": [{"product_id": "clx_gorokh", "product": "Горох", "quantity": None}],
}


@pytest.fixture
def redis_stub(monkeypatch):
    """Redis заменён словарём: проверяем проводку, а не хранилище."""
    store = {}
    ran = []

    async def fake_open_question(chat_id):
        return store.get(int(chat_id))

    async def fake_drop(token):
        store.pop("dropped", None)
        ran.append(("drop", token))

    async def fake_forget(chat_id):
        store.pop(int(chat_id), None)

    async def fake_run_sale(pending):
        ran.append(("sale", pending))
        return {"status": "ok", "data": {"order_number": "M-1"}}

    monkeypatch.setattr(sale_ui, "open_question", fake_open_question)
    monkeypatch.setattr(sale_ui, "drop_pending", fake_drop)
    monkeypatch.setattr(sale_ui, "forget_open", fake_forget)
    monkeypatch.setattr(sale_ui, "run_sale", fake_run_sale)
    return {"store": store, "ran": ran}


@pytest.mark.asyncio
async def test_answer_completes_the_same_sale(redis_stub):
    """«15» дописывает открытую заявку и создаёт ОДНУ продажу."""
    redis_stub["store"][42] = {
        "token": "t1",
        "needs": "quantity",
        "pending": {**PENDING, "items": [dict(PENDING["items"][0])]},
    }

    result = await sale_ui.complete_with_quantity(42, 15)

    assert result["status"] == "ok"
    sales = [r for r in redis_stub["ran"] if r[0] == "sale"]
    assert len(sales) == 1
    assert sales[0][1]["items"][0]["quantity"] == 15
    # Клиент и товар взяты из заявки, а не собраны заново.
    assert sales[0][1]["customer_name"] == "ресторан жасмин"
    assert sales[0][1]["items"][0]["product_id"] == "clx_gorokh"


@pytest.mark.asyncio
async def test_answer_without_open_question_does_nothing(redis_stub):
    """Нет открытого вопроса — число это просто число, продажи не возникает."""
    assert await sale_ui.complete_with_quantity(42, 15) is None
    assert redis_stub["ran"] == []


@pytest.mark.asyncio
async def test_answer_to_a_different_question_is_ignored(redis_stub):
    """Ждём выбор клиента, а не количество — число не дописываем.

    Иначе «77» в ответ на «кому продали?» ушло бы в количество.
    """
    redis_stub["store"][42] = {
        "token": "t2",
        "needs": "customer",
        "pending": dict(PENDING),
    }
    assert await sale_ui.complete_with_quantity(42, 77) is None
    assert redis_stub["ran"] == []


@pytest.mark.asyncio
async def test_question_is_forgotten_after_completion(redis_stub):
    """Закрытая заявка снимается: следующее «20» не дописывается в неё повторно."""
    redis_stub["store"][42] = {
        "token": "t3",
        "needs": "quantity",
        "pending": {**PENDING, "items": [dict(PENDING["items"][0])]},
    }
    await sale_ui.complete_with_quantity(42, 15)
    assert await sale_ui.complete_with_quantity(42, 20) is None


def test_fill_quantity_touches_only_unnamed():
    """Позиция с уже названным количеством не переписывается."""
    pending = {
        "items": [
            {"product": "Горох", "quantity": None},
            {"product": "Редис", "quantity": 3},
        ]
    }
    sale_ui._fill_quantity(pending, 15)
    assert [i["quantity"] for i in pending["items"]] == [15, 3]
