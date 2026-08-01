from datetime import date
from typing import Optional
from shared.content_plan.utils import _pick
from shared.content_plan.core import pick_language

WORLD_CUISINES = [
    "итальянская",
    "японская",
    "мексиканская",
    "тайская",
    "французская",
    "индийская",
    "корейская",
    "греческая (средиземноморская)",
    "турецкая",
    "вьетнамская",
    "грузинская",
    "испанская",
    "марокканская",
    "ливанская",
    "перуанская",
    "узбекская",
    "китайская (сычуань)",
    "скандинавская",
]

DISH_FORMATS = [
    "свежий салат",
    "тёплый салат (warm salad)",
    "боул (grain/buddha bowl)",
    "брускетта или тосты",
    "обёртка/ролл (wrap)",
    "крем-суп с топпингом из микрозелени",
    "мезе/ассорти закусок",
    "сэндвич или бургер",
    "паста или лапша",
    "фриттата/омлет на завтрак",
    "севиче или тартар",
    "гарнир к рыбе/мясу",
]

HERO_GREENS = [
    "рукола",
    "микрозелень гороха",
    "микрозелень подсолнечника",
    "микрозелень редиса",
    "микро-базилик",
    "кресс-салат",
    "мангольд беби-лиф",
    "шпинат беби-лиф",
    "витграсс (в дрессинге/смузи)",
    "съедобные цветы",
    "салатный микс",
    "микро-кинза",
]

def get_daily_cuisine(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(WORLD_CUISINES, d.timetuple().tm_yday)

def get_daily_dish_format(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(DISH_FORMATS, d.timetuple().tm_yday * 5)

def get_daily_hero_green(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(HERO_GREENS, d.timetuple().tm_yday * 7)

def build_recipe_brief(d: Optional[date] = None) -> dict:
    d = d or date.today()
    return {
        "cuisine": get_daily_cuisine(d),
        "format": get_daily_dish_format(d),
        "hero": get_daily_hero_green(d),
        "lang": pick_language({"lang": "mix"}, d),
    }
