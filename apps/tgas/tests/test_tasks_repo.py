"""
Тесты жизненного цикла задачи: статус, удаление, защита от дублей.

Инфраструктура не нужна — база подменена FakeSession. Каждая проверка
соответствует поломке, из-за которой у владельца накопились восемь
«невыполнимых» задач в сводке просрочки.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest

from shared import tasks_repo
from shared import tools as tool_registry


class FakeResult:
    def __init__(self, row=None, rows=None, scalar=None):
        self._row = row
        self._rows = rows if rows is not None else []
        self._scalar = scalar

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows

    def scalar(self):
        return self._scalar


class FakeSession:
    """Пишет SQL в журнал и отдаёт заранее заданные ответы по очереди."""

    def __init__(self, results):
        self.results = list(results)
        self.statements = []
        self.committed = 0

    async def execute(self, statement, params=None):
        self.statements.append((str(statement), params))
        return self.results.pop(0) if self.results else FakeResult()

    async def commit(self):
        self.committed += 1


@pytest.fixture
def session(monkeypatch):
    """Подменяет базу; тест кладёт в .results то, что должна вернуть БД."""
    holder = FakeSession([])

    @asynccontextmanager
    async def fake_ctx():
        yield holder

    monkeypatch.setattr(tasks_repo, "get_session_ctx", fake_ctx)
    return holder


def _sql(session) -> str:
    return " ".join(s for s, _ in session.statements)


# ── Статус ──────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_status_change_writes_updated_at(session):
    """Вечерняя сводка считает закрытые задачи по updated_at.

    Колонки не было вовсе, и весь evening_summary падал на первом запросе.
    Теперь она есть, но `@updatedAt` у Prisma проставляется на стороне
    клиента — офис пишет сырым SQL, так что дату обязан ставить репозиторий.
    """
    session.results = [FakeResult(row=(5,))]
    assert await tasks_repo.set_status(5, "done") is True
    assert "updated_at = NOW()" in _sql(session)
    assert session.committed == 1


@pytest.mark.asyncio
async def test_unknown_status_is_refused(session):
    """Опечатка в статусе иначе просто исчезает из всех выборок."""
    assert await tasks_repo.set_status(5, "выполнено") is False
    assert not session.statements  # до базы дело не дошло


@pytest.mark.asyncio
async def test_missing_task_reports_failure(session):
    """«Закрыл задачу» без строки в базе — это ложь, а не успех.

    Ровно так вела себя кнопка «✅ Выполнено»: в чат уходило «выполнено»,
    а в базе оставалось todo.
    """
    session.results = [FakeResult(row=None)]
    assert await tasks_repo.set_status(999, "done") is False


# ── Удаление ────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_delete_returns_the_removed_row(session):
    """Удалённую задачу есть кому показать — в чате и в баннере админки."""
    session.results = [
        FakeResult(row=(18, "Доставить заказ", "", "logistics", None, "todo", "high", None, None))
    ]
    removed = await tasks_repo.delete(18)
    assert removed["id"] == 18 and removed["title"] == "Доставить заказ"
    assert "DELETE FROM tasks" in _sql(session)


@pytest.mark.asyncio
async def test_delete_missing_task_returns_none(session):
    session.results = [FakeResult(row=None)]
    assert await tasks_repo.delete(404) is None


@pytest.mark.asyncio
async def test_delete_many_reports_what_actually_went(session):
    """Расхождение показываем честно: часть задач мог удалить кто-то другой."""
    session.results = [FakeResult(rows=[(28,), (29,)])]
    assert await tasks_repo.delete_many([28, 29, 30]) == [28, 29]


@pytest.mark.asyncio
async def test_delete_many_without_ids_does_not_touch_the_base(session):
    """Пустой список не должен превращаться в DELETE без условия."""
    assert await tasks_repo.delete_many([]) == []
    assert not session.statements


# ── Защита от дублей ────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_recent_duplicate_is_found_by_title_and_department(session):
    """Четыре одинаковые задачи подряд — это один вызов, размноженный моделью."""
    session.results = [FakeResult(row=(28,))]
    assert await tasks_repo.find_recent_duplicate("  СОБРАТЬ  Совещание ", "PM") == 28
    sql, params = session.statements[0]
    # Сравнение регистронезависимое с обеих сторон, иначе «PM» не найдёт «pm».
    assert params["t"] == "собрать совещание" and params["d"] == "pm"


@pytest.mark.asyncio
async def test_empty_title_is_not_a_duplicate(session):
    assert await tasks_repo.find_recent_duplicate("   ", "pm") is None
    assert not session.statements


# ── Инструмент удаления ─────────────────────────────────────────────────
def test_delete_task_is_risky_and_chief_only():
    """Удаление необратимо: только руководитель и только через подтверждение."""
    tool = tool_registry.by_name("delete_task")
    assert tool is not None
    assert tool.risky and tool.confirm is not None
    assert tool.departments == ["pm"]
    # Отделам инструмент не виден — им есть чем задачу закрыть.
    assert "delete_task" not in {t.name for t in tool_registry.tools_for("sales")}
    assert "delete_task" in {t.name for t in tool_registry.tools_for("pm")}


def test_delete_task_confirm_survives_missing_arguments():
    """Карточку подтверждения строим до валидации — args может быть неполным."""
    tool = tool_registry.by_name("delete_task")
    assert tool.summary({})
    assert "#12" in tool.summary({"task_id": 12, "reason": "дубль"})


# ── Повторная отправка зависших задач ───────────────────────────────────
@pytest.mark.asyncio
async def test_stuck_tasks_are_limited_by_retry_count(session):
    """Метельщик берёт только задачи, у которых попытки не исчерпаны.

    До 10.08.2026 счётчика не было вовсе: `mark_retried` двигала `updated_at`,
    задача выпадала из окна на три часа и возвращалась — и так вечно, хотя
    докстринг обещал «две попытки». Для задачи, зациклившей офис, это
    означало, что ручная перезагрузка сервера давала отсрочку на три часа,
    а не решение.
    """
    session.results = [FakeResult(rows=[])]
    await tasks_repo.list_stuck(older_than_hours=3)
    sql = _sql(session)
    assert "retry_count < :max_retries" in sql
    _, params = session.statements[0]
    assert params["max_retries"] == tasks_repo.MAX_RETRIES


@pytest.mark.asyncio
async def test_retry_increments_the_counter(session):
    """Отметка попытки увеличивает счётчик, а не только двигает дату."""
    await tasks_repo.mark_retried(11)
    sql = _sql(session)
    assert "retry_count = retry_count + 1" in sql
    assert "updated_at = NOW()" in sql
    assert session.committed == 1


@pytest.mark.asyncio
async def test_stuck_row_carries_retry_count(session):
    """Строка отдаёт число попыток: по нему решают, была ли она последней."""
    session.results = [
        FakeResult(rows=[(1, "t", "d", "pm", "pm", "todo", "high", None, None, 1)])
    ]
    rows = await tasks_repo.list_stuck()
    assert rows[0]["retry_count"] == 1


@pytest.mark.asyncio
async def test_other_queries_still_work_without_retry_count(session):
    """Остальные запросы не выбирают retry_count — и не должны падать.

    Колонка дописана только в проекцию метельщика: тащить её во все запросы
    ради одного места незачем, но `_row` обязан пережить её отсутствие.
    """
    session.results = [FakeResult(row=(9, "t", "d", "pm", "pm", "todo", "high", None, None))]
    task = await tasks_repo.get(9)
    assert task["retry_count"] == 0
