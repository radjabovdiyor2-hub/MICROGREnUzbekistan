"""
📅 Content Plan — контент-стратегия Microgreen Uzbekistan.
==========================================================
Основано на мировой SMM-практике (контент-пиллары: Educate / Inspire /
Authority / Behind-the-scenes / Promote / Trust / Convert / Relevance).

Логика:
- Ежедневно публикуются СТОРИС (охват, вовлечение), тема ротируется по дню года —
  каждый день другая рубрика, цикл проходит все пиллары без повторов.
- Раз в неделю — ПОСТ В СЕТКУ (grid/feed): курируемый, высококачественный,
  тема ротируется по номеру недели.
- Ротация детерминирована датой → контент всегда разный, без ручного планирования.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

# ── Контент-пиллары (рубрики) ────────────────────────────────────────────
# angle — инструкция для AI, о чём именно писать; tags — тематические хэштеги.
# lang: предпочтительный язык рубрики — 'ru', 'uz' или 'mix' (чередуется).
# Логика (мировая практика для рынка Узбекистана): массовый/культурный/локальный
# контент → узбекский (выше охват и вовлечение), B2B/премиум → русский.
CONTENT_PILLARS: list[dict] = [
    {
        "key": "health", "emoji": "🌱", "name": "Польза и здоровье", "lang": "mix",
        "angle": "Расскажи о конкретной пользе микрозелени/салатов для здоровья и иммунитета "
                 "(витамины, антиоксиданты, энергия). Дай практичный совет для семьи.",
        "tags": "#польза #здоровье #витамины #ЗОЖ",
    },
    {
        "key": "recipe", "emoji": "🍽", "name": "Рецепты и применение", "lang": "mix",
        "angle": "Предложи простой рецепт или идею подачи блюда с микрозеленью/салатами. "
                 "Сделай аппетитно и применимо дома и в ресторане.",
        "tags": "#рецепт #вкусно #кулинария #микрозелень",
    },
    {
        "key": "horeca", "emoji": "👨‍🍳", "name": "HoReCa и рестораны", "lang": "ru",
        "angle": "Экспертный контент для шефов и рестораторов: как микрозелень поднимает "
                 "уровень подачи, свежесть, маржу блюда. Позиционируй как B2B-партнёра.",
        "tags": "#HoReCa #ресторан #шефповар #B2B",
    },
    {
        "key": "farm", "emoji": "🏡", "name": "За кулисами фермы", "lang": "uz",
        "angle": "Покажи процесс: как выращиваем на сити-ферме, свежесть, чистота, "
                 "цикл от семени до среза. Создай доверие через прозрачность.",
        "tags": "#ситиферма #выращивание #свежесть #Самарканд",
    },
    {
        "key": "product", "emoji": "📦", "name": "Продукт в фокусе", "lang": "mix",
        "angle": "Расскажи об одном конкретном продукте/наборе (микс, набор для ресторана, "
                 "стартовый набор): чем хорош, кому подойдёт, как заказать.",
        "tags": "#продукт #микрозелень #салаты #заказ",
    },
    {
        "key": "trust", "emoji": "💬", "name": "Отзывы и доверие", "lang": "ru",
        "angle": "Соцдоказательство: довольные клиенты, результаты, рестораны-партнёры. "
                 "Тёплый, человечный тон, без выдуманных фактов — говори общими словами.",
        "tags": "#отзывы #клиенты #доверие #качество",
    },
    {
        "key": "promo", "emoji": "🎉", "name": "Акция и промо", "lang": "uz",
        "angle": "Ограниченное предложение или промокод (скидка/подарок к заказу). "
                 "Чёткий призыв к действию и дедлайн. Не чаще, чем задано ротацией.",
        "tags": "#акция #скидка #промокод #выгодно",
    },
    {
        "key": "trend", "emoji": "📈", "name": "Тренды и сезон", "lang": "uz",
        "angle": "Ситуативный/сезонный контент: погода, сезон, праздник, тренд ЗОЖ. "
                 "Нативно привяжи бренд к актуальному инфоповоду.",
        "tags": "#тренд #сезон #ЗОЖ #Узбекистан",
    },
]

LANG_INSTRUCTION = {
    "ru": "русском",
    "uz": "узбекском (латиница, O'zbek tili)",
}

# Приоритетные пиллары для еженедельного grid-поста (авторитет + конверсия).
GRID_PILLAR_KEYS = ["horeca", "recipe", "product", "farm", "health", "trust"]


def _index_by_key(key: str) -> int:
    for i, p in enumerate(CONTENT_PILLARS):
        if p["key"] == key:
            return i
    return 0


def get_daily_pillar(d: Optional[date] = None) -> dict:
    """Рубрика дня для сторис — ротация по дню года (каждый день другая)."""
    d = d or date.today()
    return CONTENT_PILLARS[d.timetuple().tm_yday % len(CONTENT_PILLARS)]


def get_weekly_grid_pillar(d: Optional[date] = None) -> dict:
    """Рубрика недели для поста в сетку — ротация по номеру недели."""
    d = d or date.today()
    week = d.isocalendar()[1]
    key = GRID_PILLAR_KEYS[week % len(GRID_PILLAR_KEYS)]
    return CONTENT_PILLARS[_index_by_key(key)]


def pick_language(pillar: dict, d: Optional[date] = None) -> str:
    """
    Выбирает язык поста ('ru'/'uz') по рубрике и дате.
    'mix' — чередуется по дням; у смещённых рубрик изредка меняется для разнообразия.
    """
    # КОНТЕНТ-ПОЛИТИКА: язык публикаций строго Uzbek Latin (без смешивания языков).
    # Прежняя ротация RU/UZ отключена по требованию бренда — весь SMM-контент на узбекском.
    return "uz"


def build_brief(pillar: dict, slot: str = "", d: Optional[date] = None) -> str:
    """
    Формирует бриф для AI: рубрика + угол подачи + ЯЗЫК + требование уникальности.
    slot — опциональный контекст времени суток ('утро', 'день', 'вечер').
    """
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


# ═══════════════════════════════════════════════════════════════════════════
# 🍽 Разнообразие рецептов дня и утренних фактов
# ═══════════════════════════════════════════════════════════════════════════
# Каждый день — другая КУХНЯ МИРА, другой ФОРМАТ блюда и другой «ГЕРОЙ» из нашего
# ассортимента. Индексы берём по дню года с ВЗАИМНО ПРОСТЫМИ шагами (5 и 7 к длине
# 12), поэтому комбинации почти не повторяются много месяцев подряд.

WORLD_CUISINES = [
    "итальянская", "японская", "мексиканская", "тайская", "французская",
    "индийская", "корейская", "греческая (средиземноморская)", "турецкая",
    "вьетнамская", "грузинская", "испанская", "марокканская", "ливанская",
    "перуанская", "узбекская", "китайская (сычуань)", "скандинавская",
]

DISH_FORMATS = [
    "свежий салат", "тёплый салат (warm salad)", "боул (grain/buddha bowl)",
    "брускетта или тосты", "обёртка/ролл (wrap)", "крем-суп с топпингом из микрозелени",
    "мезе/ассорти закусок", "сэндвич или бургер", "паста или лапша",
    "фриттата/омлет на завтрак", "севиче или тартар", "гарнир к рыбе/мясу",
]

HERO_GREENS = [
    "рукола", "микрозелень гороха", "микрозелень подсолнечника", "микрозелень редиса",
    "микро-базилик", "кресс-салат", "мангольд беби-лиф", "шпинат беби-лиф",
    "витграсс (в дрессинге/смузи)", "съедобные цветы", "салатный микс", "микро-кинза",
]

# Темы утреннего факта/пользы — чтобы факт каждый день был про разное.
FACT_THEMES = [
    "почему в микрозелени нутриентов заметно больше, чем во взрослом растении",
    "конкретная польза микрозелени для иммунитета и энергии",
    "витграсс и хлорофилл: чем полезен для организма",
    "польза съедобных цветов и чем они хороши в подаче блюд",
    "сульфорафан и антиоксиданты в микрозелени брокколи",
    "как дольше сохранить свежесть зелени дома (практичный лайфхак)",
    "утренняя ЗОЖ-привычка с зеленью для бодрости на весь день",
    "культурный факт: как свежую зелень используют в кухнях мира",
    "клетчатка и салаты для лёгкого пищеварения",
    "витамины и минералы руколы/базилика простыми словами",
]


def _pick(seq: list, i: int):
    return seq[i % len(seq)]


def get_daily_cuisine(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(WORLD_CUISINES, d.timetuple().tm_yday)


def get_daily_dish_format(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(DISH_FORMATS, d.timetuple().tm_yday * 5)  # шаг 5 — не «в такт» кухне


def get_daily_hero_green(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(HERO_GREENS, d.timetuple().tm_yday * 7)  # шаг 7 — свой фазовый сдвиг


def get_daily_fact_theme(d: Optional[date] = None) -> str:
    d = d or date.today()
    return _pick(FACT_THEMES, d.timetuple().tm_yday * 3)


def build_recipe_brief(d: Optional[date] = None) -> dict:
    """Бриф уникального рецепта дня: кухня мира + формат + «герой»-зелень + язык."""
    d = d or date.today()
    doy = d.timetuple().tm_yday
    return {
        "cuisine": get_daily_cuisine(d),
        "format": get_daily_dish_format(d),
        "hero": get_daily_hero_green(d),
        "lang": "uz",  # контент-политика: только Uzbek Latin
    }


# ═══════════════════════════════════════════════════════════════════════════
# ☀️ Форматы УТРЕННЕГО сторис — ротация ФОРМЫ, а не только слов
# ═══════════════════════════════════════════════════════════════════════════
# Проблема: раньше утренний сторис каждый день выглядел одинаково — одно и то же
# арт-направление фото (флэтлей, верхний свет) и один и тот же оверлей (белая
# плашка снизу + зелёный заголовок + кнопка «Batafsil»). Менялись только слова,
# а форма — нет, поэтому подписчик видит «один и тот же пост».
#
# Решение: каждый день — ДРУГОЙ архетип сторис. У каждого свой угол подачи,
# своё арт-направление фото, свой макет оверлея (layout), свой CTA и — главное —
# свой ТРИГГЕР ВОВЛЕЧЕНИЯ (ответ / выбор / сохранение / репост). Взаимодействия
# ранжируют сторис в охвате у Instagram, поэтому «в топ» выводит не картинка,
# а встроенный призыв к реакции.
#
# Поля формата:
#   key     — идентификатор; ru — человекочитаемый ярлык (для логов/Telegram);
#   badge   — маленький ярлык-пилюля на картинке (маркер формата дня);
#   layout  — макет оверлея для render_story_text: top | center | bottom | poll;
#   angle   — инструкция AI, о чём и как писать ({fact} подставляется темой дня);
#   photo   — арт-направление фото (англ.), чтобы жанр картинки менялся;
#   cta     — текст кнопки; trigger — призыв к реакции (в промпт AI, uz);
#   note    — короткий триггер, впечатываемый на картинку (≤3 слова, uz).

MORNING_FORMATS: list[dict] = [
    {
        "key": "fact", "ru": "Факт дня «А вы знали?»", "badge": "BILARMIDINGIZ?",
        "layout": "top",
        "angle": "Дай ОДИН неожиданный, конкретный полезный факт по теме «{fact}». "
                 "Подача «а вы знали?». Не выдумывай цифр — если не уверен, дай пользу качественно.",
        "photo": "extreme macro close-up of dew-fresh microgreens sprouts, morning backlight, "
                 "soft bokeh, vibrant green",
        "cta": "Batafsil", "trigger": "do'stingizga yuboring (share)", "note": "Do'stga yuboring",
    },
    {
        "key": "question", "ru": "Вопрос аудитории", "badge": "SAVOL",
        "layout": "center",
        "angle": "Задай аудитории тёплый вопрос про их утро/питание/привычки, "
                 "чтобы захотелось ответить в директ. Один короткий вопрос.",
        "photo": "cozy morning breakfast scene, hands holding a bowl of fresh salad with microgreens, "
                 "warm lifestyle, natural window light",
        "cta": "Javob yozing", "trigger": "javobingizni izohda yozing", "note": "Javob yozing",
    },
    {
        "key": "this_or_that", "ru": "Выбор «Qaysi biri?»", "badge": "TANLANG",
        "layout": "poll",
        "angle": "Предложи выбор из ДВУХ вариантов (вкус/блюдо/привычка), чтобы подписчик выбрал. "
                 "Сформулируй интригующе, оба варианта — про нашу зелень/еду.",
        "photo": "two different fresh dishes with microgreens side by side on a clean light table, "
                 "top-down split composition, bright daylight",
        "cta": "Tanlang", "trigger": "qaysi birini tanlaysiz? belgilang", "note": "Qaysi biri?",
    },
    {
        "key": "tip", "ru": "Лайфхак дня", "badge": "LIFEHACK",
        "layout": "bottom",
        "angle": "Дай ОДИН практичный лайфхак: свежесть, хранение или применение зелени. "
                 "Чтобы захотелось сохранить сторис.",
        "photo": "chef's hands preparing and cutting fresh microgreens on a wooden board in a bright "
                 "modern kitchen, action shot, shallow depth of field",
        "cta": "Saqlang", "trigger": "saqlab qo'ying (bookmark)", "note": "Saqlab qo'ying",
    },
    {
        "key": "mini_recipe", "ru": "Мини-рецепт за 15 сек", "badge": "15 SONIYA",
        "layout": "bottom",
        "angle": "Предложи супер-простую идею блюда на 3 ингредиента с микрозеленью — «за 15 секунд». "
                 "Аппетитно и выполнимо дома.",
        "photo": "appetizing finished plated dish beautifully garnished with fresh microgreens, "
                 "close-up, warm restaurant light",
        "cta": "Retsept", "trigger": "retseptni saqlab qo'ying", "note": "Retseptni saqlang",
    },
    {
        "key": "quote", "ru": "Мотивация утра", "badge": "BUGUN",
        "layout": "center",
        "angle": "Короткая тёплая мысль/мотивация о свежести, здоровье и заботе о себе с утра. "
                 "Без клише, живо и по-человечески.",
        "photo": "minimalist aesthetic still life of a single microgreen sprig on a neutral background, "
                 "soft moody morning light, lots of negative space",
        "cta": "Batafsil", "trigger": "rozimisiz? 💚 belgilang", "note": "Rozimisiz?",
    },
    {
        "key": "promo", "ru": "Утреннее промо", "badge": "AKSIYA",
        "layout": "bottom",
        "angle": "Утреннее спецпредложение с промокодом BODRLIK (скидка 10%, действует 24 соат). "
                 "Чёткий дедлайн и выгода.",
        "photo": "premium product hero shot of a microgreens gift set / box with fresh greens, "
                 "studio light, warm golden accents",
        "cta": "Buyurtma berish", "trigger": "bugun 10% chegirma — buyurtma bering", "note": "Bugun -10%",
    },
]


def get_daily_morning_format(d: Optional[date] = None) -> dict:
    """Формат утреннего сторис на день — ротация по дню года (каждый день другой)."""
    d = d or date.today()
    return MORNING_FORMATS[d.timetuple().tm_yday % len(MORNING_FORMATS)]
