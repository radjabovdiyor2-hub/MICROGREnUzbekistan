"""
Тесты исполнителя задач и цикла вызова инструментов.

Каждый тест закрывает поломку, которая уже была в этом коде и стоила дорого:
исчезающие при передаче задачи, падение безголовых ботов, рискованные действия
без подтверждения и продажа с дробным количеством.

База и Telegram подменяются заглушками: проверяется проводка, а не Postgres.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

import pytest


# ── Заглушки ────────────────────────────────────────────────────────────
class FakeResult:
    def scalar(self):
        return 1

    def fetchone(self):
        return (0, 0)

    def fetchall(self):
        return []


class FakeSession:
    def __init__(self):
        self.statements = []

    async def execute(self, statement, params=None):
        self.statements.append((str(statement), params))
        return FakeResult()

    async def commit(self):
        pass


@asynccontextmanager
async def fake_session_ctx():
    yield FakeSession()


class FakeToolCall:
    def __init__(self, name, args):
        self.id = f"call_{name}"
        self.type = "function"
        self.function = type(
            "F", (), {"name": name, "arguments": json.dumps(args)}
        )()


class FakeMessage:
    def __init__(self, content=None, calls=None):
        self.content = content
        self.tool_calls = calls or []


class ScriptedAI:
    """Модель по сценарию: отдаёт заранее заданные ответы по кругам."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    async def chat_with_tools(self, system_prompt, user_message, tools, **kwargs):
        self.calls.append({"tools": [t["function"]["name"] for t in tools]})
        return self.script.pop(0) if self.script else FakeMessage(content="Готово.")


class FakeBot:
    def __init__(self):
        self.messages = []

    async def send_message(self, chat_id, text, **kwargs):
        self.messages.append((chat_id, text))

    async def send_photo(self, chat_id, **kwargs):
        self.messages.append((chat_id, "[photo]"))


@pytest.fixture
def patched(monkeypatch):
    """Подменяем базу и шину событий, возвращаем перехваченные события."""
    import shared.database as database
    import shared.task_executor as task_executor
    import shared.tasks_repo as tasks_repo
    import shared.tools.common as common

    published = []

    class FakeBus:
        async def publish(self, event, data, source=None):
            published.append({"event": event, "data": data, "source": source})

    monkeypatch.setattr(database, "get_session_ctx", fake_session_ctx)
    monkeypatch.setattr(common, "get_session_ctx", fake_session_ctx)
    # Статус задачи пишет shared/tasks_repo, а не сам исполнитель: раньше
    # каждый UPDATE стоял по месту, и из-за этого две поломки со статусами
    # прожили в проекте месяцами (см. докстринг tasks_repo).
    monkeypatch.setattr(tasks_repo, "get_session_ctx", fake_session_ctx)
    monkeypatch.setattr(task_executor, "event_bus", FakeBus())
    return published


# ── Делегирование ───────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_delegation_event_is_flat(patched, monkeypatch):
    """Самая дорогая поломка проекта: payload оборачивали дважды.

    `publish(event, data, source)` заворачивает data сам, а получатели
    разворачивают ровно один раз. Лишняя обёртка `{"data": ...}` давала им
    `{"data": {...}}`, отдела в нём не находилось — и задача молча исчезала
    на КАЖДОЙ передаче между отделами.
    """
    import shared.task_executor as task_executor

    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI(
            [
                FakeMessage(
                    calls=[FakeToolCall("delegate_to_department", {"department": "content"})]
                ),
                FakeMessage(content="Это задача контента."),
            ]
        ),
    )

    await task_executor.execute_bot_task(
        bot=FakeBot(),
        bot_name="hr_bot",
        department="hr",
        task_data={"task_id": 7, "title": "прайс", "description": "", "chat_id": 42},
        team_context="ctx",
    )

    events = [e for e in patched if str(e["event"]).lower() == "task_created"]
    assert len(events) == 1
    data = events[0]["data"]
    # Ровно так payload читает КАЖДЫЙ получатель: payload["data"]["department"].
    assert data["department"] == "content"
    assert data["task_id"] == 7
    assert events[0]["source"] == "hr_bot"


@pytest.mark.asyncio
async def test_delegation_counts_hops(patched, monkeypatch):
    """Счётчик передач растёт — иначе отделы гоняли бы задачу по кругу."""
    import shared.task_executor as task_executor

    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI(
            [
                FakeMessage(
                    calls=[FakeToolCall("delegate_to_department", {"department": "sales"})]
                ),
                FakeMessage(content="Передал."),
            ]
        ),
    )
    await task_executor.execute_bot_task(
        bot=FakeBot(),
        bot_name="content_bot",
        department="content",
        task_data={"task_id": 1, "title": "t", "chat_id": 5, "hops": 1},
        team_context="ctx",
    )
    events = [e for e in patched if str(e["event"]).lower() == "task_created"]
    assert events[0]["data"]["hops"] == 2


@pytest.mark.asyncio
async def test_unknown_department_goes_to_chief(patched, monkeypatch):
    """Отдел без исполнителя → руководитель, а не молчаливая потеря."""
    import shared.task_executor as task_executor

    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI(
            [
                FakeMessage(
                    calls=[
                        FakeToolCall("delegate_to_department", {"department": "юриспруденция"})
                    ]
                ),
                FakeMessage(content="Не наше."),
            ]
        ),
    )
    await task_executor.execute_bot_task(
        bot=FakeBot(),
        bot_name="qa_bot",
        department="qa",
        task_data={"task_id": 3, "title": "t", "chat_id": 5},
        team_context="ctx",
    )
    events = [e for e in patched if str(e["event"]).lower() == "task_created"]
    assert events[0]["data"]["department"] == "pm"


# ── Безголовые боты ─────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_headless_bot_does_not_crash(patched, monkeypatch):
    """qa/rnd/devops работают без Telegram: bot=None.

    Раньше `bot.send_message` вызывался до проверки на None, и КАЖДАЯ задача
    этих трёх ботов заканчивалась AttributeError.
    """
    import shared.task_executor as task_executor

    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI([FakeMessage(content="Партия проверена.")]),
    )
    await task_executor.execute_bot_task(
        bot=None,
        bot_name="qa_bot",
        department="qa",
        task_data={"task_id": 11, "title": "проверь партию", "chat_id": 5},
        team_context="ctx",
    )
    done = [e for e in patched if str(e["event"]).lower() == "task_completed"]
    assert len(done) == 1
    assert "Партия проверена." in done[0]["data"]["text"]


@pytest.mark.asyncio
async def test_task_without_id_is_skipped(patched, monkeypatch):
    import shared.task_executor as task_executor

    monkeypatch.setattr(
        task_executor, "AIEngine", lambda *a, **k: ScriptedAI([FakeMessage(content="x")])
    )
    await task_executor.execute_bot_task(
        bot=None,
        bot_name="qa_bot",
        department="qa",
        task_data={"title": "без id"},
        team_context="ctx",
    )
    assert patched == []


# ── Подтверждение рискованных действий ──────────────────────────────────
@pytest.mark.asyncio
async def test_risky_tool_is_not_executed_without_approval():
    """Рискованный инструмент не должен выполниться сам по себе."""
    from shared import tool_runtime

    asked = []

    async def approve(tool, args):
        asked.append(tool.name)
        return f"{tool.name}: отправлено на подтверждение."

    result = await tool_runtime.run_tool_loop(
        ScriptedAI(
            [
                FakeMessage(
                    calls=[
                        FakeToolCall(
                            "register_sale",
                            {"customer_name": "Zarra", "items": [{"product": "горох", "quantity": 1}]},
                        )
                    ]
                ),
                FakeMessage(content="Жду решения."),
            ]
        ),
        system_prompt="sys",
        user_message="продали",
        department="sales",
        approve=approve,
    )
    assert asked == ["register_sale"]
    assert result.awaiting_approval is True


@pytest.mark.asyncio
async def test_risky_tool_without_approval_channel_is_refused():
    """Нет канала подтверждения — действие не выполняется и не выдаётся за успех."""
    from shared import tool_runtime

    result = await tool_runtime.run_tool_loop(
        ScriptedAI(
            [
                FakeMessage(calls=[FakeToolCall("run_backup", {})]),
                FakeMessage(content="Не могу подтвердить."),
            ]
        ),
        system_prompt="sys",
        user_message="сделай бэкап",
        department="devops",
        approve=None,
    )
    assert result.awaiting_approval is True
    assert result.calls[0].result == {"skipped": "no_approval_channel"}


@pytest.mark.asyncio
async def test_only_owner_can_press_approve(monkeypatch):
    """Кнопку подтверждения нажимает только владелец.

    Карточка уходит в чат задачи, а отделы работают и в групповых чатах.
    Без этой проверки любой участник группы мог одобрить регистрацию продажи,
    рассылку по всей клиентской базе или списание со склада. Оба механизма,
    которые объединил shared/approvals, такую проверку имели — при слиянии
    она потерялась.
    """
    from shared import approvals

    monkeypatch.setattr(approvals.settings, "admin_telegram_ids", [111], raising=False)

    executed = []

    async def never(payload, cb):
        executed.append(payload)
        return "выполнено"

    approvals.register_handler("test_kind", never)

    answers = []

    class FakeCallback:
        def __init__(self, user_id):
            self.data = "approve:sometoken"
            self.from_user = type("U", (), {"id": user_id})()
            self.message = None

        async def answer(self, text="", show_alert=False):
            answers.append(text)

    # Посторонний: обработчик не должен быть вызван вовсе.
    await approvals.on_approve(FakeCallback(999))
    assert executed == []
    assert answers and "руководителя" in answers[0]

    # И отказ тоже только для владельца — иначе чужой отменит решение.
    answers.clear()
    reject = FakeCallback(999)
    reject.data = "reject:sometoken"
    await approvals.on_reject(reject)
    assert answers and "руководителя" in answers[0]

    assert approvals.is_owner(111) is True
    assert approvals.is_owner(999) is False
    assert approvals.is_owner(None) is False


@pytest.mark.asyncio
async def test_task_is_not_closed_without_real_work(patched, monkeypatch):
    """Текст — не выполнение: задача остаётся человеку.

    Иначе получается ровно тот дефект, против которого весь слой, — отчёт об
    успехе, которого не было.
    """
    import shared.task_executor as task_executor

    closed = []

    async def track_status(task_id, status):
        closed.append((task_id, status))

    monkeypatch.setattr(task_executor, "_set_task_status", track_status)
    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI([FakeMessage(content="Подумаю на досуге.")]),
    )

    await task_executor.execute_bot_task(
        bot=FakeBot(),
        bot_name="hr_bot",
        department="hr",
        task_data={"task_id": 5, "title": "t", "chat_id": 1},
        team_context="ctx",
    )
    assert closed == [], "задача без единого действия закрываться не должна"


@pytest.mark.asyncio
async def test_task_closes_when_a_tool_actually_ran(patched, monkeypatch):
    import shared.task_executor as task_executor

    closed = []

    async def track_status(task_id, status):
        closed.append((task_id, status))

    monkeypatch.setattr(task_executor, "_set_task_status", track_status)
    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI(
            [
                FakeMessage(calls=[FakeToolCall("get_content_schedule", {})]),
                FakeMessage(content="Расписание отдал."),
            ]
        ),
    )

    await task_executor.execute_bot_task(
        bot=FakeBot(),
        bot_name="content_bot",
        department="content",
        task_data={"task_id": 6, "title": "во сколько выходит рецепт", "chat_id": 1},
        team_context="ctx",
    )
    assert closed == [(6, "done")]


@pytest.mark.asyncio
async def test_escalation_to_human_does_not_close_the_task(patched, monkeypatch):
    """`human_task` — признание «я не могу», а не выполнение.

    Инструмент вызван, значит `acted` истинно, и задача закрывалась как `done`
    ровно в тот момент, когда бот отказался её делать. Работа при этом только
    начиналась: человеку заводилась новая строка. Планировщик совещаний уже
    считал правильно (`cap_key != "human_task"`), исполнитель — нет.
    """
    import shared.task_executor as task_executor

    closed = []

    async def track_status(task_id, status):
        closed.append((task_id, status))

    monkeypatch.setattr(task_executor, "_set_task_status", track_status)
    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI(
            [
                FakeMessage(
                    calls=[
                        FakeToolCall(
                            "human_task",
                            {"action": "Съездить к поставщику", "reason": "нужен человек"},
                        )
                    ]
                ),
                FakeMessage(content="Передал человеку."),
            ]
        ),
    )

    await task_executor.execute_bot_task(
        bot=FakeBot(),
        bot_name="hr_bot",
        department="hr",
        task_data={"task_id": 9, "title": "договориться о встрече", "chat_id": 1},
        team_context="ctx",
    )
    assert closed == [], "эскалация человеку не закрывает исходную задачу"


@pytest.mark.asyncio
async def test_department_scope_limits_the_model():
    """Модель не должна даже видеть инструменты чужого отдела."""
    from shared import tool_runtime

    ai = ScriptedAI([FakeMessage(content="ок")])
    await tool_runtime.run_tool_loop(
        ai, system_prompt="s", user_message="u", department="hr"
    )
    offered = ai.calls[0]["tools"]
    assert "register_sale" not in offered
    assert "list_employees" in offered


# ── Продажа ─────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_fractional_quantity_is_refused_not_rounded(monkeypatch):
    """Витрина считает позиции целыми: округлять за менеджера нельзя —
    это исказило бы и остаток, и сумму. Спрашиваем прямо."""
    from shared import sales_ops

    async def fake_resolve(items):
        return {
            "resolved": [
                {
                    "product_id": "cuid1",
                    "name": "Микрозелень Санго",
                    "unit": "kg",
                    "quantity": 2.5,
                    "unit_price": 40000,
                    "total_price": 100000,
                }
            ]
        }

    monkeypatch.setattr(sales_ops, "_resolve_items", fake_resolve)
    result = await sales_ops.register_sale(
        {"customer_name": "Zarra", "items": [{"product": "санго", "quantity": 2.5}]}
    )
    assert result["status"] == "clarify"
    assert "целых единицах" in result["message"]
