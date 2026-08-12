"""
Финансовая модель MICROGREEN AND STRAWBERRY — ЕДИНСТВЕННЫЙ источник цифр.

Всё, что попадает в Excel и в пять Word-документов, считается здесь. Word руками
не правится: пакет разъехался ровно потому, что одни и те же величины набирались
в четырёх местах независимо.

ЧТО ИЗМЕНИЛОСЬ ПОСЛЕ АУДИТА 12.08.2026

1. Календарь. Прежняя модель шла Jul'25…Jun'27 с приходом транша в Jan'26 — то
   есть на момент подачи 14 месяцев из 24 лежали в прошлом, а «получение
   инвестиции» было датировано семью месяцами ранее. Теперь M1 = Sep'26.

2. База. Прежняя модель рисовала рост с 20 до 100 млн/мес за Jul'25–Jul'26,
   тогда как заявка (Ariza, п. 32) честно указывает: последние 12 месяцев —
   ~20 млн/мес, 5 ресторанов + 15 семей. Факт не изменился и на август 2026.
   Модель стартует ровно с него: заявка и модель наконец сходятся в одной точке.

3. Клубника ограничена физикой фермы. Прежняя модель доводила её до 100 млн/мес
   с 60 м² и 2700 кустов. При урожайности даже 1 кг с куста в год это 2700 кг,
   то есть 225 кг/мес, то есть 24,75 млн/мес при цене 110 000/кг — вчетверо
   меньше обещанного. Ферма упирается в потолок, и это сказано прямо: следующий
   раунд расширяет площадь, а не выжимает невозможное из имеющейся.

4. Бюджет закрывает всю сумму. 455 млн транша расписаны до последнего сума:
   CAPEX + подготовка помещения + маркетинг/оборотка + резерв. Раньше CAPEX был
   204,75 млн, а остальные 250 млн просто лежали в кассе без объяснения.
"""

from __future__ import annotations

# ── Календарь ────────────────────────────────────────────────────────────
START_YEAR = 2026
START_MONTH = 9          # сентябрь 2026 — первый месяц после подачи
MONTHS = 24

_MONTH_ABBR = ("Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

# ── Курс и инвестиция ────────────────────────────────────────────────────
USD_RATE = 13_000
INVESTMENT_USD = 35_000
INVESTMENT_UZS = INVESTMENT_USD * USD_RATE          # 455 000 000

# Бюджет: статьи $30 000 + резерв $5 000 = $35 000. Резерв показан ОДИН раз.
BUDGET_USD = {
    "Bino tayyorlash": 3_830,          # ремонт + 6 месяцев аренды новой площади
    "Premium uskunalar": 7_185,        # 15 стеллажей, 45 NFT-лотков, насосы
    "LED + klimat": 4_875,             # фитолампы, кондиционер, вентиляция
    "Ekin materiallari": 3_923,        # 2700 кустов, субстрат, запуск
    "Marketing + IT + oborot": 10_187, # бренд, реклама, оборотные средства
}
RESERVE_USD = 5_000

# Капитальные статьи — то, что амортизируется. Аренда и маркетинг не капитал.
CAPEX_ITEMS = ("Premium uskunalar", "LED + klimat", "Ekin materiallari")
DEPRECIATION_MONTHS = 60

# ── Клиентская база ──────────────────────────────────────────────────────
# M1 — факт на дату подачи: 5 ресторанов + 15 семей = 20 млн/мес.
# Дальше рост от этой точки, а не от вымышленных 18 ресторанов.
RESTAURANTS = (5, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
               16, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30)
FAMILIES = (15, 16, 18, 20, 23, 26, 29, 33, 37, 41, 45, 50,
            55, 60, 66, 72, 78, 85, 92, 100, 108, 116, 124, 132)

PRICE_RESTAURANT = 2_500_000   # Restoran-Standard, лист «Tariflar»
PRICE_FAMILY = 500_000         # средний семейный пакет

MONTHLY_CHURN = 0.025          # 2,5 % в месяц

# ── Клубника: потолок задаёт ферма, а не желание ─────────────────────────
STRAWBERRY_PLANTS = 2_700
KG_PER_PLANT_YEAR = 1.0        # консервативно для NFT-гидропоники
STRAWBERRY_PRICE_KG = 110_000  # лист «Tariflar», Premium qulupnay 1 kg
FARM_BUILD_MONTHS = 3          # KPI: ферма строится 3 месяца
# Выход на мощность: первый урожай на 4-й месяц, полная мощность к 7-му.
STRAWBERRY_RAMP = (0.25, 0.50, 0.75)

# ── Операционные расходы ─────────────────────────────────────────────────
# «До фермы» — фактические расходы сегодняшней работы (2 человека).
# «После фермы» — с M4, когда добавляются агроном, помощник и курьер.
OPEX_BEFORE = {
    "Ish haqi": 3_000_000,
    "Ijara + kommunal": 1_000_000,
    "Elektr energiya": 1_500_000,
    "Materiallar": 800_000,
    "Marketing": 1_500_000,
    "Transport": 300_000,
    "Boshqa": 200_000,
}
OPEX_AFTER = {
    "Ish haqi": 8_000_000,
    "Ijara + kommunal": 1_800_000,
    "Elektr energiya": 4_300_000,
    "Materiallar": 2_500_000,
    "Marketing": 1_000_000,
    "Transport": 800_000,
    "Boshqa": 500_000,
}
OPEX_SWITCH_MONTH = 4          # ферма запущена — расходы новой площадки
# Аренда новой площади оплачена вперёд на 6 месяцев из статьи «Bino tayyorlash»,
# поэтому в OPEX она появляется только с 7-го месяца.
RENT_PREPAID_MONTHS = 6

TAX_RATE = 0.04                # упрощённый оборотный налог
COGS_SUBSCRIPTION = 0.30       # микрозелень/салаты: маржа 70 %
COGS_STRAWBERRY = 0.45         # клубника: маржа 55 %, как в прайсе

# Доля зарплаты директора, отнесённая на продажи, — чтобы CAC не выглядел
# бесплатным. Клиентов приводят дегустации, которые проводит директор лично.
SALES_SALARY_SHARE = 0.40

OPENING_CASH = 5_000_000


def month_labels() -> list[str]:
    """['Sep'26', 'Oct'26', …] — 24 подписи от START_MONTH."""
    labels = []
    year, month = START_YEAR, START_MONTH
    for _ in range(MONTHS):
        labels.append(f"{_MONTH_ABBR[month - 1]}'{str(year)[2:]}")
        month += 1
        if month > 12:
            month, year = 1, year + 1
    return labels


def capex_uzs() -> int:
    return sum(BUDGET_USD[k] for k in CAPEX_ITEMS) * USD_RATE


def strawberry_capacity_uzs() -> int:
    """Выручка фермы на полной мощности, сум/мес."""
    kg_per_month = STRAWBERRY_PLANTS * KG_PER_PLANT_YEAR / 12
    return round(kg_per_month * STRAWBERRY_PRICE_KG)


def _strawberry_series() -> list[int]:
    """Клубника по месяцам: ноль, пока ферма строится, затем выход на потолок."""
    capacity = strawberry_capacity_uzs()
    series = []
    for i in range(MONTHS):
        months_after_build = i - FARM_BUILD_MONTHS       # 0 на первом урожае
        if months_after_build < 0:
            series.append(0)
        elif months_after_build < len(STRAWBERRY_RAMP):
            series.append(round(capacity * STRAWBERRY_RAMP[months_after_build]))
        else:
            series.append(capacity)
    return series


def _opex_for_month(i: int) -> dict[str, int]:
    base = dict(OPEX_BEFORE if i < OPEX_SWITCH_MONTH - 1 else OPEX_AFTER)
    if i < RENT_PREPAID_MONTHS:
        # Аренда новой площади уже оплачена из статьи «Bino tayyorlash».
        base["Ijara + kommunal"] = OPEX_BEFORE["Ijara + kommunal"]
    return base


def build() -> dict:
    """Собрать модель. Все производные величины считаются здесь и только здесь."""
    labels = month_labels()
    strawberry = _strawberry_series()

    b2b = [RESTAURANTS[i] * PRICE_RESTAURANT for i in range(MONTHS)]
    b2c = [FAMILIES[i] * PRICE_FAMILY for i in range(MONTHS)]
    revenue = [b2b[i] + b2c[i] + strawberry[i] for i in range(MONTHS)]
    subscription = [b2b[i] + b2c[i] for i in range(MONTHS)]

    cogs = [round(subscription[i] * COGS_SUBSCRIPTION
                  + strawberry[i] * COGS_STRAWBERRY) for i in range(MONTHS)]
    gross = [revenue[i] - cogs[i] for i in range(MONTHS)]

    opex_rows: dict[str, list[int]] = {k: [] for k in OPEX_AFTER}
    for i in range(MONTHS):
        month_opex = _opex_for_month(i)
        for key in opex_rows:
            opex_rows[key].append(month_opex[key])

    tax = [round(revenue[i] * TAX_RATE) for i in range(MONTHS)]
    opex_rows["Soliq (4%)"] = tax
    opex_total = [sum(opex_rows[k][i] for k in opex_rows) for i in range(MONTHS)]

    # Амортизация начинается, когда ферма введена в строй, а не в день покупки.
    monthly_dep = round(capex_uzs() / DEPRECIATION_MONTHS)
    depreciation = [0 if i < OPEX_SWITCH_MONTH - 1 else monthly_dep
                    for i in range(MONTHS)]

    ebitda = [gross[i] - opex_total[i] + tax[i] for i in range(MONTHS)]  # ДО налога
    ebit = [gross[i] - opex_total[i] for i in range(MONTHS)]             # после налога
    net = [ebit[i] - depreciation[i] for i in range(MONTHS)]

    cumulative = []
    running = 0
    for value in net:
        running += value
        cumulative.append(running)

    # ── Денежный поток ───────────────────────────────────────────────────
    investment = [INVESTMENT_UZS if i == 0 else 0 for i in range(MONTHS)]
    capex_flow = [capex_uzs() if i == 0 else 0 for i in range(MONTHS)]
    building_prep = [BUDGET_USD["Bino tayyorlash"] * USD_RATE if i == 0 else 0
                     for i in range(MONTHS)]

    inflow = [revenue[i] + investment[i] for i in range(MONTHS)]
    outflow = [opex_total[i] + capex_flow[i] + building_prep[i] for i in range(MONTHS)]
    net_cf = [inflow[i] - outflow[i] for i in range(MONTHS)]

    cash = []
    balance = OPENING_CASH
    for value in net_cf:
        balance += value
        cash.append(balance)

    # ── Клиенты и метрики ────────────────────────────────────────────────
    customers = [RESTAURANTS[i] + FAMILIES[i] for i in range(MONTHS)]
    new_customers = [0] + [max(0, customers[i] - customers[i - 1])
                           for i in range(1, MONTHS)]
    arpu = [round(revenue[i] / customers[i]) for i in range(MONTHS)]

    # CAC учитывает не только рекламу: клиентов приводят дегустации, которые
    # проводит директор. Без его времени CAC выглядел бы почти нулевым, и
    # LTV/CAC улетал в сотни — цифра, из-за которой перепроверяют всю модель.
    sales_cost = [opex_rows["Marketing"][i]
                  + round(opex_rows["Ish haqi"][i] * SALES_SALARY_SHARE)
                  for i in range(MONTHS)]
    cac = [round(sales_cost[i] / new_customers[i]) if new_customers[i] else None
           for i in range(MONTHS)]

    # LTV по явной формуле: ARPU × брутто-маржа × срок жизни.
    #
    # Срок жизни ограничен горизонтом модели: 1/churn даёт 40 месяцев, но
    # обещать доход за пределами того, что мы сами посчитали, нельзя. Берём
    # меньшее из двух — так цифра защищается, а не вызывает желание
    # перепроверить всю модель (прежняя версия давала LTV/CAC 174x).
    lifetime_months = min(1 / MONTHLY_CHURN, MONTHS)
    gross_margin = [gross[i] / revenue[i] for i in range(MONTHS)]
    ltv = [round(arpu[i] * gross_margin[i] * lifetime_months) for i in range(MONTHS)]

    mrr = subscription[:]                       # клубника не подписка
    arr = [mrr[i] * 12 for i in range(MONTHS)]

    break_even_index = next((i for i, value in enumerate(net) if value > 0), None)

    return {
        "labels": labels,
        "restaurants": list(RESTAURANTS),
        "families": list(FAMILIES),
        "customers": customers,
        "new_customers": new_customers,
        "b2b": b2b,
        "b2c": b2c,
        "strawberry": strawberry,
        "revenue": revenue,
        "cogs": cogs,
        "gross": gross,
        "gross_margin": gross_margin,
        "opex_rows": opex_rows,
        "opex_total": opex_total,
        "tax": tax,
        "ebitda": ebitda,
        "ebit": ebit,
        "depreciation": depreciation,
        "net": net,
        "cumulative": cumulative,
        "investment": investment,
        "capex": capex_flow,
        "building_prep": building_prep,
        "inflow": inflow,
        "outflow": outflow,
        "net_cf": net_cf,
        "cash": cash,
        "arpu": arpu,
        "cac": cac,
        "ltv": ltv,
        "mrr": mrr,
        "arr": arr,
        "break_even_index": break_even_index,
        "monthly_dep": monthly_dep,
        "capex_uzs": capex_uzs(),
        "strawberry_capacity": strawberry_capacity_uzs(),
    }


def quarters(model: dict) -> list[dict]:
    """Агрегация по кварталам — из неё строятся все квартальные таблицы Word."""
    result = []
    for start in range(0, MONTHS, 3):
        end = start + 3
        last = end - 1
        result.append({
            "label": f"{model['labels'][start]} – {model['labels'][last]}",
            "customers": model["customers"][last],
            "restaurants": model["restaurants"][last],
            "families": model["families"][last],
            "new_customers": sum(model["new_customers"][start:end]),
            "revenue_month": model["revenue"][last],
            "revenue_sum": sum(model["revenue"][start:end]),
            "strawberry_month": model["strawberry"][last],
            "gross_sum": sum(model["gross"][start:end]),
            "opex_sum": sum(model["opex_total"][start:end]),
            "net_sum": sum(model["net"][start:end]),
            "cash_end": model["cash"][last],
        })
    return result
