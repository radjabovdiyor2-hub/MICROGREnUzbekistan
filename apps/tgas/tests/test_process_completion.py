"""
Процесс не обрывается молча.

ЗАЧЕМ ЭТИ ТЕСТЫ

Три места офиса начинали работу и не доводили её до конца, причём каждое —
без единого следа, по которому это можно заметить:

  • follow-up клиенту БЕЗ Telegram: строка `if not tg_id: continue` означала,
    что запись остаётся `pending` и выбирается каждые полчаса вечно. При
    этом `create_followup` ищет клиента по телефону, то есть штатно заводит
    касания тем, у кого Telegram и нет;

  • кнопка «Выполнено» только публиковала событие, а статус в базе менял
    единственный обработчик — у Стёпана. Стёпан лежит (выкат, перезапуск) —
    нажатие пропадает: Redis Pub/Sub не переигрывает пропущенное, а
    `retry_stuck_tasks` берёт только `todo`. Владелец видел «Отмечено как
    выполненное», а закрытой задачу не считал никто;

  • задача из PM-меню заводилась сырым INSERT без `deadline`. Дайджест
    просрочки ключуется по `deadline < CURRENT_DATE`, поэтому такая задача
    не попадала в него НИКОГДА.

Общее у всех трёх — «сделано» на экране при несделанном в системе. Поэтому
проверяется не текст ответа, а факт: осталась ли работа кому-то поручена.
"""

from __future__ import annotations

import types

import pytest


async def _fail_if_called(*args, **kwargs):
    raise AssertionError("этот путь не должен был вызываться")


def _session_stub(rows, recorder):
    """Сессия, которая отдаёт `rows` на SELECT и запоминает UPDATE/INSERT."""

    class FakeResult:
        def __init__(self, data):
            self._data = data

        def fetchall(self):
            return self._data

    class FakeSession:
        async def execute(self, statement, params=None):
            sql = str(statement)
            if "SELECT" in sql and "followups" in sql:
                return FakeResult(rows)
            recorder.append((sql, params or {}))
            return FakeResult([])

        async def commit(self):
            return None

    class Ctx:
        async def __aenter__(self):
            return FakeSession()

        async def __aexit__(self, *exc):
            return False

    return lambda: Ctx()


class _FakeMessage:
    def __init__(self):
        self.chat = types.SimpleNamespace(id=42)
        self.html_text = "Задача"
        self.texts: list[str] = []

    async def edit_text(self, text, **kwargs):
        self.texts.append(str(text))

    async def answer(self, text, **kwargs):
        self.texts.append(str(text))


def _callback(data: str):
    class FakeCallback:
        def __init__(self):
            self.data = data
            self.answers: list[str] = []
            self.from_user = types.SimpleNamespace(
                id=1, username="owner", first_name="Владелец"
            )
            self.message = _FakeMessage()
            self.bot = types.SimpleNamespace(get_me=self._get_me)

        async def _get_me(self):
            return types.SimpleNamespace(username="MG_PM1_bot")

        async def answer(self, text="", **kwargs):
            self.answers.append(str(text))

    return FakeCallback()


class _FakeState:
    def __init__(self, data):
        self._data = data

    async def get_data(self):
        return self._data

    async def set_state(self, state):
        return None

    async def clear(self):
        self._data = {}


# ── follow-up: недостижимый клиент становится звонком, а не тишиной ──────


@pytest.mark.asyncio
async def test_followup_without_telegram_becomes_a_call(monkeypatch):
    from bots.stepan_bot import main as stepan

    reached: list[str] = []
    human_tasks: list[str] = []
    updates: list[tuple] = []

    async def fake_reach(bot, cust, message):
        # Ни Telegram, ни почты — ровно тот случай, который выпадал.
        reached.append(str(cust.get("id")))
        return "need_call"

    async def fake_human_task(title, description, dept="sales"):
        human_tasks.append(title)
        return 101

    monkeypatch.setattr("shared.capabilities._reach", fake_reach)
    monkeypatch.setattr("shared.capabilities._create_human_task", fake_human_task)
    monkeypatch.setattr(
        stepan,
        "get_session_ctx",
        _session_stub(
            rows=[
                (7, "Пора повторить заказ", 55, None, None, "Плов Центр", "+998901112233")
            ],
            recorder=updates,
        ),
    )

    await stepan.check_followups()

    assert reached == ["55"], "лестница каналов не сработала"
    assert human_tasks, "клиент недостижим, но звонить никто не поручил"
    statuses = [p.get("st") for sql, p in updates if "UPDATE followups" in sql]
    assert statuses == ["need_call"], (
        f"строка осталась в pending и будет выбираться вечно: {statuses}"
    )


@pytest.mark.asyncio
async def test_followup_delivered_is_marked_sent(monkeypatch):
    """Обратная сторона: доставленное касание закрывается как отправленное."""
    from bots.stepan_bot import main as stepan

    updates: list[tuple] = []

    async def fake_reach(bot, cust, message):
        return "telegram"

    monkeypatch.setattr("shared.capabilities._reach", fake_reach)
    monkeypatch.setattr("shared.capabilities._create_human_task", _fail_if_called)
    monkeypatch.setattr(
        stepan,
        "get_session_ctx",
        _session_stub(
            rows=[
                (8, "Скидка на набор", 56, 12345, None, "Дом Плова", "+998901112244")
            ],
            recorder=updates,
        ),
    )

    await stepan.check_followups()

    statuses = [p.get("st") for sql, p in updates if "UPDATE followups" in sql]
    assert statuses == ["sent"]


# ── кнопка «Выполнено» пишет статус сама ────────────────────────────────


@pytest.mark.asyncio
async def test_done_button_closes_task_without_stepan(monkeypatch):
    from shared import task_ui

    closed: list[tuple] = []

    async def fake_set_status(task_id, status):
        closed.append((task_id, status))
        return True

    monkeypatch.setattr("shared.tasks_repo.set_status", fake_set_status)
    monkeypatch.setattr(task_ui, "is_owner", lambda uid: True)

    published: list[str] = []

    class FakeBus:
        async def publish(self, event, data=None, source=None):
            published.append(event)

    monkeypatch.setattr("shared.event_bus.event_bus", FakeBus())

    cb = _callback("task_done:42")
    await task_ui.on_task_done(cb)

    assert closed == [(42, "done")], (
        "статус пишет не кнопка, а чей-то обработчик события — "
        "при лежащем Стёпане нажатие снова пропадёт"
    )
    assert "TASK_COMPLETED" in published, "событие-извещение перестало уходить"


@pytest.mark.asyncio
async def test_done_button_refuses_for_strangers(monkeypatch):
    """Кнопка живёт в групповых чатах: закрывать чужие задачи нельзя."""
    from shared import task_ui

    monkeypatch.setattr(task_ui, "is_owner", lambda uid: False)
    monkeypatch.setattr("shared.tasks_repo.set_status", _fail_if_called)

    cb = _callback("task_done:42")
    await task_ui.on_task_done(cb)
    assert cb.answers and "владелец" in cb.answers[0].lower()


# ── задача из PM-меню: с дедлайном и через единственную дверь ────────────


@pytest.mark.asyncio
async def test_pm_menu_task_has_deadline(monkeypatch):
    from bots.stepan_bot.handlers import tasks as pm_tasks

    created: list[dict] = []

    async def fake_create(**kwargs):
        created.append(kwargs)
        return {"ok": True, "task_id": 7, "department": "pm", "dispatched": True}

    monkeypatch.setattr("shared.tasks_repo.create", fake_create)

    cb = _callback("pm:yes")
    state = _FakeState(
        {"title": "Закупить субстрат", "description": "20 мешков", "priority": "high"}
    )
    await pm_tasks.confirm_task(cb, state)

    assert created, "задача заведена мимо tasks_repo — как раньше, сырым INSERT"
    assert created[0]["deadline_days"], (
        "без дедлайна задача не попадёт в дайджест просрочки никогда"
    )
    assert created[0]["department"] == "pm"
