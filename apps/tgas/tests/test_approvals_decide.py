"""
Решение заявки из веб-админки.

ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ

Одобрить заявку можно было ТОЛЬКО в Telegram: выполнение живёт в офисе
(`_HANDLERS`), у витрины нет ни инструментов, ни шины. Владелец, сидящий в
админке, видел очередь «Ждёт решения» и мог лишь снять заявку — то есть без
телефона под рукой работа стояла.

`approvals.decide` — общий путь для кнопки в чате и для админки. Проверяем
ровно то, что легко сломать незаметно:

  · заявку нельзя решить дважды (иначе рассылка уйдёт двум адресатам);
  · «одобрено» и «выполнено» — РАЗНЫЕ вещи, и путать их нельзя: инструмент
    отказывает уже после нажатия, и закрывать задачу в этом случае значит
    записать несделанное в сделанное;
  · упавший обработчик не роняет ответ и возвращает задачу в работу.

База подменена заглушкой: проверяется проводка, а не Postgres.
"""

from __future__ import annotations

import pytest

from shared import approvals


@pytest.fixture
def store(monkeypatch):
    """Заявка в единственном экземпляре: второе решение вернёт пусто."""
    state = {"taken": False, "closed": []}

    async def fake_take(approval_id: int, decision: str):
        if state["taken"]:
            return None
        state["taken"] = True
        state["decision"] = decision
        return {
            "kind": state.get("kind", "tool"),
            "payload": {"tool": "get_orders", "args": {}},
            "bot": "sales_bot",
            "chat_id": 777,
            "task_id": 42,
        }

    async def fake_close(task_id, status):
        state["closed"].append((task_id, status))

    monkeypatch.setattr(approvals, "_take_by_id", fake_take)
    monkeypatch.setattr(approvals, "_close_task", fake_close)
    # Запасной бот не нужен и не должен создаваться: токена в тестах нет.
    monkeypatch.setattr(approvals, "_fallback_bot", lambda: None)
    return state


def with_handler(monkeypatch, kind: str, fn):
    monkeypatch.setitem(approvals._HANDLERS, kind, fn)


@pytest.mark.asyncio
async def test_approved_and_done(store, monkeypatch):
    """Обычный путь: действие выполнилось, задача закрыта."""
    async def handler(payload, cb):
        return "Заказы получены."

    with_handler(monkeypatch, "tool", handler)
    result = await approvals.decide(1, "approved")

    assert result["ok"] and result["acted"]
    assert result["message"] == "Заказы получены."
    assert store["closed"] == [(42, "done")]


@pytest.mark.asyncio
async def test_approved_but_not_done_returns_task_to_work(store, monkeypatch):
    """«Одобрено» ≠ «выполнено»: отказ инструмента возвращает задачу в todo.

    Инструмент отказывает уже ПОСЛЕ нажатия — витрина не ответила, данных
    не хватило. Закрыть задачу в этом случае значит записать несделанное
    в сделанное, и она исчезнет из очереди навсегда.
    """
    async def handler(payload, cb):
        return ("Витрина не ответила", False)

    with_handler(monkeypatch, "tool", handler)
    result = await approvals.decide(1, "approved")

    assert result["ok"] is True
    assert result["acted"] is False
    assert store["closed"] == [(42, "todo")]


@pytest.mark.asyncio
async def test_broken_handler_does_not_break_the_answer(store, monkeypatch):
    """Упавший обработчик — это отказ с причиной, а не пятисотка."""
    async def handler(payload, cb):
        raise RuntimeError("шина недоступна")

    with_handler(monkeypatch, "tool", handler)
    result = await approvals.decide(1, "approved")

    assert result["ok"] is True
    assert result["acted"] is False
    assert "шина недоступна" in result["message"]
    assert store["closed"] == [(42, "todo")]


@pytest.mark.asyncio
async def test_unknown_kind_is_reported_not_swallowed(store, monkeypatch):
    """Некому выполнить — говорим об этом, а не притворяемся успехом."""
    store["kind"] = "выдуманный_тип"
    monkeypatch.delitem(approvals._HANDLERS, "выдуманный_тип", raising=False)

    result = await approvals.decide(1, "approved")

    assert result["ok"] is True
    assert result["acted"] is False
    assert "Некому" in result["message"]


@pytest.mark.asyncio
async def test_second_decision_is_refused(store, monkeypatch):
    """Одноразовость: нажатие в админке и в Telegram выполнит действие раз."""
    calls: list[int] = []

    async def handler(payload, cb):
        calls.append(1)
        return "ок"

    with_handler(monkeypatch, "tool", handler)

    first = await approvals.decide(1, "approved")
    second = await approvals.decide(1, "approved")

    assert first["ok"] is True
    assert second["ok"] is False
    assert "уже обработана" in second["message"]
    assert calls == [1], "действие выполнилось дважды"


@pytest.mark.asyncio
async def test_rejected_closes_task_as_cancelled(store, monkeypatch):
    """Отказ снимает задачу, а не оставляет её на повторную попытку.

    Иначе `retry_stuck_tasks` через три часа достанет её и спросит снова —
    ровно то, от чего владелец только что отказался.
    """
    result = await approvals.decide(1, "rejected")

    assert result["ok"] and result["acted"]
    assert store["closed"] == [(42, "cancelled")]


@pytest.mark.asyncio
async def test_unknown_decision_is_refused(store):
    """Чужое слово в решении не должно трогать заявку вовсе."""
    result = await approvals.decide(1, "мнеплевать")

    assert result["ok"] is False
    assert store["taken"] is False, "заявка была забрана негодным решением"
