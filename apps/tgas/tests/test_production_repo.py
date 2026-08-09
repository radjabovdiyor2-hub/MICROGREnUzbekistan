"""
Тесты производственного контура: посадка, урожай, приход сырья, ОТК, опыты.

Инфраструктура не нужна — HTTP к витрине подменён. Каждая проверка
соответствует поломке, которая уже случалась в этом коде.

Главное, что здесь проверяется: **отказ витрины — это отказ операции**.
Молчаливый успех при недоступной витрине означал бы «посадил» без партии и
«записал ОТК» без записи — ровно то, из-за чего журнал качества разошёлся
с админкой.
"""

from __future__ import annotations

from typing import Any, Dict

import pytest

from shared import production_repo
from shared import tools as tool_registry
from shared.tools import operations, ops


@pytest.fixture
def calls(monkeypatch):
    """Перехватывает вызовы к витрине; тест задаёт ответы по имени пути."""
    log: list[Dict[str, Any]] = []
    replies: Dict[str, Dict[str, Any]] = {}

    async def fake_call(method, path, *, payload=None, params=None, timeout=30):
        log.append({"method": method, "path": path, "payload": payload, "params": params})
        for key, reply in replies.items():
            if key in path:
                return reply
        return {"ok": True, "data": {}}

    monkeypatch.setattr(production_repo, "_call", fake_call)
    log_holder = type("Calls", (), {"log": log, "replies": replies})()
    return log_holder


# ── Посадка ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_plant_refuses_when_materials_are_short(calls):
    """Сажать в минус нельзя, и «не смог» — плохой ответ: нужны цифры."""
    calls.replies["grow-batches"] = {
        "ok": True,
        "data": {
            "needs": [
                {"label": "Семена гороха", "required": 300, "enough": False},
                {"label": "Субстрат", "required": 20, "enough": True},
            ],
            "estimatedCost": 0,
        },
    }

    result = await operations.plant_batch("gorox", 10)

    assert result["ok"] is False
    assert any(n["материал"] == "Семена гороха" for n in result["needs"])
    # Посадки не было: единственный вызов — предпросмотр расхода.
    assert [c["method"] for c in calls.log] == ["GET"]


@pytest.mark.asyncio
async def test_plant_consumes_and_reports_what_went(calls):
    calls.replies["grow-batches"] = {
        "ok": True,
        "data": {
            "needs": [{"label": "Семена редиса", "required": 150, "enough": True}],
            "estimatedCost": 45000,
            "batch": {"id": "btch_1"},
        },
    }

    result = await operations.plant_batch("redis", 5, note="тест")

    assert result["ok"] is True
    assert result["quantity"] == 5
    # Микрозелень — лотки: единицу берём из ответа витрины, а не угадываем.
    assert result["unit"] == "лотк."
    assert result["consumed"][0]["материал"] == "Семена редиса"
    assert [c["method"] for c in calls.log] == ["GET", "POST"]
    assert calls.log[1]["payload"]["performedBy"] == "ai_office"


@pytest.mark.asyncio
async def test_salad_planting_is_reported_in_cups(calls):
    """Салат сажают поштучно — и отчёт обязан говорить «стаканчиков».

    Параметр инструмента назывался `trays`, а итог всегда подписывался
    лотками. Для поштучной посадки в стаканчиках 63 мм это неправда:
    лотков в такой партии нет вовсе.
    """
    calls.replies["grow-batches"] = {
        "ok": True,
        "data": {
            "crop": {"cropType": "lettuce", "plantingUnit": "cup"},
            "needs": [{"label": "Агро вата", "required": 250, "enough": True}],
            "batch": {"id": "btch_2"},
        },
    }

    result = await operations.plant_batch("lettuce", 250)

    assert result["ok"] is True
    assert result["unit"] == "стаканч."
    assert "250 стаканч." in result["summary"]


@pytest.mark.asyncio
async def test_storefront_failure_is_a_failure_not_silent_success(calls):
    """Витрина недоступна — операция НЕ выполнена, и так и надо сказать."""
    calls.replies["grow-batches"] = {"ok": False, "error": "витрина недоступна"}

    result = await operations.plant_batch("redis", 5)

    assert result["ok"] is False
    assert "НЕ выполнена" in result["note"]


# ── Урожай и списание ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_harvest_rejects_zero(calls):
    result = await operations.harvest_batch("btch_1", 0)
    assert result["ok"] is False
    assert not calls.log  # до витрины не дошли


@pytest.mark.asyncio
async def test_harvest_passes_id_and_quantity(calls):
    calls.replies["grow-batches"] = {
        "ok": True,
        "data": {"batch": {"harvestQty": 8.5, "costPrice": 1200}},
    }

    result = await operations.harvest_batch("btch_1", 8.5)

    assert result["ok"] is True and result["unit_cost"] == 1200
    assert calls.log[0]["payload"]["id"] == "btch_1"
    assert calls.log[0]["payload"]["harvestQty"] == 8.5


@pytest.mark.asyncio
async def test_write_off_batch_is_not_write_off_inventory(calls):
    """Партия и сырьё — разные списания; путать их значит списать не то."""
    calls.replies["grow-batches"] = {"ok": True, "data": {"batch": {}}}
    await operations.write_off_batch("btch_1", "плесень")
    assert calls.log[0]["payload"]["action"] == "write_off"


# ── Приход сырья ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_receive_material_reports_new_average_cost(calls):
    calls.replies["raw-materials"] = {
        "ok": True,
        "data": {"receipt": {"avgCostAfter": 38.5}},
    }

    result = await operations.receive_material("mat_1", 5000, 40)

    assert result["ok"] is True and result["avg_cost_after"] == 38.5
    assert calls.log[0]["payload"]["action"] == "receipt"
    assert calls.log[0]["payload"]["performedBy"] == "ai_office"


@pytest.mark.asyncio
async def test_receive_material_rejects_negative_price(calls):
    result = await operations.receive_material("mat_1", 10, -5)
    assert result["ok"] is False
    assert not calls.log


# ── ОТК и опыты пишутся в СВОИ таблицы ──────────────────────────────────


@pytest.mark.asyncio
async def test_quality_check_goes_to_quality_controls(calls, monkeypatch):
    """Журнал ОТК — `quality_controls`, а не `tasks`.

    Пока запись шла в `tasks`, её не видел ни `get_quality_report`, ни
    владелец на вкладке «ОТК»: бот отвечал «записал», а записи не было.
    """
    calls.replies["/admin/qa"] = {"ok": True, "data": {"id": "qc_1"}}

    result = await ops.log_quality_check("btch_1", "годна", crop="редис")

    assert result["ok"] is True and result["passed"] is True
    assert calls.log[0]["path"] == "/admin/qa"
    assert calls.log[0]["payload"]["status"] == "passed"


@pytest.mark.asyncio
async def test_quality_check_failure_is_not_reported_as_written(calls):
    calls.replies["/admin/qa"] = {"ok": False, "error": "витрина недоступна"}
    result = await ops.log_quality_check("btch_1", "брак")
    assert result["ok"] is False
    assert "НЕ записана" in result["note"]


@pytest.mark.asyncio
async def test_experiment_goes_to_experiments(calls):
    calls.replies["/admin/experiments"] = {"ok": True, "data": {"id": "exp_1"}}

    result = await ops.log_experiment("больше света — выше выход", crop="горох")

    assert result["ok"] is True and result["experiment_id"] == "exp_1"
    assert calls.log[0]["path"] == "/admin/experiments"


# ── Реестр ──────────────────────────────────────────────────────────────


def test_production_write_tools_require_confirmation():
    """Всё, что двигает запасы и деньги, проходит через владельца."""
    for name in ("plant_batch", "harvest_batch", "write_off_batch", "receive_material"):
        tool = tool_registry.by_name(name)
        assert tool is not None, f"{name} не зарегистрирован"
        assert tool.risky, f"{name} двигает запасы, но не спрашивает подтверждения"
        assert tool.confirm is not None
        assert tool.summary({})  # карточка строится и на неполных аргументах


def test_shift_tools_do_not_collide():
    """`assign_shift` ставит график, `create_shift_task` — поручение.

    Раньше существовал только второй, а его описание обещало «смену или
    поручение»: модель выбирала его для графика, а он писал строку в `tasks`,
    и в `shifts` смена не появлялась.
    """
    assign = tool_registry.by_name("assign_shift")
    task = tool_registry.by_name("create_shift_task")
    assert assign is not None and task is not None
    assert "график" in assign.description.lower()
    assert "поручение" in task.description.lower()
    assert "assign_shift" in task.description
