"""
Финансовая модель MICROGREEN AND STRAWBERRY — ЕДИНСТВЕННЫЙ источник цифр.

Всё, что попадает в Excel, в пять Word-документов и в онлайн-форму фонда,
считается здесь. Руками ничего не набирается: пакет разъехался ровно потому,
что одни и те же величины вводились в четырёх местах независимо.

КАК ЗАРАБАТЫВАЕТ КОМПАНИЯ (уточнено 13.08.2026 у владельца)

Не помесячными подписками, как было написано во всех документах, а тремя
разными способами — и это принципиально, потому что от структуры зависят и
ARPU, и рост, и то, что даст новая ферма:

  · Рестораны берут ЗАКАЗАМИ. Чек ~200 000 сум за поставку, поставок около
    пяти в месяц. Прежняя версия документов писала «ARPU ресторана 200 000 в
    МЕСЯЦ» — отсюда и брались 5,2 млн выручки в таблицах, не сходившиеся с
    45 млн в соседней строке. А вчерашняя правка заменила 200 000 на 2 500 000
    по прайсу подписки — и это тоже было неверно: подписку почти не покупают.
  · Семьи — единственный по-настоящему подписной канал, 15 семей.
  · Розница «с улицы» — самый крупный поток: люди берут поштучно, средний чек
    около 100 000 сум.

Итого на сегодня 40 млн сум/мес, из них рестораны ~30 %, остальное — семьи и
розница. Именно розницу расширяет новая ферма: клубника продаётся в первую
очередь ей.

ЧТО ЕЩЁ ИЗМЕНИЛОСЬ ПОСЛЕ АУДИТА

  · Календарь. Прежняя модель шла Jul'25…Jun'27 с приходом транша в Jan'26 —
    на момент подачи 14 месяцев из 24 лежали в прошлом. Теперь M1 = Sep'26.
  · Клубника ограничена физикой фермы: 2700 кустов × 1 кг/год = 225 кг/мес =
    24,75 млн/мес. Прежняя модель доводила её до 100 млн — вчетверо больше
    того, что растёт на 60 м².
  · Бюджет закрывает всю сумму: 455 млн расписаны до последнего сума.
  · Налоги. Компания — плательщик НДС, а значит на общем режиме: прежние 4 % с
    оборота платят как раз те, кто НДС не платит. Теперь НДС идёт транзитом
    (выручка в P&L считается без него), а вместо оборотного налога — налог на
    прибыль. Из-за этого выручка в отчётности на ~11 % ниже суммы, которую
    платят клиенты: 40 млн с НДС = 35,7 млн выручки.
  · Денежный поток. В оттоке не было себестоимости — касса прирастала на
    величину закупок, которых будто бы не совершалось. Добавлены COGS, НДС и
    налог на прибыль.
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

# Уже вложено основателем из личных средств — до этого раунда, деньгами.
# В заявке (п. 34) сумма обязана быть названа: она показывает фонду, что у
# основателя своя шкура в игре, и объясняет, откуда взялась текущая выручка.
FOUNDER_INVESTED_USD = 50_000

# Бюджет: статьи $30 000 + резерв $5 000 = $35 000. Резерв показан ОДИН раз.
BUDGET_USD = {
    "Bino tayyorlash": 3_830,          # ремонт + 6 месяцев аренды новой площади
    "Premium uskunalar": 7_185,        # 15 стеллажей, 45 NFT-лотков, насосы
    "LED + klimat": 4_875,             # фитолампы, кондиционер, вентиляция
    "Ekin materiallari": 3_923,        # 2700 кустов, субстрат, запуск
    "Marketing + IT + oborot": 10_187, # бренд, реклама, оборотные средства
}
RESERVE_USD = 5_000

CAPEX_ITEMS = ("Premium uskunalar", "LED + klimat", "Ekin materiallari")
DEPRECIATION_MONTHS = 60

# ══════════════════════════════════════════════════════════════════════════
# ТРИ КАНАЛА ПРОДАЖ. M1 — факт на дату подачи, дальше рост от него.
# ══════════════════════════════════════════════════════════════════════════

# 1. Рестораны: заказами, не подпиской.
CHECK_RESTAURANT = 200_000        # средний чек за одну поставку
DELIVERIES_PER_MONTH = 5          # примерно раз в неделю плюс довоз
RESTAURANTS = (12, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
               23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35)

# 2. Семьи по подписке — единственный по-настоящему регулярный канал.
PRICE_FAMILY = 500_000            # средний семейный пакет в месяц
FAMILIES = (15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 34,
            36, 38, 40, 42, 45, 48, 50, 52, 55, 57, 58, 60)

# 3. Розница «с улицы»: поштучно, средний чек ~100 000.
CHECK_RETAIL = 100_000
RETAIL_PURCHASES = (205, 210, 220, 230, 245, 260, 275, 290, 305, 320, 335, 350,
                    365, 380, 395, 410, 425, 440, 455, 470, 485, 500, 515, 530)

MONTHLY_CHURN = 0.025             # 2,5 % в месяц

# ── Клубника: потолок задаёт ферма, а не желание ─────────────────────────
STRAWBERRY_PLANTS = 2_700
KG_PER_PLANT_YEAR = 1.0           # консервативно для NFT-гидропоники
STRAWBERRY_PRICE_KG = 110_000
FARM_BUILD_MONTHS = 3             # KPI: ферма строится 3 месяца
STRAWBERRY_RAMP = (0.25, 0.50, 0.75)

# ── Операционные расходы ─────────────────────────────────────────────────
#
# ⚠️ ДОПУЩЕНИЕ, ТРЕБУЮЩЕЕ ПОДТВЕРЖДЕНИЯ ВЛАДЕЛЬЦА.
# Точных текущих расходов при обороте 40 млн/мес у нас нет. Прежние значения
# в модели (зарплата 3 млн, аренда 1 млн, электричество 1,5 млн) считались от
# оборота 20 млн и при вдвое большем обороте занижены. Ниже — оценка, от
# которой напрямую зависит прибыль, а её фонд смотрит первой. Три верхние
# строки надо либо подтвердить, либо поправить.
OPEX_BEFORE = {
    "Ish haqi": 6_000_000,
    "Ijara + kommunal": 2_000_000,
    "Elektr energiya": 3_000_000,
    "Materiallar": 2_000_000,
    "Marketing": 1_500_000,
    "Transport": 1_500_000,
    "Boshqa": 500_000,
}
# После запуска второй фермы: агроном, помощник, курьер; LED и климат.
OPEX_AFTER = {
    "Ish haqi": 10_000_000,
    "Ijara + kommunal": 3_000_000,
    "Elektr energiya": 6_000_000,
    "Materiallar": 3_500_000,
    "Marketing": 2_000_000,
    "Transport": 2_000_000,
    "Boshqa": 800_000,
}
OPEX_SWITCH_MONTH = 4             # ферма запущена — расходы новой площадки
RENT_PREPAID_MONTHS = 6           # аренда новой площади оплачена вперёд

# ── Налоги: общий режим, компания плательщик НДС ─────────────────────────
#
# Раньше модель считала 4 % с оборота — упрощённый режим. Но оборотный налог
# платят те, кто НЕ является плательщиком НДС; у плательщика НДС общий режим:
# НДС с реализации плюс налог на прибыль вместо оборотного.
#
# ⚠️ ДВА ДОПУЩЕНИЯ, ТРЕБУЮЩИЕ ПОДТВЕРЖДЕНИЯ:
#
# 1. `REVENUE_INCLUDES_VAT = True` — считаем, что названные 40 млн/мес это то,
#    что платят клиенты, то есть сумма С НДС. Для розницы это почти наверняка
#    так (розничная цена всегда с налогом). Если 40 млн — выручка БЕЗ НДС, а
#    клиенты платят сверху 44,8 млн, поставьте False: выручка и прибыль
#    вырастут на 12 %. Занижать безопаснее, поэтому по умолчанию True.
#
# 2. `PROFIT_TAX_RATE = 0.12` — ставка, которую сама платформа фонда
#    (startupplan.uz) помечает как «12% (standart)». Взята именно она, а не
#    моя оценка в 15 %: расчёт фонда и бумажный пакет обязаны давать одну
#    прибыль, иначе рецензент увидит два разных ответа на один вопрос.
#    Бухгалтеру стоит подтвердить ставку; если она 15 %, здесь одна цифра.
#
# НДС в P&L расходом не является: он собирается с покупателя и перечисляется
# в бюджет. Поэтому прибыль считается от выручки БЕЗ НДС, а сам НДС проходит
# транзитом. Входящий НДС по закупкам уменьшает платёж в бюджет; здесь он не
# моделируется — это в пользу консервативности.
VAT_RATE = 0.12
REVENUE_INCLUDES_VAT = True
PROFIT_TAX_RATE = 0.12

COGS_GOODS = 0.30                 # микрозелень, салаты: маржа 70 %
COGS_STRAWBERRY = 0.45            # клубника: маржа 55 %

# Доля зарплаты, отнесённая на продажи, — чтобы CAC не выглядел бесплатным.
SALES_SALARY_SHARE = 0.40

OPENING_CASH = 5_000_000


def month_labels() -> list[str]:
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
    capacity = strawberry_capacity_uzs()
    series = []
    for i in range(MONTHS):
        after_build = i - FARM_BUILD_MONTHS
        if after_build < 0:
            series.append(0)
        elif after_build < len(STRAWBERRY_RAMP):
            series.append(round(capacity * STRAWBERRY_RAMP[after_build]))
        else:
            series.append(capacity)
    return series


def net_of_vat(amount: float) -> int:
    """Выручка без НДС. Если цены названы без налога, делитель равен единице."""
    if not REVENUE_INCLUDES_VAT:
        return round(amount)
    return round(amount / (1.0 + VAT_RATE))


def _opex_for_month(i: int) -> dict[str, int]:
    base = dict(OPEX_BEFORE if i < OPEX_SWITCH_MONTH - 1 else OPEX_AFTER)
    if i < RENT_PREPAID_MONTHS:
        base["Ijara + kommunal"] = OPEX_BEFORE["Ijara + kommunal"]
    return base


def build() -> dict:
    labels = month_labels()

    # Цены каналов — это то, что платит клиент, то есть суммы С НДС. В отчёте о
    # прибылях выручкой считается сумма БЕЗ налога: НДС компании не принадлежит,
    # она лишь собирает его с покупателя и перечисляет в бюджет.
    b2b_gross = [RESTAURANTS[i] * CHECK_RESTAURANT * DELIVERIES_PER_MONTH
                 for i in range(MONTHS)]
    subs_gross = [FAMILIES[i] * PRICE_FAMILY for i in range(MONTHS)]
    retail_gross = [RETAIL_PURCHASES[i] * CHECK_RETAIL for i in range(MONTHS)]
    strawberry_gross = _strawberry_series()

    b2b = [net_of_vat(v) for v in b2b_gross]
    subscriptions = [net_of_vat(v) for v in subs_gross]
    retail = [net_of_vat(v) for v in retail_gross]
    strawberry = [net_of_vat(v) for v in strawberry_gross]

    goods = [b2b[i] + subscriptions[i] + retail[i] for i in range(MONTHS)]
    revenue = [goods[i] + strawberry[i] for i in range(MONTHS)]

    revenue_gross = [b2b_gross[i] + subs_gross[i] + retail_gross[i]
                     + strawberry_gross[i] for i in range(MONTHS)]
    # НДС к уплате. Входящий налог по закупкам его уменьшил бы, но поставщики
    # сельхозсырья часто вне НДС, поэтому вычет не моделируется — в запас.
    vat_payable = [revenue_gross[i] - revenue[i] for i in range(MONTHS)]

    cogs = [round(goods[i] * COGS_GOODS + strawberry[i] * COGS_STRAWBERRY)
            for i in range(MONTHS)]
    gross = [revenue[i] - cogs[i] for i in range(MONTHS)]

    opex_rows: dict[str, list[int]] = {k: [] for k in OPEX_AFTER}
    for i in range(MONTHS):
        month_opex = _opex_for_month(i)
        for key in opex_rows:
            opex_rows[key].append(month_opex[key])

    # Оборотного налога больше нет: компания на общем режиме. Налог на прибыль
    # считается в самом конце, от результата, а не от выручки, — поэтому в
    # операционные расходы он не входит.
    opex_total = [sum(opex_rows[k][i] for k in opex_rows) for i in range(MONTHS)]

    monthly_dep = round(capex_uzs() / DEPRECIATION_MONTHS)
    depreciation = [0 if i < OPEX_SWITCH_MONTH - 1 else monthly_dep
                    for i in range(MONTHS)]

    ebitda = [gross[i] - opex_total[i] for i in range(MONTHS)]
    ebit = [ebitda[i] - depreciation[i] for i in range(MONTHS)]
    tax = [round(max(0, ebit[i]) * PROFIT_TAX_RATE) for i in range(MONTHS)]
    net = [ebit[i] - tax[i] for i in range(MONTHS)]

    cumulative, running = [], 0
    for value in net:
        running += value
        cumulative.append(running)

    # ── Денежный поток ───────────────────────────────────────────────────
    investment = [INVESTMENT_UZS if i == 0 else 0 for i in range(MONTHS)]
    capex_flow = [capex_uzs() if i == 0 else 0 for i in range(MONTHS)]
    building_prep = [BUDGET_USD["Bino tayyorlash"] * USD_RATE if i == 0 else 0
                     for i in range(MONTHS)]

    # Приход — то, что реально платят клиенты, то есть вместе с НДС.
    inflow = [revenue_gross[i] + investment[i] for i in range(MONTHS)]
    # Расход. Себестоимости здесь раньше не было вовсе: касса росла на величину
    # закупок, которых будто бы не происходило, и за 24 месяца набегали сотни
    # миллионов несуществующих денег. Теперь в оттоке и COGS, и НДС, и налог.
    outflow = [cogs[i] + opex_total[i] + tax[i] + vat_payable[i]
               + capex_flow[i] + building_prep[i] for i in range(MONTHS)]
    net_cf = [inflow[i] - outflow[i] for i in range(MONTHS)]

    cash, balance = [], OPENING_CASH
    for value in net_cf:
        balance += value
        cash.append(balance)

    # ── Клиенты и метрики ────────────────────────────────────────────────
    # Розничные покупки — это чеки, а не люди. Считаем плательщиков честно:
    # ресторан и семья по подписке — постоянные клиенты, розница — покупки.
    regulars = [RESTAURANTS[i] + FAMILIES[i] for i in range(MONTHS)]
    new_regulars = [0] + [max(0, regulars[i] - regulars[i - 1])
                          for i in range(1, MONTHS)]
    arpu = [round(revenue[i] / regulars[i]) for i in range(MONTHS)]
    arpu_restaurant = CHECK_RESTAURANT * DELIVERIES_PER_MONTH

    sales_cost = [opex_rows["Marketing"][i]
                  + round(opex_rows["Ish haqi"][i] * SALES_SALARY_SHARE)
                  for i in range(MONTHS)]
    cac = [round(sales_cost[i] / new_regulars[i]) if new_regulars[i] else None
           for i in range(MONTHS)]

    # LTV: срок жизни ограничен горизонтом модели — обещать доход дальше того,
    # что посчитали, нельзя.
    lifetime_months = min(1 / MONTHLY_CHURN, MONTHS)
    gross_margin = [gross[i] / revenue[i] for i in range(MONTHS)]
    ltv = [round(arpu[i] * gross_margin[i] * lifetime_months) for i in range(MONTHS)]

    # MRR — только по-настоящему повторяющаяся выручка: подписки семей и
    # регулярные заказы ресторанов. Розница поштучно повторяющейся не является.
    mrr = [b2b[i] + subscriptions[i] for i in range(MONTHS)]
    arr = [mrr[i] * 12 for i in range(MONTHS)]

    break_even_index = next((i for i, value in enumerate(net) if value > 0), None)

    return {
        "labels": labels,
        "restaurants": list(RESTAURANTS),
        "families": list(FAMILIES),
        "retail_purchases": list(RETAIL_PURCHASES),
        "regulars": regulars,
        "customers": regulars,
        "new_customers": new_regulars,
        "b2b": b2b,
        "subscriptions": subscriptions,
        "retail": retail,
        # То же самое в суммах, которые платит клиент: этими цифрами владелец
        # оперирует в разговоре и их же видно по банковской выписке.
        "b2b_gross": b2b_gross,
        "subs_gross": subs_gross,
        "retail_gross": retail_gross,
        "b2c": [subscriptions[i] + retail[i] for i in range(MONTHS)],
        "goods": goods,
        "strawberry": strawberry,
        "revenue": revenue,
        "revenue_gross": revenue_gross,
        "vat_payable": vat_payable,
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
        "arpu_restaurant": arpu_restaurant,
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
    """Агрегация по кварталам — из неё строятся квартальные таблицы Word."""
    result = []
    for start in range(0, MONTHS, 3):
        end = start + 3
        last = end - 1
        result.append({
            "label": f"{model['labels'][start]} – {model['labels'][last]}",
            "customers": model["regulars"][last],
            "restaurants": model["restaurants"][last],
            "families": model["families"][last],
            "retail_purchases": model["retail_purchases"][last],
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
