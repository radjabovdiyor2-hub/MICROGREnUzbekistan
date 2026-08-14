"""
Показ результата инструмента: дословно и без потерь.

Случай из группы «Продажа»: на просьбу про прайс бот ответил «актуальный
прайс-лист на МИКРОЗЕЛЕНЬ» и перечислил Базилик 35 000, Кейл 30 000, Мангольд
30 000 — за 100 г. Цены настоящие, но это БЕЙБИ-ЛИСТ: микрозелень продаётся за
лоток по 15 000–20 000. Результат инструмента уходил модели «сформулируй ответ»,
и она переименовала категорию, а заодно написала это рекламным тоном с
хэштегом — системный промпт несёт BRAND_TEXT_STYLE.

Отсюда правило: цифры печатает инструмент, модель их не пересказывает.
Проверяем два свойства — ответ никогда не пуст и цифры из результата в нём
сохраняются дословно.
"""

from __future__ import annotations

import pytest

from shared import tool_render


# Формы, в которых инструменты офиса реально возвращают результат.
SHAPES = [
    ({"message": "Заказ M-7 записан."}, "message"),
    ({"ok": True, "created": True, "customer_id": 7, "summary": "Клиент заведён."}, "summary"),
    ({"found": True, "count": 1, "customers": [{"id": 7, "name": "Ахмад"}]}, "bare-fields"),
    ({"error": "инструмент не отработал: нет связи с базой"}, "error"),
    ({}, "empty"),
    ({"ok": False, "needs": "confirmation", "candidates": [{"id": 1, "name": "Жасмин"}]}, "needs"),
]


@pytest.mark.parametrize("result,shape", SHAPES, ids=[s for _, s in SHAPES])
def test_render_is_never_empty(result, shape):
    """Пустой ответ неотличим от «бот не понял» — его быть не должно."""
    text = tool_render.render("любой_инструмент", result)
    assert text and text.strip(), f"форма {shape} отрендерилась в пустоту"


def test_render_survives_non_dict_and_none():
    assert tool_render.render("t", None).strip()
    assert "готово" in tool_render.render("t", "готово")


def test_price_list_is_printed_verbatim():
    """Прайс печатается ровно так, как его собрал каталог: он источник цен."""
    catalog_text = (
        "[Микрозелень]\n"
        "- Горох: 15 000 сум / лоток, нет в наличии\n"
        "[Бейби-листья]\n"
        "- Базилик: 35 000 сум / 100 г, нет в наличии"
    )
    text = tool_render.render(
        "get_price_list",
        {
            "price_list": catalog_text,
            "source": "каталог витрины (products)",
            "note": "Это единственный источник цен.",
        },
    )
    assert text == catalog_text, "прайс обязан дойти без единой правки"
    # Ни одна категория не должна потеряться — именно потеря заголовка и
    # превратила бейби-лист в «микрозелень».
    assert "Микрозелень" in text and "Бейби-листья" in text


def test_numbers_are_not_lost_in_generic_render():
    """Общий разбор не выбрасывает цифры: по ним принимают решения."""
    text = tool_render.render(
        "get_pnl",
        {"month": "август", "income": 12_500_000, "expense": 9_300_000, "profit": 3_200_000},
    )
    for number in ("12500000", "9300000", "3200000"):
        assert number in text.replace(" ", ""), f"{number} потерялось: {text}"


def test_long_lists_are_capped_but_counted():
    """Список сворачивается, но его длина остаётся видна — тихо терять нельзя."""
    text = tool_render.render(
        "get_orders",
        {"count": 30, "orders": [{"number": f"M-{i}", "total": i * 1000} for i in range(30)]},
    )
    assert "и ещё 20" in text
    assert "30" in text


def test_summary_keeps_the_rest_of_the_payload():
    """`summary` — заголовок, а не замена данным.

    Инструмент взят без своего формата (`get_debts`), потому что проверяется
    именно общий разбор: у инструмента со своим `render` решает он.
    """
    text = tool_render.render(
        "get_debts",
        {"summary": "Должников трое.", "debtors_count": 3, "total_debt_text": "450 000 сум"},
    )
    assert "Должников трое." in text
    assert "450 000 сум" in text


def test_tool_render_hook_wins_over_generic():
    """Свой формат инструмента важнее общего разбора."""
    from shared import tools as tool_registry

    tool = tool_registry.by_name("get_price_list")
    assert tool is not None and tool.render is not None, "у прайса должен быть свой формат"


def test_broken_render_hook_does_not_swallow_the_answer(monkeypatch):
    """Ошибка в своём формате не должна оставлять руководителя без ответа."""
    from shared import tools as tool_registry

    tool = tool_registry.by_name("get_price_list")

    def boom(_result):
        raise ValueError("сломался формат")

    monkeypatch.setattr(tool, "render", boom)
    text = tool_render.render("get_price_list", {"price_list": "- Горох: 15 000 сум"})
    assert "15 000" in text


def test_customers_render_shows_phone_and_money():
    text = tool_render.render(
        "find_customer",
        {
            "found": True,
            "count": 1,
            "customers": [
                {
                    "id": 7,
                    "name": "Ресторан Жасмин",
                    "phone": "+998 90 111-22-33",
                    "type": "b2b",
                    "orders_count": 4,
                    "total_spent_text": "600 000 сум",
                }
            ],
        },
    )
    assert "Ресторан Жасмин" in text
    assert "+998 90 111-22-33" in text
    assert "600 000 сум" in text
