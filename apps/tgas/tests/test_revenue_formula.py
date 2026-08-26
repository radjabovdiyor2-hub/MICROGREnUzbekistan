"""
Одна формула выручки на весь офис.

ЗАЧЕМ ЭТОТ ТЕСТ

Вечерняя сводка считала `SUM(total_amount) FROM crm_orders` за сегодня без
единого фильтра, а `get_business_summary`, `get_pnl`, `top_products` и
`get_sales_trend` исключают отменённые через `NOT_A_SALE`. Владелец в 20:00
получал одно число, а отчёт аналитики в тот же час — другое, и расхождение
выглядело ошибкой аналитики, а не сводки.

Мест оказалось не одно: та же формула без фильтра стояла в двух сводках
Стёпана, в трёх запросах совещания и в дашборде аналитики — то есть почти
везде, где владелец смотрит выручку глазами.

Проверять сами числа тут нечем: базы в тестах нет. Зато проверяемо то, из-за
чего они и разошлись, — что запрос вообще спрашивает про отмены. Ошибка была
не в арифметике, а в забытом условии.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Где владелец видит деньги. `web_office` не включён: там своя выборка для
# витринных экранов, и она проверяется на стороне apps/web.
SCANNED = ["shared", "bots"]

# Кусок SQL, с которого начинается денежный запрос.
MONEY = re.compile(r"SUM\(\s*total_amount\s*\)", re.IGNORECASE)

# Сколько символов после суммы считаем «тем же запросом». Условия WHERE в
# этом коде идут следом, разбитые на строковые литералы.
WINDOW = 700

# Явный отказ от фильтра, когда он не нужен по смыслу. Пишется рядом с
# запросом и обязан объяснять причину — молчаливого исключения быть не должно.
OPT_OUT = "выручка-без-фильтра-намеренно"


def _sources() -> list[Path]:
    out: list[Path] = []
    for folder in SCANNED:
        out.extend(p for p in (ROOT / folder).rglob("*.py") if "__pycache__" not in p.parts)
    return out


def test_every_revenue_sum_excludes_cancelled() -> None:
    offenders: list[str] = []
    checked = 0

    for path in _sources():
        text = path.read_text(encoding="utf-8")
        for match in MONEY.finditer(text):
            checked += 1
            window = text[match.start(): match.start() + WINDOW]
            if "crm_orders" not in window:
                continue  # сумма не по заказам — деньги считают и в finances
            if "NOT_A_SALE" in window or OPT_OUT in window:
                continue
            # `customer_repo` фильтрует отмены явным списком: возврат там
            # приходит отдельной строкой с отрицательной суммой.
            if "LOWER(status) NOT IN ('cancelled', 'canceled')" in window:
                continue
            line = text[: match.start()].count("\n") + 1
            offenders.append(f"{path.relative_to(ROOT)}:{line}")

    assert checked > 5, "обход исходников сорвался — тест перестал что-либо проверять"
    assert not offenders, (
        "Выручка по заказам считается без исключения отмен — владелец увидит "
        "разные числа на разных экранах. Добавьте `AND LOWER(status) NOT IN "
        f"{{NOT_A_SALE}}` либо пометку «{OPT_OUT}» с причиной:\n  "
        + "\n  ".join(offenders)
    )
