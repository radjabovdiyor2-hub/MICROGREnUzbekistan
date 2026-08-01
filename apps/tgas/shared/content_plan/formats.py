from datetime import date
from typing import Optional
from shared.content_plan.utils import _pick

FACT_THEMES = [
    "неожиданный факт о еде или продукте, который удивит (история блюда, происхождение специи)",
    "почему свежие овощи и зелень полезнее — простыми словами, без занудства и обещаний",
    "лайфхак здорового завтрака, который реально даёт энергию до обеда",
    "интересный факт о кухне одной из стран мира (традиция, ингредиент, ритуал)",
    "как сочетать вкусы и текстуры, чтобы простое домашнее блюдо заиграло",
    "популярный миф о питании, в который все верят, но он неправда",
    "чем микрозелень отличается от обычной зелени и когда это реально важно",
    "сезонный продукт этого месяца в Узбекистане: чем хорош и что из него приготовить",
    "маленькая привычка за столом или на кухне, что заметно улучшает самочувствие",
    "культурный факт о гостеприимстве и еде в Узбекистане (mehmon, dasturxon, choy)",
]

TIP_THEMES = [
    "как дольше хранить зелень и салат свежими (влажная салфетка, контейнер, нижняя полка +4°C)",
    "как быстро освежить подвявшую зелень или овощи: ледяная вода на 10-15 минут",
    "как правильно хранить помидоры, авокадо и хлеб — частые ошибки на кухне",
    "как заточить и правильно хранить нож, чтобы готовить быстрее и безопаснее",
    "3 быстрых завтрака на буднее утро, когда времени в обрез",
    "как накрыть простой стол для гостей красиво и без стресса (dasturxon)",
    "как не выбрасывать еду: что вкусного приготовить из вчерашних остатков",
    "как выбрать свежие продукты на базаре: зелень, овощи, мясо, рыба",
    "чем заменить майонез, сахар или белый хлеб в привычных блюдах — легче и вкуснее",
    "порядок на кухне за 10 минут: простая система, которая реально работает",
]

MORNING_FORMATS: list[dict] = [
    {
        "key": "fact",
        "ru": "Факт дня «А вы знали?»",
        "badge": "BILARMIDINGIZ?",
        "layout": "top",
        "kind": "info",
        "section": "FOYDASI",
        "angle": "Раскрой ОДИН неожиданный факт по теме «{fact}». Заголовок — сам факт. "
        "Пункты (points) — 2-3 КОНКРЕТНЫХ следствия/пользы. Не выдумывай цифр.",
        "photo": "appetizing fresh-food or breakfast flat-lay in soft morning backlight, vibrant "
        "natural colors, soft bokeh, a touch of fresh greens as a subtle accent",
        "cta": "Batafsil",
        "trigger": "do'stingizga yuboring (share)",
        "note": "Do'stga yuboring",
    },
    {
        "key": "question",
        "ru": "Вопрос аудитории",
        "badge": "SAVOL",
        "layout": "center",
        "kind": "engage",
        "angle": "Задай аудитории тёплый вопрос про их утро/питание/привычки, "
        "чтобы захотелось ответить в директ. Один короткий вопрос.",
        "photo": "cozy morning scene at a home table, hands holding a warm bowl or a cup of tea, "
        "warm lifestyle, natural window light",
        "cta": "Javob yozing",
        "trigger": "javobingizni izohda yozing",
        "note": "Javob yozing",
    },
    {
        "key": "this_or_that",
        "ru": "Выбор «Qaysi biri?»",
        "badge": "TANLANG",
        "layout": "poll",
        "kind": "engage",
        "angle": "Предложи выбор из ДВУХ вариантов (вкус/блюдо/привычка), чтобы подписчик выбрал. "
        "Сформулируй интригующе, оба варианта — про нашу зелень/еду.",
        "photo": "two different appetizing dishes or drinks side by side on a clean light table, "
        "top-down split composition, bright daylight",
        "cta": "Tanlang",
        "trigger": "qaysi birini tanlaysiz? belgilang",
        "note": "Qaysi biri?",
    },
    {
        "key": "tip",
        "ru": "Лайфхак дня",
        "badge": "LIFEHACK",
        "layout": "bottom",
        "kind": "info",
        "section": "MASLAHAT",
        "angle": "Разверни КОНКРЕТНЫЙ лайфхак по теме «{tip}». Заголовок — суть выгоды. "
        "Пункты (points) — 2-3 конкретных шага КАК именно это сделать (способ, срок, °C).",
        "photo": "hands preparing and cutting fresh food on a wooden board in a bright modern home "
        "kitchen, action shot, shallow depth of field",
        "cta": "Saqlang",
        "trigger": "saqlab qo'ying (bookmark)",
        "note": "Saqlab qo'ying",
    },
    {
        "key": "mini_recipe",
        "ru": "Мини-рецепт за 15 сек",
        "badge": "15 SONIYA",
        "layout": "bottom",
        "kind": "info",
        "section": "TARKIBI",
        "angle": "Простое блюдо на 3 ингредиента с микрозеленью — «за 15 секунд». Заголовок — "
        "название блюда. Пункты (points) — 3 ингредиента ИЛИ 3 коротких шага.",
        "photo": "appetizing finished home-plated dish, beautifully served and garnished, "
        "close-up, warm inviting light",
        "cta": "Retsept",
        "trigger": "retseptni saqlab qo'ying",
        "note": "Retseptni saqlang",
    },
    {
        "key": "quote",
        "ru": "Мотивация утра",
        "badge": "BUGUN",
        "layout": "center",
        "kind": "engage",
        "angle": "Короткая тёплая мысль/мотивация о свежести, здоровье и заботе о себе с утра. "
        "Без клише, живо и по-человечески.",
        "photo": "minimalist aesthetic still life — a cup of coffee or tea and a little fresh food on a "
        "neutral background, soft moody morning light, lots of negative space",
        "cta": "Batafsil",
        "trigger": "rozimisiz? 💚 belgilang",
        "note": "Rozimisiz?",
    },
    {
        "key": "promo",
        "ru": "Утреннее промо",
        "badge": "AKSIYA",
        "layout": "bottom",
        "kind": "info",
        "section": "SHARTLAR",
        "angle": "Утреннее спецпредложение. Заголовок — суть выгоды. Пункты (points) — "
        "3 конкретных условия: «10% chegirma», «BODRLIK kodi», «Faqat 24 soat».",
        "photo": "premium product hero shot of a fresh-food / greens gift box, "
        "studio light, warm golden accents",
        "cta": "Buyurtma berish",
        "trigger": "bugun 10% chegirma — buyurtma bering",
        "note": "Bugun -10%",
    },
]

def get_daily_fact_theme(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(FACT_THEMES, d.timetuple().tm_yday * 3)

def get_daily_tip_theme(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(TIP_THEMES, d.timetuple().tm_yday * 3)

def get_daily_morning_format(d: Optional[date] = None) -> dict:
    d = d or date.today()
    return MORNING_FORMATS[d.timetuple().tm_yday % len(MORNING_FORMATS)]
