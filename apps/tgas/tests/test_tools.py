"""
Тесты слоя инструментов отделов.

Инфраструктура не нужна: проверяем проводку реестра, а не работу с базой.
Каждая проверка соответствует поломке, которая уже случалась в этом коде.
"""

from __future__ import annotations

import pytest

from shared import bot_registry
from shared import tools as tool_registry
from shared.tools.common import CHIEF_FALLBACK, LISTENED_DEPARTMENTS, MAX_DELEGATION_HOPS


def test_every_department_has_tools():
    """Отдел без инструментов снова умеет только генерировать текст."""
    counts = tool_registry.departments_with_tools()
    for bot in bot_registry.BOTS:
        if not bot.department or bot.department == "pm":
            continue
        assert counts.get(bot.department), (
            f"у отдела «{bot.department}» ({bot.name}) нет ни одного инструмента"
        )


def test_tool_names_are_unique():
    names = [t.name for t in tool_registry.all_tools()]
    assert len(names) == len(set(names))


def test_chief_sees_every_tool():
    """Стёпан работает за отделы без бота, значит видит весь набор."""
    assert len(tool_registry.tools_for("pm")) == len(tool_registry.all_tools())


def test_department_scoping_is_real():
    """Отдел кадров не должен уметь регистрировать продажи."""
    hr = {t.name for t in tool_registry.tools_for("hr")}
    assert "register_sale" not in hr
    assert "list_employees" in hr
    # А общие инструменты есть у всех.
    assert "get_price_list" in hr
    assert "delegate_to_department" in hr


def test_risky_tools_explain_themselves():
    """Карточка подтверждения должна говорить, ЧТО произойдёт."""
    for tool in tool_registry.all_tools():
        if tool.risky:
            assert tool.confirm is not None, f"{tool.name} risky без описания действия"
            assert tool.summary({"customer_name": "X", "name": "Y", "amount": 1})


def test_price_tool_is_available_to_content():
    """«Сделай пост с ценами» должно быть чем выполнить именно в контенте."""
    content = {t.name for t in tool_registry.tools_for("content")}
    assert "build_price_list_post" in content
    assert "get_price_list" in content


def test_schema_matches_the_function_signature():
    """Схема, объявленная модели, должна совпадать с тем, что принимает код.

    Расхождение здесь ловится только в рантайме и выглядит как «инструмент не
    отработал»: модель шлёт параметр, которого в сигнатуре нет, либо не шлёт
    обязательный аргумент, потому что ей о нём не сказали.
    """
    import inspect

    for tool in tool_registry.all_tools():
        params = set(inspect.signature(tool.run).parameters)
        for name in tool.params:
            assert name in params, f"{tool.name}: «{name}» объявлен модели, но не принимается"
        for name in tool.required:
            assert name in tool.params, f"{tool.name}: required «{name}» не объявлен"
        for name, prm in inspect.signature(tool.run).parameters.items():
            required_in_code = prm.default is inspect._empty and prm.kind in (
                prm.POSITIONAL_OR_KEYWORD,
                prm.KEYWORD_ONLY,
            )
            if required_in_code:
                assert name in tool.params, (
                    f"{tool.name}: «{name}» обязателен в коде, но модели не объявлен"
                )


def test_schemas_are_valid_function_calling():
    for schema in tool_registry.schemas_for("sales"):
        assert schema["type"] == "function"
        function = schema["function"]
        assert function["name"] and function["description"]
        params = function["parameters"]
        assert params["type"] == "object"
        for name in params["required"]:
            assert name in params["properties"], (
                f"{function['name']}: обязательный параметр {name} не объявлен"
            )


def test_catalog_text_marks_required_and_risky():
    text = tool_registry.catalog_text("sales")
    assert "register_sale" in text
    assert "customer_name*" in text  # обязательный аргумент помечен
    assert "⚠️" in text  # рискованные видны планировщику


@pytest.mark.parametrize(
    "value, expected_ok",
    [
        ({"ok": True, "message": "Готово"}, True),
        ({"ok": False, "message": "Нет"}, False),
        ({"error": "упало"}, False),
        ({"count": 3}, True),
    ],
)
def test_normalize_result(value, expected_ok):
    assert tool_registry.normalize_result(value)["ok"] is expected_ok


def test_delegation_targets_all_have_listeners():
    """Отдел без слушателя = задача создалась, событие улетело, исполнителя нет."""
    known = {b.department for b in bot_registry.BOTS if b.department}
    assert LISTENED_DEPARTMENTS <= known
    assert CHIEF_FALLBACK in known


@pytest.mark.asyncio
async def test_call_drops_unknown_arguments():
    """Модель регулярно добавляет лишние поля — это не должно быть отказом."""
    result = await tool_registry.call(
        "get_content_schedule", {"chat_id": 1, "task_id": 2, "выдумка": "x"}
    )
    assert "schedule" in result


@pytest.mark.asyncio
async def test_call_unknown_tool_is_reported_not_raised():
    result = await tool_registry.call("такого_нет", {})
    assert "error" in result


def test_hops_limit_is_small():
    """Предел передач нужен, чтобы отделы не гоняли задачу по кругу."""
    assert 1 <= MAX_DELEGATION_HOPS <= 3
