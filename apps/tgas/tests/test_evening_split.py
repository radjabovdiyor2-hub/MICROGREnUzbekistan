"""
Вечером про деньги докладывают один раз.

ЗАЧЕМ ЭТОТ ТЕСТ

Выручку дня владельцу сообщали двое: финансы в 18:00 и вечерняя сводка
Стёпана в 20:00. Одно и то же число приходило дважды за вечер — а пока
сводка не фильтровала отмены, ещё и разными числами, и расхождение
читалось как ошибка отчёта, а не как разные срезы.

Решением владельца (27.08.2026) отчёты разведены по смыслу:

  · финансы в 18:00 — ДЕНЬГИ, и подробно: доход, расход, прибыль и
    расход по статьям (строка «расход столько-то» без разбивки не
    отвечает на единственный вопрос, который к ней возникает);
  · сводка Стёпана в 20:00 — РАБОТА: задачи, заказы, планы на завтра.
    Количество заказов там остаётся — это про сделанное, а не про
    заработанное.

Проверяется не текст, а РАЗДЕЛЕНИЕ: сумма денег живёт в одном месте.
Тест статический — Telegram и база не нужны.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

TGAS = Path(__file__).resolve().parent.parent

STEPAN = TGAS / "bots" / "stepan_bot" / "main.py"
FINANCE = TGAS / "bots" / "finance_bot" / "main.py"


def _function(path: Path, name: str) -> ast.AST:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return node
    raise AssertionError(f"{path.name}: функция {name} исчезла — тест ослеп")


def _strings(node: ast.AST) -> str:
    out = []
    for child in ast.walk(node):
        if isinstance(child, ast.Constant) and isinstance(child.value, str):
            out.append(child.value)
        elif isinstance(child, ast.JoinedStr):
            out.append("".join(
                c.value for c in child.values
                if isinstance(c, ast.Constant) and isinstance(c.value, str)
            ))
    return "\n".join(out)


def test_evening_summary_reports_work_not_money() -> None:
    body = _strings(_function(STEPAN, "evening_summary"))

    assert "Задач завершено" in body, "сводка перестала быть про работу"
    assert "Новых заказов" in body, (
        "число заказов ушло из сводки: это про сделанное, и убирать его "
        "вместе с суммой было незачем"
    )
    assert "Выручка" not in body, (
        "выручка вернулась в вечернюю сводку — теперь про деньги за вечер "
        "снова докладывают дважды, и владельцу приходится решать, какому "
        "числу верить"
    )


def test_evening_summary_does_not_sum_money() -> None:
    """Не только текст: сама сумма из запроса уходить не должна."""
    source = ast.get_source_segment(
        STEPAN.read_text(encoding="utf-8"), _function(STEPAN, "evening_summary")
    ) or ""
    assert not re.search(r"SUM\(\s*total_amount", source, re.I), (
        "сводка снова считает сумму заказов: даже не показанная, она "
        "вернётся в текст при первой правке"
    )
    # Отмены по-прежнему не считаются состоявшимися заказами.
    assert "NOT_A_SALE" in source, (
        "фильтр отмен пропал: отменённый заказ снова попадёт в число "
        "сегодняшних"
    )


def test_finance_report_is_the_one_place_for_money() -> None:
    body = _strings(_function(FINANCE, "daily_finance_report"))

    for word in ("Доход", "Расход", "Прибыль"):
        assert word in body, f"из финансового отчёта пропало «{word}»"
    assert "Расход по статьям" in body, (
        "разбивка расхода исчезла: отчёт снова называет сумму, не отвечая, "
        "куда ушли деньги"
    )
