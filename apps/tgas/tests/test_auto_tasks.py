"""
Автосоздание задач: что заводится само, а что владельцу больше не приходит.

ЗАЧЕМ ЭТИ ТЕСТЫ

`auto_task_creation` заводила задачу «Пополнить <товар>» НА КАЖДЫЙ товар с
низким остатком и по каждой публиковала TASK_CREATED. Событие будит Стёпана,
тот прогоняет полный цикл с моделью и шлёт два сообщения. При 34 позициях
каталога с нулевым остатком это 69 сообщений и 34 вызова модели за прогон,
четыре раза в сутки — та самая лавина, которую увидел владелец.

Задача при этом невыполнима: пополнить готовый товар нечем, пополнение идёт
посадкой. Ветку убрали, сигнал остался строкой в утренней сводке.

Ветка зависших заказов осталась — их единицы, и с ними есть что делать. Но
теперь она идёт через `tasks_repo.create`: прежний сырой INSERT не давал ни
дедлайна, ни защиты от дублей, то есть задача не попадала в сводку просрочки
никогда.
"""

from __future__ import annotations

import datetime as dt
from contextlib import asynccontextmanager

import pytest


class FakeResult:
    def __init__(self, rows=None):
        self._rows = rows or []

    def fetchall(self):
        return self._rows

    def scalar(self):
        return 1


class FakeSession:
    def __init__(self, results):
        self.results = list(results)
        self.statements = []

    async def execute(self, statement, params=None):
        self.statements.append(str(statement))
        return self.results.pop(0) if self.results else FakeResult()

    async def commit(self):
        pass


class FakeBot:
    def __init__(self):
        self.messages = []

    async def send_message(self, chat_id, text, **kwargs):
        self.messages.append(text)


@pytest.fixture
def office(monkeypatch):
    """Подменяет базу, бота и tasks_repo; отдаёт перехваченное."""
    import bots.stepan_bot.main as stepan
    from shared import tasks_repo

    state = {"results": [], "created": [], "bot": FakeBot()}

    @asynccontextmanager
    async def fake_ctx():
        yield FakeSession(state["results"])

    async def fake_create(**kwargs):
        state["created"].append(kwargs)
        return {"ok": True, "task_id": len(state["created"]), "dispatched": True}

    monkeypatch.setattr(stepan, "get_session_ctx", fake_ctx)
    monkeypatch.setattr(stepan, "_bot", state["bot"])
    monkeypatch.setattr(tasks_repo, "create", fake_create)
    monkeypatch.setattr(
        stepan.settings, "admin_telegram_ids", [42], raising=False
    )
    return state


@pytest.mark.asyncio
async def test_nothing_to_do_means_no_messages(office):
    """Нет зависших заказов — нет ни задач, ни сообщений.

    Каким бы ни был каталог: остатки эту функцию больше не касаются, и это
    проверяет соседний тест по самому SQL.
    """
    import bots.stepan_bot.main as stepan

    office["results"] = [FakeResult(rows=[])]

    await stepan.auto_task_creation()

    assert office["created"] == []
    assert office["bot"].messages == []


@pytest.mark.asyncio
async def test_stock_is_never_asked_about(office, monkeypatch):
    """Запроса к остаткам здесь больше нет вовсе.

    Проверяем не только результат, но и сам SQL: вернуть ветку «остаток < 3»
    и снова начать заводить по задаче на товар — ровно та регрессия, ради
    которой этот файл и написан.
    """
    import bots.stepan_bot.main as stepan

    office["results"] = [FakeResult(rows=[])]
    seen = []

    @asynccontextmanager
    async def spy_ctx():
        session = FakeSession(office["results"])
        yield session
        seen.extend(session.statements)

    monkeypatch.setattr(stepan, "get_session_ctx", spy_ctx)
    await stepan.auto_task_creation()

    joined = " ".join(seen).lower()
    assert "crm_products" not in joined
    assert "stock_qty" not in joined


@pytest.mark.asyncio
async def test_stale_order_becomes_one_task_with_deadline(office):
    """Зависший заказ по-прежнему заводит задачу — и уже с дедлайном.

    Без дедлайна задача не попадёт в сводку просрочки НИКОГДА: сводка ищет
    `deadline < CURRENT_DATE`. Прежний сырой INSERT дедлайна не ставил.
    """
    import bots.stepan_bot.main as stepan

    office["results"] = [
        FakeResult(rows=[(77, dt.datetime(2026, 8, 9, 10, 30))])
    ]

    await stepan.auto_task_creation()

    assert len(office["created"]) == 1
    task = office["created"][0]
    assert "77" in task["title"]
    assert task["department"] == "sales"
    assert task["deadline_days"] == 1
    assert task["priority"] == "high"
    # Сводка владельцу — одна, а не по сообщению на задачу.
    assert len(office["bot"].messages) == 1
