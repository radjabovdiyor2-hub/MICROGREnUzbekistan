"""
🗺 Геокодирование адресов клиентов — для карты в веб-админке.

Живёт в офисе, а не в вебе, по трём причинам: ключи провайдеров (DGIS,
GOOGLE_PLACES, YANDEX) уже здесь; проход по тысячам адресов с паузой в
секунду — работа демона, а не HTTP-роута Next; и async-инфраструктура для
долгих задач тоже уже есть. Веб зовёт офис по HTTP через `officeFetch`,
запрет на прямые импорты между модулями не нарушается.

ЧЕГО ЭТОТ МОДУЛЬ НЕ ДЕЛАЕТ, И ЭТО ВАЖНО

Он не ставит пин, если провайдер вернул точность уровня «город». Тысяча
клиентов с адресом «Ташкент» слиплась бы в одну точку в центре, и карта
уверенно врала бы: скопление выглядит как реальный кластер заведений.
Такие уходят в лоток «без координат» — честное «не знаем» полезнее
правдоподобной выдумки.

Он никогда не трогает строки с `geo_source = 'manual'`. Точка, поставленная
человеком, авторитетнее любого провайдера.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Any, Optional

import aiohttp
from sqlalchemy import text

from shared.config import settings
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

# Пауза между обращениями к провайдеру. Секунда — требование Nominatim и
# вежливость по отношению к остальным; батч всё равно фоновый.
RATE_LIMIT_SECONDS = 1.1

# Границы Узбекистана с запасом — тот же предохранитель, что в lead_gen.
_UZ_LAT = (37.0, 46.0)
_UZ_LON = (55.0, 74.0)

# Точности, при которых пин ставить МОЖНО. «city» сюда не входит намеренно.
PLACEABLE = frozenset({"exact", "street", "district"})


# ─────────────────────────────────────────────────────────────────────
# Нормализация адреса — ключ кэша
# ─────────────────────────────────────────────────────────────────────

# Узбекская кириллица и пять видов апострофа. NFKD их не разложит —
# таблица нужна явная.
_CHAR_MAP = {
    "ў": "o", "ғ": "g", "ҳ": "h", "қ": "q",
    "Ў": "o", "Ғ": "g", "Ҳ": "h", "Қ": "q",
    "ʻ": "", "ʼ": "", "‘": "", "’": "", "´": "", "`": "", "'": "",
}

# Кириллица → латиница. Один канон: адреса приходят в трёх системах письма,
# и латиница — единственная, куда сводятся все три.
_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

# Синонимы адресных слов. Ключ — что встречается, значение — канон.
_SYNONYMS = {
    "ul": "st", "ulitsa": "st", "kochasi": "st", "kocha": "st", "kucha": "st",
    "street": "st", "st": "st",
    "prospekt": "pr", "prosp": "pr", "shoh": "pr", "avenue": "pr", "pr": "pr",
    "dom": "d", "uy": "d", "d": "d",
    "mkr": "mkr", "massiv": "mkr", "mavze": "mkr", "mfy": "mkr",
    "mahalla": "mkr", "maxalla": "mkr",
}

# Слова, которые адрес не уточняют вовсе: «г.», «sh.», название страны.
_DROP = frozenset({
    "g", "gor", "gorod", "sh", "shahri", "shahar", "city",
    "respublika", "uzbekistan", "ozbekiston",
    # Маркеры района. Без них «Urgut tumani» не сводился к «Urgut», и
    # normalize_city отвечал None на половину адресов области.
    "tumani", "tuman", "rayon", "raion", "obl", "viloyat",
})

# Маркеры квартиры. Пин ставится в дом, поэтому выбрасывается и сам маркер,
# И СЛЕДУЮЩИЙ ЗА НИМ НОМЕР. Выбросить только слово мало: от «кв. 12»
# останется «12», и один дом даст столько ключей кэша, сколько в нём квартир.
_APARTMENT = frozenset({"kv", "kvartira", "xonadon", "apt", "kvart"})

# Города области сведены к slug'у 'samarkand' намеренно: здесь slug города
# означает ЗОНУ ОБСЛУЖИВАНИЯ, а не населённый пункт — точное место живёт в
# `district`. Зеркало — CITY_ALIASES в apps/web/src/lib/customers/addressKey.ts.
_CITY_ALIASES = {
    "tashkent": "tashkent", "toshkent": "tashkent",
    "samarkand": "samarkand", "samarqand": "samarkand",
    "samarqandviloyati": "samarkand", "samarkandskayaoblast": "samarkand",
    "bulungur": "samarkand",
    "ishtixon": "samarkand", "ishtixan": "samarkand", "ishtikhan": "samarkand",
    "jomboy": "samarkand", "djambay": "samarkand",
    "kattaqorgon": "samarkand", "kattakurgan": "samarkand",
    "qoshrabot": "samarkand", "kushrabot": "samarkand", "kushrabad": "samarkand",
    "narpay": "samarkand",
    "nurobod": "samarkand", "nurabad": "samarkand",
    "oqdaryo": "samarkand", "akdarya": "samarkand",
    "pastdargom": "samarkand",
    "paxtachi": "samarkand",
    "payariq": "samarkand", "payarik": "samarkand",
    "toyloq": "samarkand", "taylak": "samarkand",
    "urgut": "samarkand",
    "gulobod": "samarkand",
}


def _fold(raw: str) -> str:
    """Строка → латиница нижнего регистра без апострофов."""
    out = []
    for ch in raw.lower():
        ch = _CHAR_MAP.get(ch, ch)
        out.append(_TRANSLIT.get(ch, ch))
    return "".join(out)


def normalize_city(raw: Optional[str]) -> Optional[str]:
    """
    Город → slug. None, если написание неизвестно.

    Лечит расхождение, которое живёт прямо в схеме: `customers.city` по
    умолчанию "Samarqand", а `orders.city` — "tashkent". Плюс менеджеры
    пишут «Ташкент», лид-ген кладёт «Toshkent», а узбекская кириллица
    добавляет «Тошкент».
    """
    if not raw:
        return None
    tokens = [t for t in re.split(r"[^a-z0-9]+", _fold(raw)) if t and t not in _DROP]
    key = "".join(tokens)
    return _CITY_ALIASES.get(key)


def normalize_address(raw: Optional[str], city: Optional[str] = None) -> Optional[str]:
    """
    Адрес → канонический вид для ключа кэша. None, если смотреть не на что.

    Порядок токенов НЕ сортируется: сортировка склеила бы «дом 12 по улице 5»
    и «дом 5 по улице 12» в один ключ, и два разных заведения получили бы
    одну точку.
    """
    if not raw or not raw.strip():
        return None

    tokens: list[str] = []
    skip_number = False
    for token in re.split(r"[^a-z0-9]+", _fold(raw)):
        if not token or token in _DROP:
            continue
        if token in _APARTMENT:
            # Дальше идёт номер квартиры — его тоже за борт.
            skip_number = True
            continue
        if skip_number:
            skip_number = False
            if token.isdigit():
                continue
        tokens.append(_SYNONYMS.get(token, token))

    if not tokens:
        return None

    slug = normalize_city(city) or ""
    return f"{slug}|{' '.join(tokens)}" if slug else " ".join(tokens)


def address_key(raw: Optional[str], city: Optional[str] = None) -> Optional[str]:
    """sha256 нормализованного адреса. None — адреса нет."""
    normalized = normalize_address(raw, city)
    if normalized is None:
        return None
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


# Районы Ташкента и Самаркандской области. Ключ — как слово выглядит после _fold,
# значение — slug, тот же, что в apps/web/src/lib/customers/districts.ts.
# Список держится здесь, а не тянется из веба: между модулями нет прямых
# импортов, а четырнадцать строк дешевле HTTP-вызова за справочником.
_DISTRICTS = {
    "bektemir": "bektemir",
    "chilonzor": "chilanzar", "chilanzar": "chilanzar", "chilanzor": "chilanzar",
    "mirobod": "mirobod", "mirabad": "mirobod",
    "mirzoulugbek": "mirzo-ulugbek", "mirzoulugbec": "mirzo-ulugbek",
    "olmazor": "olmazor", "almazar": "olmazor",
    "sergeli": "sergeli", "sergely": "sergeli",
    "shayxontohur": "shayxontohur", "shayhontohur": "shayxontohur",
    "yakkasaroy": "yakkasaroy", "yakkasaray": "yakkasaroy",
    "yangihayot": "yangihayot",
    "yashnobod": "yashnobod", "yashnabad": "yashnobod",
    "yunusobod": "yunusobod", "yunusabad": "yunusobod",
    "siyob": "siyob", "siab": "siyob",
    "temiryol": "temiryol",
    # Самаркандская область — 14 туманов. Без них тойхоны с выездов из
    # города приходили с district = NULL и в разрезе не существовали.
    "bulungur": "bulungur",
    "ishtixon": "ishtixon", "ishtixan": "ishtixon", "ishtikhan": "ishtixon",
    "jomboy": "jomboy", "djambay": "jomboy",
    "kattaqorgon": "kattaqorgon", "kattakurgan": "kattaqorgon",
    "qoshrabot": "qoshrabot", "kushrabot": "qoshrabot", "kushrabad": "qoshrabot",
    "narpay": "narpay",
    "nurobod": "nurobod", "nurabad": "nurobod",
    "oqdaryo": "oqdaryo", "akdarya": "oqdaryo",
    "pastdargom": "pastdargom",
    "paxtachi": "paxtachi",
    "payariq": "payariq", "payarik": "payariq",
    "toyloq": "toyloq", "taylak": "toyloq", "tayloq": "toyloq",
    "urgut": "urgut",
    # Самаркандский туман — по названию его центра, посёлка Гулобод.
    # Слова «samarqand» здесь нет и быть не может: оно стоит в КАЖДОМ
    # городском адресе, и весь Самарканд разом уехал бы в сельский район.
    "gulobod": "samarqand-tumani",
}


# Русские прилагательные окончания: «Чиланзарский район», «в Сиабском».
# Отрезаются ПОСЛЕ неудачи точного совпадения — так поиск остаётся
# пословным и не превращается в поиск подстроки.
_ADJ_SUFFIXES = ("skogo", "skomu", "skiy", "skij", "skom", "skoy", "skaya", "sky", "ski")


def district_from_text(raw: Optional[str]) -> Optional[str]:
    """
    Район из строки адреса. None — если провайдер его не назвал.

    Ищем по отдельным словам, а не подстрокой: «Мирзо» — начало
    Мирзо-Улугбека, но само по себе района не даёт, и поиск подстрокой
    уверенно приписал бы клиента не туда. Ошибка в районе тише ошибки в
    координате и потому опаснее: неверный пин видно на карте сразу, а
    клиент в соседнем тумане молча портит разрез «где недобираем».
    """
    if not raw:
        return None

    for token in re.split(r"[^a-z0-9]+", _fold(raw)):
        if not token:
            continue
        slug = _DISTRICTS.get(token)
        if slug:
            return slug
        # «chilanzarskiy» → «chilanzar». Пробуем только если целое слово
        # не подошло, и только с известным окончанием.
        for suffix in _ADJ_SUFFIXES:
            if token.endswith(suffix) and len(token) > len(suffix) + 2:
                slug = _DISTRICTS.get(token[: -len(suffix)])
                if slug:
                    return slug
                break
    return None


def valid_point(lat: Any, lon: Any) -> Optional[tuple[float, float]]:
    """Пара чисел в пределах Узбекистана — иначе None."""
    try:
        lat_f, lon_f = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if not (_UZ_LAT[0] <= lat_f <= _UZ_LAT[1]):
        return None
    if not (_UZ_LON[0] <= lon_f <= _UZ_LON[1]):
        return None
    return lat_f, lon_f


# ─────────────────────────────────────────────────────────────────────
# Провайдеры
# ─────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class GeoHit:
    latitude: float
    longitude: float
    precision: str  # exact | street | district | city
    provider: str
    display_name: Optional[str] = None
    # Slug района на латинице. Провайдеры называют его по-разному и не
    # всегда — поэтому Optional, а разрез по районам просто не считает
    # тех, у кого его нет, вместо того чтобы придумывать «прочее».
    district: Optional[str] = None

    @property
    def placeable(self) -> bool:
        """Можно ли ставить пин. Точность «город» — нельзя."""
        return self.precision in PLACEABLE


async def _geocode_dgis(session: aiohttp.ClientSession, query: str) -> Optional[GeoHit]:
    """2ГИС: лучшее покрытие Узбекистана, ключ у нас уже есть."""
    if not settings.dgis_api_key:
        return None
    params = {
        "q": query,
        "key": settings.dgis_api_key,
        "fields": "items.point,items.address_name",
        "page_size": 1,
    }
    async with session.get("https://catalog.api.2gis.com/3.0/items/geocode", params=params) as resp:
        if resp.status != 200:
            logger.warning("2ГИС геокодер HTTP %s", resp.status)
            return None
        data = await resp.json()

    items = (data.get("result") or {}).get("items") or []
    if not items:
        return None
    item = items[0]
    point = valid_point((item.get("point") or {}).get("lat"), (item.get("point") or {}).get("lon"))
    if not point:
        return None

    # 2ГИС называет тип найденного объекта: building/street/adm_div.
    kind = str(item.get("type") or "")
    precision = "exact" if kind == "building" else "street" if kind == "street" else "city"
    address = item.get("address_name")
    return GeoHit(point[0], point[1], precision, "2gis", address, district_from_text(address))


async def _geocode_yandex(session: aiohttp.ClientSession, query: str) -> Optional[GeoHit]:
    """Яндекс: хорошо разбирает кириллические адреса."""
    key = settings.yandex_geocoder_api_key
    if not key:
        return None
    params = {"apikey": key, "geocode": query, "format": "json", "results": 1, "lang": "ru_RU"}
    async with session.get("https://geocode-maps.yandex.ru/1.x/", params=params) as resp:
        if resp.status != 200:
            logger.warning("Яндекс геокодер HTTP %s", resp.status)
            return None
        data = await resp.json()

    members = (
        data.get("response", {})
        .get("GeoObjectCollection", {})
        .get("featureMember", [])
    )
    if not members:
        return None
    obj = members[0].get("GeoObject", {})

    # `pos` — строка «долгота широта». Порядок обратный привычному, и это
    # самая частая ошибка в геоданных: пара валидна в обе стороны.
    pos = (obj.get("Point") or {}).get("pos") or ""
    parts = pos.split()
    if len(parts) != 2:
        return None
    point = valid_point(parts[1], parts[0])
    if not point:
        return None

    kind = (
        obj.get("metaDataProperty", {})
        .get("GeocoderMetaData", {})
        .get("precision", "")
    )
    precision = {
        "exact": "exact", "number": "exact", "near": "street",
        "range": "street", "street": "street", "other": "city",
    }.get(kind, "city")
    full = obj.get("metaDataProperty", {}).get("GeocoderMetaData", {}).get("text")
    return GeoHit(point[0], point[1], precision, "yandex", obj.get("name"),
                  district_from_text(full or obj.get("description")))


async def _geocode_nominatim(session: aiohttp.ClientSession, query: str) -> Optional[GeoHit]:
    """
    OpenStreetMap. ТОЛЬКО как резерв для разработки.

    Условия OSMF запрещают массовое и коммерчески-первичное использование
    публичного Nominatim, поэтому в проде провайдер выключен и включается
    явным GEOCODER_ALLOW_NOMINATIM=1.
    """
    params = {"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "uz"}
    headers = {"User-Agent": "MicrogreenUzbekistan/1.0 (admin customer map)"}
    async with session.get(
        "https://nominatim.openstreetmap.org/search", params=params, headers=headers
    ) as resp:
        if resp.status != 200:
            logger.warning("Nominatim HTTP %s", resp.status)
            return None
        data = await resp.json()

    if not data:
        return None
    first = data[0]
    point = valid_point(first.get("lat"), first.get("lon"))
    if not point:
        return None

    category = str(first.get("addresstype") or first.get("type") or "")
    precision = (
        "exact" if category in {"house", "building", "amenity", "restaurant"}
        else "street" if category in {"road", "residential"}
        else "city"
    )
    shown = first.get("display_name")
    return GeoHit(point[0], point[1], precision, "nominatim", shown, district_from_text(shown))


def _providers() -> list[tuple[str, Any]]:
    """
    Каскад: останавливаемся на первом попадании.

    Порядок не случаен — сперва тот, чьи данные по Узбекистану полнее.
    """
    chain: list[tuple[str, Any]] = []
    if settings.dgis_api_key:
        chain.append(("2gis", _geocode_dgis))
    if settings.yandex_geocoder_api_key:
        chain.append(("yandex", _geocode_yandex))
    if settings.geocoder_allow_nominatim:
        chain.append(("nominatim", _geocode_nominatim))
    return chain


# ─────────────────────────────────────────────────────────────────────
# Кэш
# ─────────────────────────────────────────────────────────────────────


async def _cache_get(session, key: str) -> Optional[dict[str, Any]]:
    row = (
        await session.execute(
            text(
                "SELECT latitude, longitude, precision, provider, district FROM geocode_cache "
                "WHERE query_hash = :k"
            ),
            {"k": key},
        )
    ).first()
    if row is None:
        return None
    return {"latitude": row[0], "longitude": row[1], "precision": row[2],
            "provider": row[3], "district": row[4]}


async def _cache_put(session, key: str, query: str, hit: Optional[GeoHit], error: Optional[str]) -> None:
    """
    Промах кэшируется наравне с попаданием.

    Без этого безнадёжный адрес вроде «возле старого базара» будет молотить
    провайдера при каждом прогоне, а условия Nominatim прямо требуют
    кэшировать результаты на своей стороне.
    """
    await session.execute(
        text(
            "INSERT INTO geocode_cache "
            "(query_hash, query_text, latitude, longitude, precision, provider, district, last_error, attempts, created_at, updated_at) "
            "VALUES (:k, :q, :lat, :lon, :prec, :prov, :district, :err, 1, NOW(), NOW()) "
            "ON CONFLICT (query_hash) DO UPDATE SET "
            "  latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, "
            "  precision = EXCLUDED.precision, provider = EXCLUDED.provider, "
            "  district = EXCLUDED.district, "
            "  last_error = EXCLUDED.last_error, "
            "  attempts = geocode_cache.attempts + 1, updated_at = NOW()"
        ),
        {
            "k": key,
            "q": query[:500],
            "lat": hit.latitude if hit else None,
            "lon": hit.longitude if hit else None,
            "prec": hit.precision if hit else None,
            "prov": hit.provider if hit else "none",
            "district": hit.district if hit else None,
            "err": error,
        },
    )


# ─────────────────────────────────────────────────────────────────────
# Прогон
# ─────────────────────────────────────────────────────────────────────


def pick_address(customer_address: Optional[str], delivery_address: Optional[str]) -> Optional[str]:
    """
    Какой адрес геокодировать.

    Карточка клиента заполнена только у лидов из внешних источников; у всех
    остальных настоящий адрес живёт в последнем заказе. Берём первое
    непустое — сначала карточку, она точнее описывает само заведение.
    """
    for candidate in (customer_address, delivery_address):
        if candidate and candidate.strip():
            return candidate.strip()
    return None


async def geocode_pass(batch: int = 25, city: Optional[str] = None) -> dict[str, Any]:
    """
    Один проход геокодера. Состояние целиком в базе, поэтому прогон можно
    оборвать и повторить — обработанные строки просто не попадут в выборку.
    """
    chain = _providers()
    if not chain:
        return {
            "ok": False,
            "error": "Ни один геокодер не настроен: задайте DGIS_API_KEY или YANDEX_GEOCODER_API_KEY",
        }

    stats = {"processed": 0, "placed": 0, "cached": 0, "failed": 0, "too_coarse": 0, "no_address": 0}

    async with get_session_ctx() as db:
        rows = (
            await db.execute(
                text(
                    "SELECT c.id, c.address, c.city, "
                    "       (SELECT o.delivery_address FROM crm_orders o "
                    "         WHERE o.customer_id = c.id AND o.delivery_address IS NOT NULL "
                    "           AND o.delivery_address <> '' "
                    "         ORDER BY o.created_at DESC LIMIT 1) AS delivery_address "
                    "  FROM customers c "
                    " WHERE c.latitude IS NULL "
                    "   AND c.geo_source IS DISTINCT FROM 'manual' "
                    + ("   AND lower(c.city) LIKE :city " if city else "")
                    + " ORDER BY c.total_spent DESC NULLS LAST "
                    " LIMIT :batch"
                ),
                {"batch": batch, **({"city": f"%{city.lower()}%"} if city else {})},
            )
        ).all()

        if not rows:
            return {"ok": True, "done": True, **stats}

        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as http:
            for cid, address, city_value, delivery in rows:
                stats["processed"] += 1
                raw = pick_address(address, delivery)
                if raw is None:
                    stats["no_address"] += 1
                    continue

                key = address_key(raw, city_value)
                if key is None:
                    stats["no_address"] += 1
                    continue

                cached = await _cache_get(db, key)
                hit: Optional[GeoHit] = None
                if cached is not None:
                    stats["cached"] += 1
                    if cached["latitude"] is not None:
                        hit = GeoHit(
                            cached["latitude"], cached["longitude"],
                            cached["precision"] or "city", cached["provider"],
                            district=cached["district"],
                        )
                else:
                    query = f"{raw}, {city_value}" if city_value else raw
                    error: Optional[str] = None
                    for _, fn in chain:
                        try:
                            hit = await fn(http, query)
                        except Exception as e:  # noqa: BLE001 — провайдер не должен ронять прогон
                            error = str(e)[:200]
                            logger.warning("Геокодер упал на клиенте #%s: %s", cid, e)
                            hit = None
                        await asyncio.sleep(RATE_LIMIT_SECONDS)
                        if hit is not None:
                            break
                    await _cache_put(db, key, query, hit, error)

                if hit is None:
                    stats["failed"] += 1
                    continue

                # Точность «город» — не координата, а центр Ташкента. Такие
                # клиенты остаются в лотке и ждут ручного пина.
                if not hit.placeable:
                    stats["too_coarse"] += 1
                    continue

                await db.execute(
                    text(
                        "UPDATE customers SET latitude = :lat, longitude = :lon, "
                        "  geo_source = :prov, geo_precision = :prec, district = :district, "
                        # Время ставит база, а не Python. Здесь стоял параметр
                        # `datetime.now(timezone.utc)`, а колонка — `timestamp
                        # without time zone`: asyncpg отказывался класть в неё
                        # значение с поясом и валил ВЕСЬ проход геокодера
                        # («can't subtract offset-naive and offset-aware»).
                        # Дефект был недостижим, пока не было ключа 2ГИС.
                        #
                        # Снять зону в Python тоже можно, но тогда сюда лёг бы
                        # UTC, а в соседний `updated_at` — местное время той же
                        # строки: расхождение в пять часов внутри одной записи.
                        "  geo_address = :addr, geocoded_at = NOW(), updated_at = NOW() "
                        " WHERE id = :cid AND geo_source IS DISTINCT FROM 'manual'"
                    ),
                    {
                        "lat": hit.latitude, "lon": hit.longitude,
                        "prov": hit.provider, "prec": hit.precision,
                        "district": hit.district,
                        "addr": raw, "cid": cid,
                    },
                )
                stats["placed"] += 1

        await db.commit()

    logger.info("Геокодер: %s", stats)
    return {"ok": True, "done": len(rows) < batch, **stats}


async def geocode_status() -> dict[str, Any]:
    """Сколько клиентов размещено, сколько ждёт, что в кэше."""
    async with get_session_ctx() as db:
        row = (
            await db.execute(
                text(
                    "SELECT COUNT(*) AS total, "
                    "       COUNT(latitude) AS placed, "
                    "       COUNT(*) FILTER (WHERE latitude IS NULL "
                    "                          AND geo_source IS DISTINCT FROM 'manual') AS pending, "
                    "       COUNT(*) FILTER (WHERE geo_source = 'manual') AS manual "
                    "  FROM customers"
                )
            )
        ).first()
        cache = (
            await db.execute(
                text(
                    "SELECT COUNT(*) AS entries, "
                    "       COUNT(*) FILTER (WHERE latitude IS NULL) AS misses "
                    "  FROM geocode_cache"
                )
            )
        ).first()

    return {
        "ok": True,
        "total": row[0], "placed": row[1], "pending": row[2], "manual": row[3],
        "cache_entries": cache[0], "cache_misses": cache[1],
        "providers": [name for name, _ in _providers()],
    }
