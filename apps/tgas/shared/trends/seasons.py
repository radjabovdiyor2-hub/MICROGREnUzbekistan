from datetime import date

_SEASON = {
    12: "зима",
    1: "зима",
    2: "зима",
    3: "весна",
    4: "весна",
    5: "весна",
    6: "лето",
    7: "лето",
    8: "лето",
    9: "осень",
    10: "осень",
    11: "осень",
}

_RAMADAN = {
    2026: ((2, 18), (3, 20)),
    2027: ((2, 8), (3, 9)),
    2028: ((1, 28), (2, 26)),
}

def get_uz_season_occasion(d: date | None = None) -> dict:
    d = d or date.today()
    m, day = d.month, d.day
    season = _SEASON.get(m, "")
    occ: list[str] = []

    fixed = {
        (1, 1): "Новый год",
        (3, 8): "8 марта — Международный женский день",
        (9, 1): "1 сентября — День независимости и начало учебного года",
        (10, 1): "1 октября — День учителя и наставника",
        (12, 8): "8 декабря — День Конституции",
    }
    for (mm, dd), name in fixed.items():
        if m == mm and abs(day - dd) <= 2:
            occ.append(name)

    if m == 3 and 15 <= day <= 24:
        occ.append("Навруз — весенний праздник обновления")
    if m in (6, 7, 8):
        occ.append("сезон жары")
    if m in (9, 10):
        occ.append("сезон урожая")
    if m in (5, 6):
        occ.append("сезон экзаменов")
    if (m == 8 and day >= 20) or (m == 9 and day <= 10):
        occ.append("подготовка к школе")

    ram = _RAMADAN.get(d.year)
    if ram:
        (sm, sd), (em, ed) = ram
        try:
            if date(d.year, sm, sd) <= d <= date(d.year, em, ed):
                occ.append("месяц Рамазан (ифтар и сухур)")
        except ValueError:
            pass

    return {"season": season, "occasion": ", ".join(occ)}
