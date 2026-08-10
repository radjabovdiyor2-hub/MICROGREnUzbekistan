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
    """Нет канала подтверждения — действие не выполняется и не выдаётся за успех.

    Берём инструмент с ПОРОГОМ: пороги приходят из настроек, вне контейнера
    они недоступны, и `_autonomy_limits` честно отдаёт нули — то есть
    «спрашивать всегда». Это и есть безопасная сторона отказа.
    """
    from shared import tool_runtime

    result = await tool_runtime.run_tool_loop(
        ScriptedAI(
            [
                FakeMessage(
                    calls=[
                        FakeToolCall(
                            "write_off_inventory",
                            {"item_name": "субстрат", "quantity": 2},
                        )
                    ]
                ),
                FakeMessage(content="Не могу подтвердить."),
            ]
        ),
        system_prompt="sys",
        user_message="спиши субстрат",
        department="pm",
        approve=None,
    )
    assert result.awaiting_approval is True
    assert result.calls[0].result == {"skipped": "no_approval_channel"}


def test_threshold_lets_small_actions_through():
    """Мелкое действие бот делает сам, крупное — спрашивает.

    Без порогов `risky=True` означало «спрашивать всегда», и под это правило
    попало всё, что делает настоящую работу: списать два килограмма субстрата
    стоило владельцу столько же внимания, сколько рассылка по всей базе.
    """
    from shared import tools as tool_registry
    from shared.tools import operations

    tool = tool_registry.by_name("write_off_inventory")
    limits = {"autonomy.writeOffMax": 5.0}

    assert tool.may_run_alone({"item_name": "субстрат", "quantity": 2}, limits) is True
    assert tool.may_run_alone({"item_name": "субстрат", "quantity": 200}, limits) is False
    # Порог не задан — прежнее поведение, спрашиваем.
    assert tool.may_run_alone({"item_name": "субстрат", "quantity": 2}, {}) is False
    # Мусор в аргументе не повод списывать со склада.
    assert operations._within("много", 5.0) is False


def test_customer_facing_tools_never_run_alone():
    """Письмо клиенту и публикацию отозвать нельзя — порога у них быть не должно."""
    from shared import tools as tool_registry

    for name in (
        "register_sale",
        "notify_customers",
        "push_stale_orders",
        "broadcast",
        "b2b_offer",
        "publish_content",
        "publish_story",
        "add_product",
        "update_order_status",
    ):
        tool = tool_registry.by_name(name)
        assert tool is not None, f"{name} не зарегистрирован"
        assert tool.risky, f"{name} должен требовать подтверждения"
        assert tool.auto_when is None, f"{name} не должен иметь порога автономии"
        assert tool.may_run_alone({"amount": 1}, {"autonomy.financeMaxSum": 10**9}) is False


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


# ── Петля делегирования (инцидент 10.08.2026) ───────────────────────────
#
# Владелец надиктовал задачу, Стёпан начал передавать её «в отдел pm» — то
# есть самому себе — и не останавливался; офис остановила только ручная
# перезагрузка сервера.
#
# Тесты ниже проверяют не значение счётчика, а то, что цепочка КОНЧАЕТСЯ.
# Прежний `test_hops_limit_is_small` смотрел на константу и был зелёным всё
# время, пока задача крутилась по кругу: предел передач не останавливал
# работу, а перенаправлял её в CHIEF_FALLBACK = "pm", то есть обратно
# исполнителю.


@pytest.mark.asyncio
async def test_department_cannot_delegate_to_itself(patched, monkeypatch):
    """Передача самому себе — отказ, и события передачи не возникает."""
    import shared.task_executor as task_executor

    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI(
            [
                FakeMessage(
                    calls=[FakeToolCall("delegate_to_department", {"department": "pm"})]
                ),
                FakeMessage(content="Ладно, делаю сам."),
            ]
        ),
    )

    await task_executor.execute_bot_task(
        bot=FakeBot(),
        bot_name="stepan_bot",
        department="pm",
        task_data={"task_id": 1, "title": "зарплата агента", "chat_id": 5},
        team_context="ctx",
    )

    assert [e for e in patched if str(e["event"]).lower() == "task_created"] == []


@pytest.mark.asyncio
async def test_chief_aliases_count_as_self(patched, monkeypatch):
    """production/logistics/operations ведёт тот же Стёпан.

    Передача из pm в «production» выглядит как передача другому отделу, но
    принимает её тот же бот — то есть это та же петля под другим именем.
    """
    import shared.task_executor as task_executor

    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI(
            [
                FakeMessage(
                    calls=[
                        FakeToolCall(
                            "delegate_to_department", {"department": "production"}
                        )
                    ]
                ),
                FakeMessage(content="Моё."),
            ]
        ),
    )

    await task_executor.execute_bot_task(
        bot=FakeBot(),
        bot_name="stepan_bot",
        department="pm",
        task_data={"task_id": 2, "title": "посев", "chat_id": 5},
        team_context="ctx",
    )

    assert [e for e in patched if str(e["event"]).lower() == "task_created"] == []


@pytest.mark.asyncio
async def test_delegation_chain_terminates(patched, monkeypatch):
    """Задача, которую КАЖДЫЙ отдел пытается сбросить дальше, останавливается.

    Гоняем ровно то, что случилось на проде: отдел за отделом просит передачу,
    каждый следующий получает hops от предыдущего. Раньше это не сходилось
    никогда — на пределе задача возвращалась к руководителю и шла на новый
    круг. Теперь передач не больше MAX_DELEGATION_HOPS, дальше инструмент
    отказывает и задача остаётся у того, у кого она есть.
    """
    import shared.task_executor as task_executor
    from shared.tools.common import MAX_DELEGATION_HOPS

    # Отделы, между которыми модель гоняет задачу. Первым идёт не pm, чтобы
    # проверить именно предел, а не запрет самопередачи.
    ring = ["hr", "finance", "analytics", "sales", "marketing", "support"]

    department = "content"
    hops = 0
    handovers = 0
    for step in range(10):  # заведомо больше предела: цикл обязан кончиться раньше
        target = ring[step % len(ring)]
        monkeypatch.setattr(
            task_executor,
            "AIEngine",
            lambda *a, **k: ScriptedAI(
                [
                    FakeMessage(
                        calls=[
                            FakeToolCall(
                                "delegate_to_department", {"department": target}
                            )
                        ]
                    ),
                    FakeMessage(content="Не наше."),
                ]
            ),
        )
        patched.clear()
        await task_executor.execute_bot_task(
            bot=FakeBot(),
            bot_name=f"{department}_bot",
            department=department,
            task_data={"task_id": 3, "title": "чужое", "chat_id": 5, "hops": hops},
            team_context="ctx",
        )
        events = [e for e in patched if str(e["event"]).lower() == "task_created"]
        if not events:
            break  # инструмент отказал — задача осталась у отдела
        handovers += 1
        department = events[0]["data"]["department"]
        hops = events[0]["data"]["hops"]

    assert handovers == MAX_DELEGATION_HOPS, (
        f"передач {handovers} при пределе {MAX_DELEGATION_HOPS} — "
        f"цепочка не останавливается"
    )


@pytest.mark.asyncio
async def test_refused_delegation_does_not_close_task(patched, monkeypatch):
    """Отказ в передаче — не выполнение. Задачу закрывать нельзя.

    Иначе «не смог передать» превратилось бы в «сделано», и работа исчезла бы
    из всех сводок, ни разу не будучи выполненной.
    """
    import shared.task_executor as task_executor
    import shared.tasks_repo as tasks_repo

    statuses = []

    async def fake_set_status(task_id, status):
        statuses.append(status)
        return True

    monkeypatch.setattr(tasks_repo, "set_status", fake_set_status)
    monkeypatch.setattr(
        task_executor,
        "AIEngine",
        lambda *a, **k: ScriptedAI(
            [
                FakeMessage(
                    calls=[FakeToolCall("delegate_to_department", {"department": "pm"})]
                ),
                FakeMessage(content="Передать не вышло."),
            ]
        ),
    )

    await task_executor.execute_bot_task(
        bot=FakeBot(),
        bot_name="stepan_bot",
        department="pm",
        task_data={"task_id": 4, "title": "чужое", "chat_id": 5},
        team_context="ctx",
    )

    assert "done" not in statuses
