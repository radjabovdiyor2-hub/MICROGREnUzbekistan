"""
Лист для заполнения онлайн-финмодели фонда (startupplan.uz).

Форма отдаётся только после входа в кабинет, поэтому её точная разметка
неизвестна. Но такие платформы спрашивают один и тот же набор: клиенты,
тарифы, выручка, расходы, CAPEX, инвестиция, P&L, Cash Flow, метрики и
cap table. Здесь всё это выводится из `model.py` — то есть из тех же цифр,
что лежат в Excel и в пяти Word-документах пакета.

Данные набираются НЕ руками: если модель поменяется, лист пересобирается и
расхождению взяться неоткуда.

Запуск:
    C:/Users/noteb/AppData/Local/Programs/Python/Python310/python.exe -X utf8 \
        doc/fill_sheet.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as M  # noqa: E402

OUT = Path(__file__).resolve().parent / "finmodel_fill_sheet.md"


def num(value: float) -> str:
    return f"{round(value):,}".replace(",", " ")


def table(header: list[str], rows: list[list[str]]) -> str:
    lines = ["| " + " | ".join(header) + " |",
             "|" + "|".join(["---"] * len(header)) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def build(m: dict) -> str:
    labels = m["labels"]
    n = M.MONTHS
    quarters = M.quarters(m)
    parts: list[str] = []

    parts.append("# Лист заполнения финмодели — MICROGREEN AND STRAWBERRY\n")
    parts.append(
        "Все цифры взяты из `doc/model.py` — того же источника, что Excel и пять "
        "Word-документов пакета. Если форма просит показатель, которого здесь нет, "
        "не выдумывайте: посчитайте его в модели и пересоберите лист.\n"
    )

    # ── Общее ────────────────────────────────────────────────────────────
    parts.append("## 1. Общие параметры\n")
    parts.append(table(
        ["Поле", "Значение"],
        [
            ["Компания", "MICROGREEN AND STRAWBERRY MChJ"],
            ["СТИР (ИНН)", "312 515 546"],
            ["Директор", "Radjabov Diyorbek Erkinjonovich"],
            ["Дата регистрации", "20.10.2025"],
            ["Город", "Samarqand"],
            ["Валюта", "UZS"],
            ["Курс USD", f"{num(M.USD_RATE)} UZS/$"],
            ["Начало периода", labels[0]],
            ["Конец периода", labels[-1]],
            ["Горизонт", f"{n} месяцев"],
            ["Налоговый режим", f"упрощённый, {M.TAX_RATE:.0%} с оборота"],
        ],
    ))

    # ── Инвестиция ───────────────────────────────────────────────────────
    parts.append("\n## 2. Инвестиция и её использование\n")
    rows = [[name, f"${num(usd)}", num(usd * M.USD_RATE),
             f"{usd / M.INVESTMENT_USD * 100:.1f}%"]
            for name, usd in M.BUDGET_USD.items()]
    rows.append(["Резерв (Zaxira)", f"${num(M.RESERVE_USD)}",
                 num(M.RESERVE_USD * M.USD_RATE),
                 f"{M.RESERVE_USD / M.INVESTMENT_USD * 100:.1f}%"])
    rows.append(["**ИТОГО**", f"**${num(M.INVESTMENT_USD)}**",
                 f"**{num(M.INVESTMENT_UZS)}**", "**100.0%**"])
    parts.append(table(["Статья", "USD", "UZS", "Доля"], rows))
    parts.append(
        f"\nТранш приходит одной суммой в **{labels[0]}** (первый месяц модели).\n"
        f"CAPEX (амортизируемая часть) = {num(m['capex_uzs'])} UZS, "
        f"амортизация {num(m['monthly_dep'])} UZS/мес на "
        f"{M.DEPRECIATION_MONTHS} месяцев, начиная с {labels[M.OPEX_SWITCH_MONTH - 1]}.\n"
    )

    # ── Тарифы ───────────────────────────────────────────────────────────
    parts.append("\n## 3. Тарифы\n")
    parts.append(table(
        ["Продукт", "Цена UZS", "Цена $", "Период"],
        [
            ["Подписка ресторана (Standard)", num(M.PRICE_RESTAURANT),
             f"{M.PRICE_RESTAURANT / M.USD_RATE:.0f}", "месяц"],
            ["Подписка семьи (средняя)", num(M.PRICE_FAMILY),
             f"{M.PRICE_FAMILY / M.USD_RATE:.0f}", "месяц"],
            ["Клубника премиум", num(M.STRAWBERRY_PRICE_KG),
             f"{M.STRAWBERRY_PRICE_KG / M.USD_RATE:.1f}", "кг"],
        ],
    ))
    parts.append(
        f"\nПотолок фермы: {M.STRAWBERRY_PLANTS} кустов × "
        f"{M.KG_PER_PLANT_YEAR} кг/год = "
        f"{round(M.STRAWBERRY_PLANTS * M.KG_PER_PLANT_YEAR / 12)} кг/мес = "
        f"**{num(m['strawberry_capacity'])} UZS/мес**. Больше с 60 м² не снять.\n"
    )

    # ── Помесячно ────────────────────────────────────────────────────────
    parts.append("\n## 4. Помесячные данные (основная таблица)\n")
    rows = []
    for i in range(n):
        rows.append([
            f"M{i + 1}", labels[i],
            str(m["restaurants"][i]), str(m["families"][i]),
            num(m["b2b"][i]), num(m["b2c"][i]), num(m["strawberry"][i]),
            num(m["revenue"][i]), num(m["cogs"][i]), num(m["opex_total"][i]),
            num(m["ebitda"][i]), num(m["net"][i]), num(m["cash"][i]),
        ])
    parts.append(table(
        ["#", "Месяц", "Рест.", "Семьи", "B2B", "B2C", "Клубника",
         "Выручка", "COGS", "OPEX", "EBITDA", "Чистая", "Касса"],
        rows,
    ))

    # ── OPEX ─────────────────────────────────────────────────────────────
    parts.append("\n## 5. OPEX по статьям (помесячно)\n")
    header = ["Статья"] + [f"M{i + 1}" for i in range(n)]
    rows = [[name] + [num(v) for v in values]
            for name, values in m["opex_rows"].items()]
    rows.append(["**ИТОГО**"] + [f"**{num(v)}**" for v in m["opex_total"]])
    parts.append(table(header, rows))

    # ── Квартально ───────────────────────────────────────────────────────
    parts.append("\n## 6. По кварталам (если форма просит кварталы)\n")
    rows = []
    for i, q in enumerate(quarters):
        rows.append([
            f"Q{i + 1}", q["label"], str(q["customers"]),
            str(q["restaurants"]), str(q["families"]),
            num(q["revenue_sum"]), num(q["gross_sum"]),
            num(q["opex_sum"]), num(q["net_sum"]), num(q["cash_end"]),
        ])
    parts.append(table(
        ["#", "Период", "Клиентов", "Рест.", "Семьи",
         "Выручка", "Валовая", "OPEX", "Чистая", "Касса"],
        rows,
    ))

    # ── По годам ─────────────────────────────────────────────────────────
    parts.append("\n## 7. По годам (если форма просит годы)\n")
    rows = []
    for year in range(2):
        start, end = year * 12, (year + 1) * 12
        rows.append([
            f"Год {year + 1}",
            f"{labels[start]} – {labels[end - 1]}",
            num(sum(m["revenue"][start:end])),
            num(sum(m["cogs"][start:end])),
            num(sum(m["gross"][start:end])),
            num(sum(m["opex_total"][start:end])),
            num(sum(m["ebitda"][start:end])),
            num(sum(m["net"][start:end])),
        ])
    parts.append(table(
        ["Год", "Период", "Выручка", "COGS", "Валовая", "OPEX", "EBITDA", "Чистая"],
        rows,
    ))

    # ── Метрики ──────────────────────────────────────────────────────────
    parts.append("\n## 8. Метрики стартапа\n")
    last = n - 1
    ratio = m["ltv"][last] / m["cac"][last]
    parts.append(table(
        ["Метрика", "Значение", "Как считается"],
        [
            ["MRR (последний месяц)", num(m["mrr"][last]),
             "подписки B2B + B2C, без клубники"],
            ["ARR (последний месяц)", num(m["arr"][last]), "MRR × 12"],
            ["ARPU (последний месяц)", num(m["arpu"][last]),
             "выручка / число клиентов"],
            ["ARPU B2B", num(M.PRICE_RESTAURANT), "тариф подписки ресторана"],
            ["ARPU B2C", num(M.PRICE_FAMILY), "средний семейный пакет"],
            ["CAC", num(m["cac"][last]),
             "(маркетинг + 40% зарплаты директора) / новые клиенты"],
            ["LTV", num(m["ltv"][last]),
             f"ARPU × валовая маржа × min(1/churn, {n} мес)"],
            ["LTV/CAC", f"{ratio:.0f}x", "LTV / CAC"],
            ["Payback", f"{m['cac'][last] / (m['arpu'][last] * m['gross_margin'][last]):.1f} мес",
             "CAC / (ARPU × валовая маржа)"],
            ["Churn (месячный)", f"{M.MONTHLY_CHURN * 100:.1f}%", "ушедшие / всего"],
            ["Retention", f"{(1 - M.MONTHLY_CHURN) * 100:.1f}%", "1 − churn"],
            ["Валовая маржа", f"{m['gross_margin'][last] * 100:.0f}%",
             "подписки 70%, клубника 55%"],
            ["Break-even", labels[m["break_even_index"]],
             "компания прибыльна с первого месяца"],
            ["ROI за период", f"{sum(m['net']) / M.INVESTMENT_UZS * 100:.0f}%",
             "чистая прибыль / инвестиция"],
        ],
    ))

    # ── Cap table ────────────────────────────────────────────────────────
    parts.append("\n## 9. Cap Table\n")
    parts.append(table(
        ["Участник", "Доля", "Роль"],
        [
            ["Radjabov Diyorbek Erkinjonovich", "100%",
             "единственный основатель и директор"],
            ["ESOP", "—", "не выделен"],
            ["Внешние инвесторы", "—",
             "до этого раунда внешних инвестиций не было"],
        ],
    ))
    parts.append(
        "\nУставный фонд: 1 100 000 UZS. Предыдущее финансирование — "
        "собственные средства.\n"
    )

    # ── Команда ──────────────────────────────────────────────────────────
    parts.append("\n## 10. Команда и штат\n")
    parts.append(table(
        ["Период", "Человек", "Состав"],
        [
            [f"{labels[0]} – {labels[M.OPEX_SWITCH_MONTH - 2]}", "2",
             "директор, помощник"],
            [f"{labels[M.OPEX_SWITCH_MONTH - 1]} – {labels[-1]}", "5",
             "директор, агроном, помощник, курьер, продавец"],
        ],
    ))
    parts.append(
        f"\nФонд оплаты труда: {num(M.OPEX_BEFORE['Ish haqi'])} UZS/мес до запуска "
        f"фермы, {num(M.OPEX_AFTER['Ish haqi'])} UZS/мес после.\n"
    )

    parts.append(
        "\n---\n\n"
        "Если в форме встретится поле, которого нет в этом листе, — напишите, "
        "какое именно. Считать его надо в `model.py`, а не подставлять на глаз: "
        "весь смысл пересборки был в том, чтобы ни одна цифра пакета не "
        "появлялась из воздуха.\n"
    )
    return "\n".join(parts)


def main() -> int:
    m = M.build()
    OUT.write_text(build(m), encoding="utf-8")
    print(f"[OK] {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
