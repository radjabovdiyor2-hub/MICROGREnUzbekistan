from __future__ import annotations
from datetime import date
from typing import Optional
from shared.content_plan.utils import _pick

CONTENT_PILLARS: list[dict] = [
    {
        "key": "health",
        "emoji": "🌱",
        "name": "Здоровое питание",
        "lang": "mix",
        "angle": "Полезный совет о питании, иммунитете или энергии для всей семьи. "
        "Конкретный факт (витамины, антиоксиданты), практичный и применимый. "
        "Микрозелень упомяни органично как один из способов, не как единственный.",
        "tags": "#здоровье #питание #витамины #ЗОЖ",
    },
    {
        "key": "recipe",
        "emoji": "🍽",
        "name": "Кулинарные идеи",
        "lang": "mix",
        "angle": "Простой аппетитный рецепт или идея подачи — акцент на БЛЮДЕ и вкусе, "
        "а не на ингредиенте. Свежая зелень — один из компонентов, не главный герой поста.",
        "tags": "#рецепт #вкусно #кулинария #еда",
    },
    {
        "key": "horeca",
        "emoji": "👨‍🍳",
        "name": "Мир ресторанов",
        "lang": "ru",
        "angle": "Экспертный контент для шефов и рестораторов: тренды подачи, food cost, "
        "сервис, культура гостеприимства. Свежие ингредиенты — часть решения, не весь пост.",
        "tags": "#HoReCa #ресторан #шефповар #B2B",
    },
    {
        "key": "farm",
        "emoji": "🏡",
        "name": "Как это устроено",
        "lang": "uz",
        "angle": "Закулисье: как устроена сити-ферма, технологии выращивания, путь от семени "
        "до тарелки. Покажи процесс и людей — создай доверие через прозрачность.",
        "tags": "#ситиферма #технологии #свежесть #Самарканд",
    },
    {
        "key": "product",
        "emoji": "📦",
        "name": "Продукт в фокусе",
        "lang": "mix",
        "angle": "Расскажи об одном конкретном продукте или наборе: чем хорош, кому подойдёт, "
        "как заказать. Это единственная рубрика, где продукт — главный герой.",
        "tags": "#продукт #свежесть #заказ",
    },
    {
        "key": "trust",
        "emoji": "💬",
        "name": "Истории и люди",
        "lang": "ru",
        "angle": "Человеческая история: клиент, шеф, фермер, партнёр. Тёплый тон, "
        "реальные ситуации, без выдуманных отзывов. Бренд — фон, не фокус.",
        "tags": "#история #люди #доверие #качество",
    },
    {
        "key": "promo",
        "emoji": "🎉",
        "name": "Акция и промо",
        "lang": "uz",
        "angle": "Ограниченное предложение или промокод (скидка/подарок к заказу). "
        "Чёткий призыв к действию и дедлайн. Не чаще, чем задано ротацией.",
        "tags": "#акция #скидка #промокод #выгодно",
    },
    {
        "key": "trend",
        "emoji": "📈",
        "name": "Тренды и сезон",
        "lang": "uz",
        "angle": "Ситуативный контент: погода, сезон, праздник, мировой ЗОЖ-тренд. "
        "Главное — актуальность и польза, бренд привяжи нативно в конце.",
        "tags": "#тренд #сезон #ЗОЖ #Узбекистан",
    },
    {
        "key": "news",
        "emoji": "📰",
        "name": "Повестка недели",
        "lang": "uz",
        "angle": "Интересная новость или событие недели (еда, экология, культура, спорт). "
        "Сначала ценность для читателя, потом лёгкий мостик к здоровому образу жизни.",
        "tags": "#новости #события #Узбекистан",
    },
    {
        "key": "health_trend",
        "emoji": "💊",
        "name": "Красота и энергия",
        "lang": "mix",
        "angle": "Совет о красоте, энергии или самочувствии (сон, вода, движение, питание). "
        "Без медицинских обещаний. Зелень — один из инструментов, не панацея.",
        "tags": "#красота #энергия #витамины #selfcare",
    },
    {
        "key": "home_lifehack",
        "emoji": "💡",
        "name": "Лайфхаки быта",
        "lang": "uz",
        "angle": "Практичный бытовой или кухонный лайфхак (хранение, экономия, уборка, готовка). "
        "Полезно само по себе — бренд не обязателен в каждом посте.",
        "tags": "#лайфхак #кухня #дом #полезно",
    },
]

LANG_INSTRUCTION = {
    "ru": "русском",
    "uz": "узбекском (латиница, O'zbek tili)",
}

IMAGE_STYLES = [
    "warm golden-hour light, rustic wood, cozy",
    "bright high-key, white marble, minimalist",
    "moody dark, dramatic side light",
    "vibrant colorful flat-lay top-down",
    "soft pastel morning",
    "fine-dining plating, shallow DOF",
]

GRID_PILLAR_KEYS = ["horeca", "recipe", "product", "farm", "health", "trust"]

def get_daily_image_style(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(IMAGE_STYLES, d.timetuple().tm_yday * 5)

def _index_by_key(key: str) -> int:
    for i, p in enumerate(CONTENT_PILLARS):
        if p["key"] == key:
            return i
    return 0

def get_daily_pillar(d: Optional[date] = None) -> dict:
    d = d or date.today()
    return CONTENT_PILLARS[d.timetuple().tm_yday % len(CONTENT_PILLARS)]

def get_weekly_grid_pillar(d: Optional[date] = None) -> dict:
    d = d or date.today()
    week = d.isocalendar()[1]
    key = GRID_PILLAR_KEYS[week % len(GRID_PILLAR_KEYS)]
    return CONTENT_PILLARS[_index_by_key(key)]

def pick_language(pillar: dict, d: Optional[date] = None) -> str:
    d = d or date.today()
    lang = pillar.get("lang", "uz")
    if lang in ("ru", "uz"):
        return lang
    return "ru" if d.timetuple().tm_yday % 2 == 0 else "uz"

def build_brief(pillar: dict, slot: str = "", d: Optional[date] = None) -> str:
    lang = pick_language(pillar, d)
    slot_hint = f" Формат: {slot}." if slot else ""
    return (
        f"РУБРИКА ДНЯ: {pillar['emoji']} {pillar['name']}.{slot_hint}\n"
        f"О чём писать: {pillar['angle']}\n"
        f"⚠️ ЯЗЫК ПОСТА: пиши ПОЛНОСТЬЮ на {LANG_INSTRUCTION[lang]} языке — "
        f"это важнее общих указаний о языке выше (язык подобран под тему и аудиторию).\n"
        f"Обязательно: уникальный текст, конкретика, без повторов прошлых постов. "
        f"Добавь тематические хэштеги: {pillar['tags']}."
    )
