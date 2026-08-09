"""
Тесты инструментов чтения операционных данных.

Пятнадцать таблиц система заполняла и не читала: на «сколько мне должны»,
«кто в смене», «почём брали семена» инструмента не существовало, и модель
отвечала общими словами или выдумывала.

Инфраструктура не нужна: сессию базы подменяем, проверяем разбор строк и
формулировки — то есть ровно то, что увидит владелец в ответе бота.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from types import SimpleNamespace
from typing import Any, Dict, List

import pytest

from shared import tools as tool_registry
from shared.tools import operations_read


class _FakeResult:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = [SimpleNamespace(_mapping=r) for r in rows]

    def __iter__(self):
        return iter(self._rows)


class _FakeSession:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows
        self.executed: list[str] = []

    async def execute(self, statement, params=None):
        self.executed.append(str(statement))
        return _FakeResult(self._rows)


def _session_returning(rows: List[Dict[str, Any]]):
    """Контекст-менеджер, отдающий заранее заданные строки."""

    class _Ctx:
        def __init__(self):
            self.session = _FakeSession(rows)

        async def __aenter__(self):
            return self.session

        async def __aexit__(self, *exc):
            return False

    return _Ctx


@pytest.fixture
def fake_db(monkeypatch):
    def _install(rows: List[Dict[str, Any]]):
        monkeypatch.setattr(operations_read, "get_session_ctx", _session_returning(rows))

    return _install


# ── Регистрация ─────────────────────────────────────────────────────────

NEW_TOOLS = [
    "get_debts",
    "get_shifts",
    "get_supplier_prices",
    "get_quality_report",
    "get_followups",
]


@pytest.mark.parametrize("name", NEW_TOOLS)
def test_tool_is_registered(name):
    """Незарегистрированный инструмент для модели не существует."""
    assert tool_registry.by_name(name) is not None


@pytest.mark.parametrize("name", NEW_TOOLS)
def test_chief_and_departments_see_tool(name):
    """Владелец спрашивает Стёпана — значит инструмент должен быть у него."""
    assert name in {t.name for t in tool_registry.tools_for("pm")}
    assert name in {t.name for t in tool_registry.tools_for("finance")}


# ── Долги ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_debts_split_by_direction(fake_db):
    """«Нам должны» и «мы должны» нельзя складывать в одну сумму."""
    fake_db([
        {
            "id": "1", "type": "WHO_OWES_US", "person_name": "Ресторан Жасмин",
            "phone": "+998901112233", "amount": 500_000, "paid_amount": 200_000,
            "due_date": None, "is_paid": False, "description": None,
            "supplier_name": None,
        },
        {
            "id": "2", "type": "WE_OWE", "person_name": "Семена-Опт",
            "phone": None, "amount": 800_000, "paid_amount": 0,
            "due_date": None, "is_paid": False, "description": None,
            "supplier_name": "Семена-Опт",
        },
    ])

    res = await operations_read.get_debts()

    assert res["found"] is True
    # Остаток, а не полная сумма: 200 000 уже погашено.
    assert res["owed_to_us"] == 300_000
    assert res["we_owe"] == 800_000
    assert res["owed_to_us"] != res["we_owe"]


@pytest.mark.asyncio
async def test_debts_empty_is_not_an_error(fake_db):
    fake_db([])
    res = await operations_read.get_debts()
    assert res["found"] is False
    assert "нет" in res["summary"].lower()


# ── Смены ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_shifts_separate_working_from_absent(fake_db):
    """Больничный — не смена: посчитать его работающим значит соврать.

    Ключ — `role`, а не `position`. Пока в запросе стояло `e.position`,
    этот тест был зелёным: FakeSession отдаёт словарь, который написал автор
    теста, и несуществующую колонку так не поймать. На живой базе `get_shifts`
    падал с UndefinedColumn при каждом вызове. Ловит это только
    `scripts/check_schema.py` — сверка SQL со schema.prisma.
    """
    fake_db([
        {
            "type": "work", "start_time": datetime(2026, 8, 9, 8, 0),
            "end_time": datetime(2026, 8, 9, 17, 0), "note": None,
            "employee_name": "Азиз", "role": "фермер",
        },
        {
            "type": "sick", "start_time": None, "end_time": None, "note": None,
            "employee_name": "Дилшод", "role": "курьер",
        },
    ])

    res = await operations_read.get_shifts()

    assert res["working_count"] == 1
    assert res["working"][0]["name"] == "Азиз"
    assert res["working"][0]["from"] == "08:00"
    assert [a["name"] for a in res["absent"]] == ["Дилшод"]


# ── Цены поставщиков ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_supplier_prices_sorted_and_formatted(fake_db):
    fake_db([
        {
            "supplier_name": "Семена-Опт", "phone": "+998901112233",
            "material_name": "Семена гороха", "kind": "SEED",
            "price": 222.0, "unit": "g",
            "valid_from": datetime(2026, 8, 1), "note": None,
        },
    ])

    res = await operations_read.get_supplier_prices(material="горох")

    assert res["found"] is True
    assert res["prices"][0]["material"] == "Семена гороха"
    assert "за g" in res["prices"][0]["price_text"]
    assert res["prices"][0]["since"] == "01.08.2026"


@pytest.mark.asyncio
async def test_supplier_prices_empty_explains_where_they_come_from(fake_db):
    """Пустой ответ должен подсказывать, а не просто отрицать."""
    fake_db([])
    res = await operations_read.get_supplier_prices(material="лаванда")
    assert res["found"] is False
    assert "админке" in res["summary"]


# ── Контроль качества ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_quality_report_counts_defects_by_type(fake_db):
    fake_db([
        {
            "status": "passed", "defect_type": None, "notes": None,
            "created_at": datetime(2026, 8, 8), "crop_type": "pea",
            "trays": 4, "inspector_name": "Азиз",
        },
        {
            "status": "defect", "defect_type": "mold", "notes": "низ лотка",
            "created_at": datetime(2026, 8, 7), "crop_type": "radish",
            "trays": 2, "inspector_name": "Азиз",
        },
        {
            "status": "defect", "defect_type": "mold", "notes": None,
            "created_at": datetime(2026, 8, 6), "crop_type": "radish",
            "trays": 2, "inspector_name": None,
        },
    ])

    res = await operations_read.get_quality_report(days="7")

    assert res["passed"] == 1
    assert res["failed"] == 2
    assert res["defects"] == {"mold": 2}
    assert "mold" in res["summary"]


@pytest.mark.asyncio
async def test_quality_report_window_is_clamped(fake_db):
    """Мусор во входных данных не должен ломать запрос."""
    fake_db([])
    res = await operations_read.get_quality_report(days="не знаю")
    assert res["summary"].count("7") >= 1


# ── Напоминания ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_followups_flag_overdue(fake_db):
    """Просроченное касание — главное, что нужно увидеть в ответе."""
    yesterday = datetime.combine(date.today() - timedelta(days=1), datetime.min.time())
    tomorrow = datetime.combine(date.today() + timedelta(days=1), datetime.min.time())
    fake_db([
        {
            "scheduled_at": yesterday, "message": "перезвонить по КП",
            "status": "pending", "customer_name": "Кафе Лола",
            "phone": "+998901112233", "customer_type": "b2b",
        },
        {
            "scheduled_at": tomorrow, "message": "уточнить объём",
            "status": "pending", "customer_name": "Ресторан Жасмин",
            "phone": None, "customer_type": "b2b",
        },
    ])

    res = await operations_read.get_followups()

    assert res["count"] == 2
    assert res["overdue_count"] == 1
    assert "просрочено" in res["summary"]
    # Клиент без телефона не должен выглядеть как клиент с пустым телефоном.
    assert res["followups"][1]["phone"] == "телефон не записан"
