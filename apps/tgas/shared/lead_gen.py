"""
🍽 Lead Generation — сбор заведений (B2B-лиды) из внешних источников.
======================================================================
Нормализует данные из разных источников в единый формат и складывает
в таблицу customers (status='lead', customer_type='b2b') с дедупликацией.

Источники:
- 2ГИС Catalog API      (collect_from_2gis)          — нужен DGIS_API_KEY
- Google Places         (collect_from_google_places) — нужен GOOGLE_PLACES_API_KEY
- Yandex Maps Search    (collect_from_yandex_maps)   — нужен YANDEX_MAPS_API_KEY
- Ручной список/CSV     (parse_manual_csv)           — работает без ключей

⚠️ Скрейпинг карт/Telegram сознательно НЕ реализован: против ToS, риск бана.
   Используйте официальные API.

Каждый лид приводится к словарю:
    {
      "company_name", "phone", "email", "address", "city", "district",
      "review_score", "review_summary",
      "source", "source_ref", "company_type", "audience", "audience_source",
      "latitude", "longitude", "geo_precision"
    }

Координаты приходят от всех трёх API даром — их и так возвращают вместе с
адресом. Раньше они выбрасывались (хранить было негде), и карта клиентов в
админке начиналась с пустого экрана. Теперь это основной бесплатный источник
точек для B2B: 2ГИС отдаёт координату входа в заведение, точнее геокодера.

ЧТО ЗДЕСЬ БЫЛО СЛОМАНО (и почему справочник не наполнялся)

1. `page: 1` жёстко и `page_size ≤ 50` — больше пятидесяти заведений не
   собиралось НИКОГДА, сколько ни запускай. Теперь есть постраничность.
2. `company_type` стоял константой "restaurant" во всех четырёх сборщиках:
   фитнес-клуб, собранный ночной задачей, ложился в базу рестораном.
   Теперь это параметр, а запросы к провайдеру берутся из VENUE_QUERIES.
3. `import_leads` писал `city = settings.lead_gen_city` независимо от того,
   по какому городу шёл сбор. Сбор по Ургуту записывался Самаркандом.
4. Дедуп по названию шёл по всей базе: два разных «Кафе Дружба» в разных
   туманах склеивались в одно заведение. Теперь ключ учитывает город, а
   совпадение имени при разнесённых координатах дублем не считается.
"""

from __future__ import annotations

import asyncio
import csv
import logging
import math
import re
from typing import Any, Iterable, Optional

import aiohttp
from sqlalchemy import text

from shared import phone as phone_utils
from shared.config import settings
from shared.database import get_session_ctx
from shared.geo import normalize_city

logger = logging.getLogger(__name__)

DGIS_CATALOG_URL = "https://catalog.api.2gis.com/3.0/items"

# Границы Узбекистана с запасом. Координата вне их — это не «далёкий
# ресторан», а перепутанные местами оси или мусор от провайдера. Такую
# точку лучше не сохранять вовсе: пин посреди океана выглядит как данные.
_UZ_LAT = (37.0, 46.0)
_UZ_LON = (55.0, 74.0)

# Пауза между запросами к одному провайдеру. Полный обход области — это
# сотни запросов подряд, и без паузы любой из трёх ответит 429.
RATE_LIMIT_SECONDS = 0.6

# Потолок страниц на один запрос. Провайдеры отдают до десятка страниц по
# полсотни, дальше начинается мусор из соседних рубрик. Ограничение
# защищает и квоту, и качество: широту покрытия даёт перебор запросов и
# населённых пунктов, а не бесконечная прокрутка одной выдачи.
MAX_PAGES = 10


# ─────────────────────────────────────────────────────────────────────
# Что именно ищем: категория → поисковые запросы
# ─────────────────────────────────────────────────────────────────────
#
# Слаги категорий — зеркало COMPANY_TYPES из
# apps/web/src/lib/customers/companyTypes.ts. Прямых импортов между
# модулями нет (см. CLAUDE.md), поэтому список дублируется осознанно.
#
# Запросы даны и по-русски, и по-узбекски: 2ГИС и Яндекс индексируют
# карточку на том языке, на котором её завёл владелец, и «тойхона» находит
# не то же самое, что «свадебный зал».
VENUE_QUERIES: dict[str, list[str]] = {
    "restaurant": ["ресторан", "restoran"],
    "cafe": ["кафе", "kafe"],
    "toyxona": [
        "тойхона",
        "свадебный зал",
        "свадебный ресторан",
        "toyxona",
        "to'yxona",
        "to'y zali",
    ],
    "banquet": ["банкетный зал", "banket zali"],
    "chaikhana": ["чайхана", "choyxona"],
    "canteen": ["столовая", "oshxona"],
    "fastfood": ["фастфуд", "быстрое питание", "tez taomlar", "fast food"],
    "coffee": ["кофейня", "qahvaxona", "coffee"],
    "bakery": ["пекарня", "кондитерская", "nonvoyxona", "qandolatxona"],
    "hotel": ["гостиница", "отель", "mehmonxona", "hotel"],
    "catering": ["кейтеринг", "выездное обслуживание", "ketering"],
    "fitness": [
        "фитнес клуб",
        "тренажерный зал",
        "фитнес центр",
        "fitnes klub",
        "sport zali",
        "gym",
    ],
    "sport": ["спорткомплекс", "бассейн", "sport majmuasi", "basseyn"],
    "sanatorium": ["санаторий", "дом отдыха", "sanatoriy", "dam olish maskani"],
    "clinic": ["клиника", "больница", "klinika", "shifoxona"],
    "supermarket": ["супермаркет", "гастроном", "supermarket"],
    "school": ["университет", "колледж", "universitet", "kollej"],
    "office": ["бизнес центр", "biznes markaz"],
}

# Русские подписи категорий — для КП, карточек владельцу и логов офиса.
# Зеркало ru-полей COMPANY_TYPES из companyTypes.ts. Нужны здесь потому, что
# промпт коммерческого предложения раньше звал каждого адресата «рестораном»,
# и фитнес-клуб получал письмо про сервировку блюд.
VENUE_LABELS_RU: dict[str, str] = {
    "restaurant": "ресторан",
    "cafe": "кафе",
    "toyxona": "свадебный ресторан (тойхона)",
    "banquet": "банкетный зал",
    "chaikhana": "чайхана",
    "canteen": "столовая",
    "fastfood": "заведение быстрого питания",
    "coffee": "кофейня",
    "bakery": "пекарня-кондитерская",
    "hotel": "отель",
    "catering": "кейтеринговая служба",
    "fitness": "фитнес-клуб",
    "sport": "спорткомплекс",
    "sanatorium": "санаторий",
    "clinic": "клиника",
    "supermarket": "супермаркет",
    "school": "учебное заведение",
    "office": "бизнес-центр",
    "other": "заведение",
}

AUDIENCE_LABELS_RU: dict[str, str] = {
    "female": "женский",
    "male": "мужской",
    "mixed": "смешанный",
}


def venue_label(company_type: Optional[str], audience: Optional[str] = None) -> str:
    """«фитнес-клуб (женский)» — как назвать заведение в письме и в карточке."""
    base = VENUE_LABELS_RU.get((company_type or "").lower(), "заведение")
    suffix = AUDIENCE_LABELS_RU.get((audience or "").lower())
    return f"{base} ({suffix})" if suffix else base


# Населённые пункты Самаркандской области: (запрос к провайдеру, slug
# района). Slug тот же, что в apps/web/src/lib/customers/districts.ts и в
# geo._DISTRICTS — он и уходит в `customers.district`.
#
# У города района нет: их там два, и какой именно — знает геокодер по
# адресу. Ставить один на весь Самарканд значило бы соврать половине точек.
#
# Город стоит первым: по нему собирается больше всего, и при прерванном
# обходе успевает набраться самое ценное.
SAMARKAND_PLACES: list[tuple[str, Optional[str]]] = [
    ("Самарканд", None),
    ("Urgut", "urgut"),
    ("Kattaqorgon", "kattaqorgon"),
    ("Jomboy", "jomboy"),
    ("Bulungur", "bulungur"),
    ("Payariq", "payariq"),
    ("Pastdargom", "pastdargom"),
    ("Ishtixon", "ishtixon"),
    ("Oqdaryo", "oqdaryo"),
    ("Toyloq", "toyloq"),
    ("Narpay", "narpay"),
    ("Nurobod", "nurobod"),
    ("Paxtachi", "paxtachi"),
    ("Qoshrabot", "qoshrabot"),
    # Самаркандский туман ищется по своему центру — посёлку Гулобод, а не
    # по названию района: запрос «Samarqand tumani» провайдер понимает как
    # город и возвращает городские заведения, которые мы бы тут же и
    # пометили сельским районом. Ошибка в районе тише ошибки в координате
    # и потому опаснее.
    ("Gulobod", "samarqand-tumani"),
]


# ─────────────────────────────────────────────────────────────────────
# Аудитория заведения по названию
# ─────────────────────────────────────────────────────────────────────
#
# Ни один справочник пол зала не проставляет, а для фитнеса это половина
# смысла контакта: женский и мужской клуб — разные закупщики и разное
# предложение. Догадка по названию покрывает те клубы, которые сами вынесли
# это в вывеску, остальным ставится None — «не выяснено», и продавец
# уточняет при первом звонке.
#
# Результат помечается `audience_source='guess'`. Значение 'manual'
# автоматика не перезаписывает никогда — тот же инвариант, что у
# geo_source='manual'.
_FEMALE_MARKERS = (
    "ayollar", "ayol", "qizlar",
    "женск", "для женщин",
    "women", "woman", "female", "lady", "ladies", "girls",
)
_MALE_MARKERS = (
    "erkaklar", "erkak", "yigitlar",
    "мужск", "для мужчин",
    "men only", "mens", "male", "boys",
)


def guess_audience(name: Optional[str]) -> Optional[str]:
    """
    'female' | 'male' | None по названию заведения.

    Слово ищется подстрокой в приведённой к нижнему регистру строке:
    названия вроде «Fitness Lady» и «Ayollar sport zali» короткие, и разбор
    по токенам здесь ничего не добавит.

    «men» отдельным маркером НЕ стоит: оно сидит внутри «women»,
    «development» и десятка узбекских слов, и одна эта строка перевела бы
    половину женских клубов в мужские. Поэтому только «men only» и «mens».
    """
    if not name:
        return None
    low = name.lower()
    female = any(marker in low for marker in _FEMALE_MARKERS)
    male = any(marker in low for marker in _MALE_MARKERS)
    # «Ayollar va erkaklar uchun» — это смешанный зал, а не оба сразу.
    # Догадываться в таком случае не о чем: пусть выясняет человек.
    if female and male:
        return None
    if female:
        return "female"
    if male:
        return "male"
    return None


def _valid_point(lat: Any, lon: Any) -> tuple[float, float] | None:
    """Пара чисел в пределах страны — иначе None."""
    try:
        lat_f, lon_f = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if not (_UZ_LAT[0] <= lat_f <= _UZ_LAT[1]):
        return None
    if not (_UZ_LON[0] <= lon_f <= _UZ_LON[1]):
        return None
    return lat_f, lon_f


def point_from_dgis(item: dict[str, Any]) -> tuple[float, float] | None:
    """2ГИС: `point` — словарь {"lat": .., "lon": ..}. Порядок явный."""
    point = item.get("point") or {}
    return _valid_point(point.get("lat"), point.get("lon"))


def point_from_google(item: dict[str, Any]) -> tuple[float, float] | None:
    """Google Places: `geometry.location` — {"lat": .., "lng": ..}."""
    location = (item.get("geometry") or {}).get("location") or {}
    return _valid_point(location.get("lat"), location.get("lng"))


def point_from_yandex(feature: dict[str, Any]) -> tuple[float, float] | None:
    """
    Яндекс отдаёт GeoJSON, а там координаты идут в порядке [ДОЛГОТА, ШИРОТА].

    Порядок обратен привычному «широта, долгота», и это самая частая ошибка
    в геоданных: пара 41.31 / 69.24 формально валидна в обе стороны, поэтому
    перестановка не падает, а тихо уносит Ташкент в Индийский океан.
    """
    coords = (feature.get("geometry") or {}).get("coordinates") or []
    if len(coords) != 2:
        return None
    lon, lat = coords
    return _valid_point(lat, lon)


def meters_between(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Расстояние между точками по гаверсинусу, в метрах."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(min(1.0, math.sqrt(h)))


# Одноимённые заведения дальше этого расстояния — разные заведения, а не
# дубль. «Кафе Дружба» в Ургуте и «Кафе Дружба» в Джамбае существуют обе.
# Триста метров: сетевая точка через дорогу от своей же — это всё-таки одна
# карточка справочника, а не две.
SAME_PLACE_METERS = 300


# ─────────────────────────────────────────────────────────────────────
# Источник 1: 2ГИС Catalog API
# ─────────────────────────────────────────────────────────────────────
async def collect_from_2gis(
    city: Optional[str] = None,
    query: str = "рестораны",
    limit: int = 50,
    company_type: str = "restaurant",
    district: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Ищет заведения в 2ГИС. Возвращает список нормализованных лидов.
    Пустой список, если ключ не задан или произошла ошибка.

    `limit` — сколько заведений нужно всего, а не размер страницы: сборщик
    сам листает выдачу, пока не наберёт столько или пока страницы не
    кончатся. До этого он брал ровно первую страницу и молча возвращал не
    больше пятидесяти карточек, что бы в аргументе ни стояло.
    """
    if not settings.dgis_api_key:
        logger.warning("2ГИС: DGIS_API_KEY не задан — сбор пропущен.")
        return []

    city = city or settings.lead_gen_city
    page_size = min(max(limit, 1), 50)

    leads: list[dict[str, Any]] = []
    timeout = aiohttp.ClientTimeout(total=20)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            for page in range(1, MAX_PAGES + 1):
                if len(leads) >= limit:
                    break
                params = {
                    "q": f"{query} {city}",
                    "key": settings.dgis_api_key,
                    "fields": "items.point,items.contact_groups,items.reviews,items.address_name",
                    "page_size": page_size,
                    "page": page,
                }
                async with session.get(DGIS_CATALOG_URL, params=params) as resp:
                    if resp.status != 200:
                        # 404 на странице за последней — штатный конец выдачи
                        # у 2ГИС, а не отказ: ругаться на него незачем.
                        if resp.status == 404 and page > 1:
                            break
                        logger.error(
                            "2ГИС HTTP %s: %s", resp.status, (await resp.text())[:200]
                        )
                        break
                    data = await resp.json(content_type=None)

                items = (data.get("result") or {}).get("items") or []
                if not items:
                    break

                for it in items:
                    leads.append(_lead_from_dgis(it, city, company_type, district))

                if len(items) < page_size:
                    break
                await asyncio.sleep(RATE_LIMIT_SECONDS)
    except Exception as e:  # noqa: BLE001
        logger.exception("2ГИС: ошибка запроса: %s", e)

    logger.info(
        "2ГИС: получено %d заведений по запросу '%s %s' (%s)",
        len(leads), query, city, company_type,
    )
    return leads[:limit]


def _lead_from_dgis(
    it: dict[str, Any], city: str, company_type: str, district: Optional[str]
) -> dict[str, Any]:
    """Карточка 2ГИС → нормализованный лид."""
    phone = email = None
    for grp in it.get("contact_groups", []) or []:
        for c in grp.get("contacts", []) or []:
            ctype = c.get("type")
            value = c.get("value") or c.get("text")
            if ctype == "phone" and not phone:
                phone = value
            elif ctype == "email" and not email:
                email = value

    reviews = it.get("reviews") or {}
    score = reviews.get("general_rating") or reviews.get("rating")
    review_count = reviews.get("general_review_count") or reviews.get("review_count")
    review_summary = None
    if score:
        review_summary = f"Рейтинг 2ГИС: {score}" + (
            f" ({review_count} отзывов)" if review_count else ""
        )

    point = point_from_dgis(it)
    name = it.get("name")

    return {
        "company_name": name,
        "phone": phone,
        "email": email,
        "address": it.get("address_name"),
        "city": city,
        "district": district,
        "review_score": float(score) if score else None,
        "review_summary": review_summary,
        "source": "2gis",
        "source_ref": str(it.get("id")) if it.get("id") else None,
        "company_type": company_type,
        "audience": guess_audience(name),
        "audience_source": "guess",
        "latitude": point[0] if point else None,
        "longitude": point[1] if point else None,
        "geo_precision": "exact" if point else None,
    }


# ─────────────────────────────────────────────────────────────────────
# Источник 1a: Google Places API (Text Search)
# ─────────────────────────────────────────────────────────────────────
async def collect_from_google_places(
    city: Optional[str] = None,
    query: str = "рестораны",
    limit: int = 50,
    company_type: str = "restaurant",
    district: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Ищет заведения через Google Places (легальный API).

    Text Search отдаёт по 20 результатов и не больше трёх страниц — потолок
    самого API, 60 карточек на запрос. Токен следующей страницы у Google
    «протухает наоборот»: он становится действительным через пару секунд
    после выдачи, поэтому пауза перед его использованием обязательна.

    Телефонов Text Search не возвращает — за ними нужен Place Details,
    отдельный платный вызов на каждую карточку. Для холодного справочника
    берём адрес и координату, телефон дотягивается позже.
    """
    if not settings.google_places_api_key:
        logger.warning("Google: GOOGLE_PLACES_API_KEY не задан — сбор пропущен.")
        return []

    city = city or settings.lead_gen_city
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"

    leads: list[dict[str, Any]] = []
    next_token: Optional[str] = None
    timeout = aiohttp.ClientTimeout(total=20)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            for _page in range(3):
                if len(leads) >= limit:
                    break
                if next_token:
                    # Google отдаёт токен раньше, чем страница готова.
                    await asyncio.sleep(2.0)
                    params = {
                        "pagetoken": next_token,
                        "key": settings.google_places_api_key,
                    }
                else:
                    params = {
                        "query": f"{query} {city}",
                        "key": settings.google_places_api_key,
                        "language": "ru",
                    }

                async with session.get(url, params=params) as resp:
                    if resp.status != 200:
                        logger.error("Google HTTP %s", resp.status)
                        break
                    data = await resp.json()

                results = data.get("results") or []
                if not results:
                    break
                for it in results:
                    leads.append(_lead_from_google(it, city, company_type, district))

                next_token = data.get("next_page_token")
                if not next_token:
                    break
    except Exception as e:  # noqa: BLE001
        logger.exception("Google: ошибка запроса: %s", e)

    logger.info("Google: получено %d заведений (%s)", len(leads), company_type)
    return leads[:limit]


def _lead_from_google(
    it: dict[str, Any], city: str, company_type: str, district: Optional[str]
) -> dict[str, Any]:
    """Карточка Google Places → нормализованный лид."""
    score = it.get("rating")
    review_count = it.get("user_ratings_total")
    review_summary = None
    if score:
        review_summary = f"Google Рейтинг: {score}" + (
            f" ({review_count} отзывов)" if review_count else ""
        )

    point = point_from_google(it)
    name = it.get("name")

    return {
        "company_name": name,
        "phone": None,  # Требует Place Details — отдельный платный вызов
        "email": None,
        "address": it.get("formatted_address"),
        "city": city,
        "district": district,
        "review_score": float(score) if score else None,
        "review_summary": review_summary,
        "source": "google_places",
        "source_ref": str(it.get("place_id")),
        "company_type": company_type,
        "audience": guess_audience(name),
        "audience_source": "guess",
        "latitude": point[0] if point else None,
        "longitude": point[1] if point else None,
        "geo_precision": "exact" if point else None,
    }


# ─────────────────────────────────────────────────────────────────────
# Источник 1b: Yandex Maps Search API
# ─────────────────────────────────────────────────────────────────────
async def collect_from_yandex_maps(
    city: Optional[str] = None,
    query: str = "ресторан",
    limit: int = 50,
    company_type: str = "restaurant",
    district: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Ищет заведения через Yandex Maps (Search API). Листает через `skip`."""
    if not getattr(settings, "yandex_maps_api_key", None):
        logger.warning("Yandex: YANDEX_MAPS_API_KEY не задан — сбор пропущен.")
        return []

    city = city or settings.lead_gen_city
    url = "https://search-maps.yandex.ru/v1/"
    page_size = min(max(limit, 1), 50)

    leads: list[dict[str, Any]] = []
    timeout = aiohttp.ClientTimeout(total=20)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            for page in range(MAX_PAGES):
                if len(leads) >= limit:
                    break
                params = {
                    "text": f"{query} {city}",
                    "type": "biz",
                    "lang": "ru_RU",
                    "results": page_size,
                    "skip": page * page_size,
                    "apikey": settings.yandex_maps_api_key,
                }
                async with session.get(url, params=params) as resp:
                    if resp.status != 200:
                        logger.error(
                            "Yandex HTTP %s: %s", resp.status, (await resp.text())[:100]
                        )
                        break
                    data = await resp.json()

                features = data.get("features") or []
                if not features:
                    break
                for it in features:
                    leads.append(_lead_from_yandex(it, city, company_type, district))

                if len(features) < page_size:
                    break
                await asyncio.sleep(RATE_LIMIT_SECONDS)
    except Exception as e:  # noqa: BLE001
        logger.exception("Yandex: ошибка запроса: %s", e)

    logger.info("Yandex: получено %d заведений (%s)", len(leads), company_type)
    return leads[:limit]


def _lead_from_yandex(
    it: dict[str, Any], city: str, company_type: str, district: Optional[str]
) -> dict[str, Any]:
    """Карточка Яндекса → нормализованный лид."""
    props = it.get("properties", {}).get("CompanyMetaData", {})
    name = props.get("name")

    phone = None
    phones = props.get("Phones") or []
    if phones:
        phone = phones[0].get("formatted")

    url_website = props.get("url")
    point = point_from_yandex(it)

    return {
        "company_name": name,
        "phone": phone,
        "email": None,
        "address": props.get("address"),
        "city": city,
        "district": district,
        # Search API рейтинги в CompanyMetaData не отдаёт.
        "review_score": None,
        "review_summary": f"Сайт: {url_website}" if url_website else None,
        "source": "yandex_maps",
        "source_ref": str(props.get("id")),
        "company_type": company_type,
        "audience": guess_audience(name),
        "audience_source": "guess",
        "latitude": point[0] if point else None,
        "longitude": point[1] if point else None,
        "geo_precision": "exact" if point else None,
    }


# ─────────────────────────────────────────────────────────────────────
# Источник 2: ручной список / CSV
# ─────────────────────────────────────────────────────────────────────
# Колонки (обязательна одна — company_name):
#   company_name,phone,email,address,city,district,company_type,audience,
#   latitude,longitude,review_score,review_summary,source_ref
#
# Раньше разбирались только первые шесть, а координаты, район, тип и
# аудитория молча выбрасывались — при том, что полевая команда приносит
# именно их: адрес без координаты геокодеру ещё надо разобрать, а пол зала
# не знает ни один справочник.
CSV_FIELDS = (
    "company_name", "phone", "email", "address", "city", "district",
    "company_type", "audience", "latitude", "longitude",
    "review_score", "review_summary", "source_ref",
)


def parse_manual_csv(path: str, company_type: str = "restaurant") -> list[dict[str, Any]]:
    """
    CSV → нормализованные лиды.

    `company_type` — значение для строк, где колонка не заполнена.
    """
    leads: list[dict[str, Any]] = []
    with open(path, newline="", encoding="utf-8") as f:
        for i, row in enumerate(csv.DictReader(f)):
            def cell(key: str) -> Optional[str]:
                value = (row.get(key) or "").strip()
                return value or None

            name = cell("company_name")
            if not name:
                continue

            score = cell("review_score")
            point = _valid_point(cell("latitude"), cell("longitude"))
            # Пол зала, названный человеком, важнее догадки по названию —
            # и помечается 'manual', чтобы ночной сбор его не затёр.
            audience = cell("audience")
            audience_source = "manual" if audience else "guess"
            if not audience:
                audience = guess_audience(name)

            leads.append(
                {
                    "company_name": name,
                    "phone": cell("phone"),
                    "email": cell("email"),
                    "address": cell("address"),
                    "city": cell("city"),
                    "district": cell("district"),
                    "review_score": float(score) if score else None,
                    "review_summary": cell("review_summary"),
                    "source": "manual",
                    "source_ref": cell("source_ref") or f"manual:{name}:{i}",
                    "company_type": cell("company_type") or company_type,
                    "audience": audience,
                    "audience_source": audience_source,
                    "latitude": point[0] if point else None,
                    "longitude": point[1] if point else None,
                    "geo_precision": "exact" if point else None,
                }
            )
    logger.info("Ручной импорт: разобрано %d строк из %s", len(leads), path)
    return leads


# ─────────────────────────────────────────────────────────────────────
# Запись в БД с дедупликацией
# ─────────────────────────────────────────────────────────────────────


def sanitize_phone(phone: str | None) -> str | None:
    """Последние 9 цифр — ключ сравнения номеров.

    Тонкая обёртка над `shared/phone`: определение «тот же номер» в проекте
    должно быть одно. Раньше здесь жила своя копия, а рядом — ещё три, и они
    расходились ровно настолько, чтобы дедупликация промахивалась.
    """
    return phone_utils.match_tail(phone)


def sanitize_name(name: str | None) -> str | None:
    """Удаляет пробелы и спецсимволы, приводит к нижнему регистру для сравнения."""
    if not name:
        return None
    return re.sub(r"[\s\.,'\"\-«»]", "", name.lower())


def city_key(city: str | None) -> str:
    """
    Город для ключа дедупа.

    Сначала пробуем свести к slug'у зоны обслуживания, и только если
    написание неизвестно — берём очищенную строку как есть. Пусто — общая
    корзина, а не отдельный «город без имени».
    """
    return normalize_city(city) or sanitize_name(city) or ""


def is_same_place(
    known: list[tuple[float, float] | None], point: tuple[float, float] | None
) -> bool:
    """
    Одноимённое заведение — то же самое или другое?

    Если хоть у одной стороны координаты нет, сравнивать нечем: считаем
    дублем, как считали всегда. Осторожность здесь дешевле — второй
    «Ресторан Registon» в базе портит и обзвон, и отчёт.
    """
    if point is None:
        return True
    for other in known:
        if other is None:
            return True
        if meters_between(other, point) <= SAME_PLACE_METERS:
            return True
    return False


async def import_leads(leads: list[dict[str, Any]]) -> dict[str, int]:
    """
    Вставляет лидов в customers, пропуская дубликаты.
    Дедуп по (source, source_ref), затем по phone, затем по (названию, городу).
    Возвращает {'inserted': N, 'skipped': M}.

    Сверка идёт по ВСЕЙ базе клиентов и по обоим названиям (`name` и
    `company_name`), а не только по b2b и `company_name`, как раньше: ресторан,
    заведённый менеджером при продаже, лежит с `customer_type='b2b'`, но
    названием в `name` — ночной сбор его не видел и заводил рядом второго.

    Город в ключе появился вместе с обходом области: «Кафе Дружба» в Ургуте
    и «Кафе Дружба» в Джамбае — два разных заведения, а по одному имени они
    склеивались в одно, и второго в базе просто не возникало.
    """
    inserted = skipped = 0
    async with get_session_ctx() as session:
        # In-memory индексы: пачка бывает в сотни лидов, и три селекта на
        # каждого превратили бы ночную задачу в тысячи запросов.
        res = await session.execute(
            text(
                "SELECT source, source_ref, phone, name, company_name, city, "
                "latitude, longitude FROM customers"
            )
        )
        existing_rows = res.fetchall()

        seen_refs = {
            (r.source, r.source_ref) for r in existing_rows if r.source and r.source_ref
        }
        seen_phones = {
            sanitize_phone(r.phone) for r in existing_rows if sanitize_phone(r.phone)
        }
        # (имя, город) → координаты уже известных одноимённых заведений.
        seen_names: dict[tuple[str, str], list[tuple[float, float] | None]] = {}
        for r in existing_rows:
            key_city = city_key(r.city)
            known_point = _valid_point(r.latitude, r.longitude)
            for value in (r.name, r.company_name):
                key_name = sanitize_name(value)
                if key_name:
                    seen_names.setdefault((key_name, key_city), []).append(known_point)

        for lead in leads:
            name = lead.get("company_name")
            if not name:
                skipped += 1
                continue

            s_phone = sanitize_phone(lead.get("phone"))
            s_name = sanitize_name(name)
            s_ref = (lead.get("source"), lead.get("source_ref"))
            point = _valid_point(lead.get("latitude"), lead.get("longitude"))
            city = lead.get("city") or settings.lead_gen_city
            name_key = (s_name, city_key(city)) if s_name else None

            is_dup = False
            if s_ref[0] and s_ref[1] and s_ref in seen_refs:
                is_dup = True
            elif s_phone and s_phone in seen_phones:
                is_dup = True
            elif name_key and name_key in seen_names:
                is_dup = is_same_place(seen_names[name_key], point)

            if is_dup:
                skipped += 1
                continue

            # Добавляем в локальные индексы, чтобы не добавить дубли внутри одной пачки
            if s_ref[0] and s_ref[1]:
                seen_refs.add(s_ref)
            if s_phone:
                seen_phones.add(s_phone)
            if name_key:
                seen_names.setdefault(name_key, []).append(point)

            await session.execute(
                text(
                    "INSERT INTO customers "
                    "(name, company_name, phone, email, address, city, district, "
                    " customer_type, company_type, audience, audience_source, status, "
                    " source, source_ref, review_score, review_summary, "
                    " latitude, longitude, geo_source, geo_precision, geo_address, geocoded_at, created_at) "
                    "VALUES (:name, :company, :phone, :email, :address, :city, :district, "
                    " 'b2b', :ctype, :audience, :audience_source, 'lead', "
                    " :source, :ref, :score, :summary, "
                    # Время ставит база. Здесь был параметр с зоной
                    # (`datetime.now(timezone.utc)`), а `geocoded_at` — колонка
                    # `timestamp without time zone`: asyncpg такое не связывает
                    # и валит вставку лида целиком. Тот же дефект был в
                    # `geo.py`, и оба места пишут в одну колонку.
                    #
                    # Условие переехало в SQL: без координат отметки о
                    # геокодировании быть не должно.
                    #
                    # ⚠️ CAST в CASE обязателен. Параметр :lat встречается в
                    # запросе ДВАЖДЫ — значением колонки и внутри IS NULL, —
                    # и asyncpg на подготовке выражения отказывался вывести
                    # его тип: «could not determine data type of parameter
                    # $15». Падала КАЖДАЯ вставка лида с координатами, то
                    # есть весь сбор целиком. Статические сверки такое не
                    # ловят (колонки-то на месте), а живой базы под рукой не
                    # было — ошибка и дожила до первого прогона.
                    " :lat, :lon, :geo_source, :geo_precision, :geo_address, "
                    " CASE WHEN CAST(:lat AS double precision) IS NULL "
                    "      THEN NULL ELSE NOW() END, NOW())"
                ),
                {
                    "lat": point[0] if point else None,
                    "lon": point[1] if point else None,
                    "geo_source": lead.get("source") if point else None,
                    "geo_precision": lead.get("geo_precision") if point else None,
                    "geo_address": lead.get("address") if point else None,
                    "name": name,
                    "company": name,
                    # Канон +998XXXXXXXXX. Раньше сюда ложилась сырая строка из
                    # 2ГИС, и по ней потом промахивался поиск клиента при продаже.
                    "phone": phone_utils.normalize(lead.get("phone")),
                    "email": lead.get("email"),
                    "address": lead.get("address"),
                    # Город берётся из самого лида. Раньше здесь стоял
                    # settings.lead_gen_city, и сбор по Ургуту записывался
                    # Самаркандом: аргумент `city` доходил до провайдера, но
                    # не до вставки.
                    "city": city,
                    "district": lead.get("district"),
                    "ctype": lead.get("company_type") or "restaurant",
                    "audience": lead.get("audience"),
                    # Без аудитории источник аудитории бессмыслен: пустое
                    # значение с меткой 'guess' выглядело бы как выясненное.
                    "audience_source": (
                        lead.get("audience_source") if lead.get("audience") else None
                    ),
                    "source": lead.get("source", "manual"),
                    "ref": lead.get("source_ref"),
                    "score": lead.get("review_score"),
                    "summary": lead.get("review_summary"),
                },
            )
            inserted += 1

        if inserted > 0:
            await session.commit()

    logger.info("Импорт лидов: +%d новых, %d пропущено (дубли)", inserted, skipped)
    return {"inserted": inserted, "skipped": skipped}


# ─────────────────────────────────────────────────────────────────────
# Обход: категория × населённый пункт × провайдер
# ─────────────────────────────────────────────────────────────────────
async def collect_venues(
    categories: Optional[Iterable[str]] = None,
    places: Optional[list[tuple[str, Optional[str]]]] = None,
    limit_per_query: int = 200,
) -> list[dict[str, Any]]:
    """
    Собирает заведения по всем заданным категориям и населённым пунктам,
    со всех настроенных провайдеров. В базу НЕ пишет — это делает
    `import_leads`, чтобы выгрузку можно было сначала посмотреть глазами.

    Провайдер без ключа отдаёт пустой список и не мешает остальным.
    """
    cats = list(categories) if categories else list(VENUE_QUERIES)
    spots = places if places is not None else SAMARKAND_PLACES

    unknown = [c for c in cats if c not in VENUE_QUERIES]
    if unknown:
        raise ValueError(
            f"Неизвестные категории: {', '.join(unknown)}. "
            f"Доступные: {', '.join(sorted(VENUE_QUERIES))}"
        )

    collected: list[dict[str, Any]] = []
    for category in cats:
        before = len(collected)
        for place, district in spots:
            for query in VENUE_QUERIES[category]:
                for collector in (
                    collect_from_2gis,
                    collect_from_google_places,
                    collect_from_yandex_maps,
                ):
                    collected.extend(
                        await collector(
                            city=place,
                            query=query,
                            limit=limit_per_query,
                            company_type=category,
                            district=district,
                        )
                    )
        logger.info(
            "Категория '%s': %d карточек (дубли между источниками снимет import_leads)",
            category, len(collected) - before,
        )

    return collected


async def collect_and_import_all(
    limit: Optional[int] = None,
    city: Optional[str] = None,
    categories: Optional[Iterable[str]] = None,
    places: Optional[list[tuple[str, Optional[str]]]] = None,
) -> dict[str, int]:
    """Собирает лиды со ВСЕХ настроенных источников и складывает в базу.

    `city` оставлен ради вызовов вида «собери лидов по Ташкенту»: он сужает
    обход до одного населённого пункта.
    """
    limit = limit or settings.b2b_daily_limit * 3
    if city and places is None:
        places = [(city, None)]

    all_leads = await collect_venues(
        categories=categories, places=places, limit_per_query=limit
    )

    if not all_leads:
        logger.warning(
            "Сбор лидов завершён, но ни один источник не дал результатов "
            "(или ключи не настроены)."
        )
        return {"inserted": 0, "skipped": 0}

    return await import_leads(all_leads)
