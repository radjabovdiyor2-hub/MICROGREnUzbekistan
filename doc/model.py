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
# 12, а не 24: форма фонда (startupplan.uz) считает один период в год, и
# держать в пакете 24 месяца, когда подаётся 12, значит гарантировать
# расхождение. Ряды ниже оставлены на 24 значения — если горизонт вернут,
# менять придётся только эту строку.
MONTHS = 12

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

# ⚠️ ЦЕНЫ ПОДТВЕРЖДЕНЫ ВЛАДЕЛЬЦЕМ 18.08.2026 и заменили прежние оценки.
# Прежние значения (чек ресторана 200 000 при 5 поставках, семья 500 000,
# розница 100 000, клубника 110 000) считались от оборота 20 млн и не
# совпадали ни с прайсом, ни с формой фонда. Названы в долларах — здесь
# переведены по USD_RATE, чтобы источник цифры был виден.

# 1. Рестораны: заказами, не подпиской.
CHECK_RESTAURANT = 35 * USD_RATE  # $35 — средний чек за одну поставку
DELIVERIES_PER_MONTH = 3          # три поставки в месяц, а не пять
RESTAURANTS = (12, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
               23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35)

# 2. Семьи по подписке — единственный по-настоящему регулярный канал.
PRICE_FAMILY = 360_000            # средний семейный пакет в месяц
FAMILIES = (15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 34,
            36, 38, 40, 42, 45, 48, 50, 52, 55, 57, 58, 60)

# 3. Розница «с улицы»: поштучно, средний чек $10.
CHECK_RETAIL = 10 * USD_RATE
RETAIL_PURCHASES = (205, 210, 220, 230, 245, 260, 275, 290, 305, 320, 335, 350,
                    365, 380, 395, 410, 425, 440, 455, 470, 485, 500, 515, 530)

MONTHLY_CHURN = 0.025             # 2,5 % в месяц

# ── Клубника: потолок задаёт ферма, а не желание ─────────────────────────
STRAWBERRY_PLANTS = 2_700
KG_PER_PLANT_YEAR = 1.0           # консервативно для NFT-гидропоники
# $25 за кг — премиум-калибр, подтверждено владельцем. Цена, от которой к концу
# года зависит половина выручки: на потолке фермы это 73 млн из 146 млн в месяц.
# Каждые $5 за кг — примерно 54 млн EBITDA за год, поэтому если часть урожая
# уходит не премиум-калибром, здесь должна стоять СМЕСЬ цен, а не верхняя.
STRAWBERRY_PRICE_KG = 25 * USD_RATE
FARM_BUILD_MONTHS = 3             # KPI: ферма строится 3 месяца
STRAWBERRY_RAMP = (0.25, 0.50, 0.75)

# ── Операционные расходы ─────────────────────────────────────────────────
#
# ✅ ПОДТВЕРЖДЕНО ВЛАДЕЛЬЦЕМ 18.08.2026. Здесь стояла оценка с пометкой
# «требует подтверждения»: она была посчитана от оборота 20 млн и занижала
# расходы вдвое с лишним. Владелец назвал фактические — они ниже.
#
# Одним периодом, без ступеней: расходы уже идут по факту, а не «после
# запуска фермы». Единственное изменение внутри года — второй курьер, и оно
# вынесено отдельной константой, потому что вытекает из расчёта нагрузки,
# а не из чьей-то оценки.
#
# Зарплата разложена: водитель-продавец (одно лицо) 9 млн + гровер 4 млн +
# директор $1 000 = 13 млн. Свет входит в коммуналку, отдельной строки нет —
# поэтому «Elektr energiya» здесь больше не встречается.
OPEX = {
    "Ish haqi": 9_000_000 + 4_000_000 + 1_000 * USD_RATE,
    "Ijara + kommunal": 400 * USD_RATE + 6_000_000,   # аренда $400 + коммуналка
    "Materiallar": 2_000_000,
    "Marketing": 1_500_000,
    "Transport": 1_500_000,          # топливо и обслуживание: водитель в зарплате
    "Boshqa": 500_000,
}

# Второй курьер. Не оценка, а следствие: рестораны по три поставки в месяц,
# подписка раз в неделю, розница вся с доставкой — к марту это 16 адресов в
# рабочий день, к августу 21. Один человек, который вдобавок продаёт, столько
# не объезжает. Экономить здесь значило бы показать фонду прибыль, которой
# не будет.
SECOND_COURIER_FROM_MONTH = 7     # M7 = Mar'27
SECOND_COURIER_SALARY = 9_000_000

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
    """Расходы месяца. Ступень одна — второй курьер, и та посчитана."""
    base = dict(OPEX)
    if i >= SECOND_COURIER_FROM_MONTH - 1:
        base["Ish haqi"] += SECOND_COURIER_SALARY
    return base


def deliveries_per_month(i: int) -> int:
    """Сколько адресов объезжаем за месяц — основание для второго курьера.

    Считается здесь, а не в голове: рестораны по `DELIVERIES_PER_MONTH`,
    подписка раз в неделю, розница вся с доставкой (подтверждено владельцем).
    """
    return (RESTAURANTS[i] * DELIVERIES_PER_MONTH
            + FAMILIES[i] * 4
            + RETAIL_PURCHASES[i])


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

    opex_rows: dict[str, list[int]] = {k: [] for k in OPEX}
    for i in range(MONTHS):
        month_opex = _opex_for_month(i)
        for key in opex_rows:
            opex_rows[key].append(month_opex[key])

    # Оборотного налога больше нет: компания на общем режиме. Налог на прибыль
    # считается в самом конце, от результата, а не от выручки, — поэтому в
    # операционные расходы он не входит.
    opex_total = [sum(opex_rows[k][i] for k in opex_rows) for i in range(MONTHS)]

    monthly_dep = round(capex_uzs() / DEPRECIATION_MONTHS)
    # Амортизация идёт с месяца, когда ферма построена и оборудование введено
    # в работу, — раньше начислять нечего.
    depreciation = [0 if i < FARM_BUILD_MONTHS else monthly_dep
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

    # На продажи относится доля зарплаты ТЕХ, КТО ПРОДАЁТ: директора и
    # водителя-продавца. Гровер и второй курьер не продают, и включать их в
    # стоимость привлечения — значит завысить CAC на ровном месте. Раньше
    # база бралась строкой «Ish haqi» целиком, когда в ней был один оклад.
    selling_payroll = 9_000_000 + 1_000 * USD_RATE   # водитель-продавец + директор
    sales_cost = [opex_rows["Marketing"][i]
                  + round(selling_payroll * SALES_SALARY_SHARE)
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
        # ⚠️ СРЕЗ ПО ГОРИЗОНТУ, А НЕ ВЕСЬ КОРТЕЖ.
        # Кортежи выше объявлены на 24 значения намеренно — чтобы вернуть
        # горизонт правкой одной константы MONTHS. Но отдавать их целиком
        # нельзя: все остальные ряды здесь длиной MONTHS, и потребитель,
        # берущий [-1], получал по клиентам месяц 24, а по выручке месяц 12.
        # Из-за этого в XULOSA стояло «Doimiy mijozlar (M12) = 56» с разбивкой
        # «35 restoran + 60 oila» (= 95), а лист «1. Mijozlar» уезжал на 12
        # колонок правее собственной шапки.
        "restaurants": list(RESTAURANTS[:MONTHS]),
        "families": list(FAMILIES[:MONTHS]),
        "retail_purchases": list(RETAIL_PURCHASES[:MONTHS]),
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
