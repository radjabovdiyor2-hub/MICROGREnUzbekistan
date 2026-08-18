"""
🍽 Lead Generation — сбор ресторанов (B2B-лиды) из внешних источников.
======================================================================
Нормализует данные из разных источников в единый формат и складывает
в таблицу customers (status='lead', customer_type='b2b') с дедупликацией.

Источники:
- 2ГИС Catalog API   (collect_from_2gis)   — нужен DGIS_API_KEY
- Ручной список/CSV   (parse_manual_rows)  — работает без ключей

⚠️ Скрейпинг карт/Telegram сознательно НЕ реализован: против ToS, риск бана.
   Используйте официальные API.

Каждый лид приводится к словарю:
    {
      "company_name", "phone", "email", "address",
      "review_score", "review_summary",
      "source", "source_ref", "company_type",
      "latitude", "longitude"
    }

Координаты приходят от всех трёх API даром — их и так возвращают вместе с
адресом. Раньше они выбрасывались (хранить было негде), и карта клиентов в
админке начиналась с пустого экрана. Теперь это основной бесплатный источник
точек для B2B: 2ГИС отдаёт координату входа в заведение, точнее геокодера.
"""

from __future__ import annotations

import csv
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

import aiohttp
from sqlalchemy import text

from shared import phone as phone_utils
from shared.config import settings
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

DGIS_CATALOG_URL = "https://catalog.api.2gis.com/3.0/items"

# Границы Узбекистана с запасом. Координата вне их — это не «далёкий
# ресторан», а перепутанные местами оси или мусор от провайдера. Такую
# точку лучше не сохранять вовсе: пин посреди океана выглядит как данные.
_UZ_LAT = (37.0, 46.0)
_UZ_LON = (55.0, 74.0)


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


# ─────────────────────────────────────────────────────────────────────
# Источник 1: 2ГИС Catalog API
# ─────────────────────────────────────────────────────────────────────
async def collect_from_2gis(
    city: Optional[str] = None,
    query: str = "рестораны",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Ищет заведения в 2ГИС. Возвращает список нормализованных лидов.
    Пустой список, если ключ не задан или произошла ошибка.
    """
    if not settings.dgis_api_key:
        logger.warning("2ГИС: DGIS_API_KEY не задан — сбор пропущен.")
        return []

    city = city or settings.lead_gen_city
    params = {
        "q": f"{query} {city}",
        "key": settings.dgis_api_key,
        "fields": "items.point,items.contact_groups,items.reviews,items.address_name",
        "page_size": min(max(limit, 1), 50),
        "page": 1,
    }

    leads: list[dict[str, Any]] = []
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(DGIS_CATALOG_URL, params=params) as resp:
                if resp.status != 200:
                    logger.error(
                        "2ГИС HTTP %s: %s", resp.status, (await resp.text())[:200]
                    )
                    return []
                data = await resp.json(content_type=None)
    except Exception as e:  # noqa: BLE001
        logger.exception("2ГИС: ошибка запроса: %s", e)
        return []

    items = (data.get("result") or {}).get("items") or []
    for it in items:
        phone = email = website = None
        for grp in it.get("contact_groups", []) or []:
            for c in grp.get("contacts", []) or []:
                ctype = c.get("type")
                value = c.get("value") or c.get("text")
                if ctype == "phone" and not phone:
                    phone = value
                elif ctype == "email" and not email:
                    email = value
                elif ctype in ("website", "url") and not website:
                    website = value

        reviews = it.get("reviews") or {}
        score = reviews.get("general_rating") or reviews.get("rating")
        review_count = reviews.get("general_review_count") or reviews.get(
            "review_count"
        )
        review_summary = None
        if score:
            review_summary = f"Рейтинг 2ГИС: {score}" + (
                f" ({review_count} отзывов)" if review_count else ""
            )

        point = point_from_dgis(it)

        leads.append(
            {
                "company_name": it.get("name"),
                "phone": phone,
                "email": email,
                "address": it.get("address_name"),
                "review_score": float(score) if score else None,
                "review_summary": review_summary,
                "source": "2gis",
                "source_ref": str(it.get("id")) if it.get("id") else None,
                "company_type": "restaurant",
                "latitude": point[0] if point else None,
                "longitude": point[1] if point else None,
                "geo_precision": "exact" if point else None,
            }
        )

    logger.info(
        "2ГИС: получено %d заведений по запросу '%s %s'", len(leads), query, city
    )
    return leads


# ─────────────────────────────────────────────────────────────────────
# Источник 1a: Google Places API (New / Text Search)
# ─────────────────────────────────────────────────────────────────────
async def collect_from_google_places(
    city: Optional[str] = None,
    query: str = "рестораны",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Ищет заведения через Google Places (легальный API)."""
    if not settings.google_places_api_key:
        logger.warning("Google: GOOGLE_PLACES_API_KEY не задан — сбор пропущен.")
        return []

    city = city or settings.lead_gen_city
    # Используем Text Search API
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "query": f"{query} {city}",
        "key": settings.google_places_api_key,
        "language": "ru",
    }

    leads: list[dict[str, Any]] = []
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, params=params) as resp:
                if resp.status != 200:
                    logger.error("Google HTTP %s", resp.status)
                    return []
                data = await resp.json()
    except Exception as e:
        logger.exception("Google: ошибка запроса: %s", e)
        return []

    # Text Search не возвращает телефон напрямую, для этого нужен Place Details,
    # но для базового лид-гена мы берём адреса, а телефон можно будет дотянуть потом,
    # либо если кто-то оставит заявку. Чтобы не тратить слишком много API кредитов,
    # сначала собираем базовые данные. Если сильно нужны телефоны сразу,
    # можно добавить вызов Place Details (но это стоит дороже).
    results = data.get("results") or []
    for it in results[:limit]:
        score = it.get("rating")
        review_count = it.get("user_ratings_total")
        review_summary = None
        if score:
            review_summary = f"Google Рейтинг: {score}" + (
                f" ({review_count} отзывов)" if review_count else ""
            )

        point = point_from_google(it)

        leads.append(
            {
                "company_name": it.get("name"),
                "phone": None,  # Требует Place Details, для экономии пока не запрашиваем в цикле
                "email": None,
                "address": it.get("formatted_address"),
                "review_score": float(score) if score else None,
                "review_summary": review_summary,
                "source": "google_places",
                "source_ref": str(it.get("place_id")),
                "company_type": "restaurant",
                "latitude": point[0] if point else None,
                "longitude": point[1] if point else None,
                "geo_precision": "exact" if point else None,
            }
        )

    logger.info("Google: получено %d заведений", len(leads))
    return leads


# ─────────────────────────────────────────────────────────────────────
# Источник 1b: Yandex Maps Search API
# ─────────────────────────────────────────────────────────────────────
async def collect_from_yandex_maps(
    city: Optional[str] = None,
    query: str = "ресторан",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Ищет заведения через Yandex Maps (Search API)."""
    if not getattr(settings, "yandex_maps_api_key", None):
        logger.warning("Yandex: YANDEX_MAPS_API_KEY не задан — сбор пропущен.")
        return []

    city = city or settings.lead_gen_city
    url = "https://search-maps.yandex.ru/v1/"
    params = {
        "text": f"{query} {city}",
        "type": "biz",
        "lang": "ru_RU",
        "results": min(max(limit, 1), 50),
        "apikey": settings.yandex_maps_api_key,
    }

    leads: list[dict[str, Any]] = []
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, params=params) as resp:
                if resp.status != 200:
                    logger.error(
                        "Yandex HTTP %s: %s", resp.status, (await resp.text())[:100]
                    )
                    return []
                data = await resp.json()
    except Exception as e:
        logger.exception("Yandex: ошибка запроса: %s", e)
        return []

    features = data.get("features") or []
    for it in features:
        props = it.get("properties", {}).get("CompanyMetaData", {})
        name = props.get("name")
        address = props.get("address")

        phone = None
        phones = props.get("Phones") or []
        if phones:
            phone = phones[0].get("formatted")

        url_website = props.get("url")
        point = point_from_yandex(it)

        leads.append(
            {
                "company_name": name,
                "phone": phone,
                "email": None,
                "address": address,
                "review_score": None,  # У Яндекса Search API рейтинги не отдаёт напрямую в CompanyMetaData
                "review_summary": f"Сайт: {url_website}" if url_website else None,
                "source": "yandex_maps",
                "source_ref": str(props.get("id")),
                "company_type": "restaurant",
                "latitude": point[0] if point else None,
                "longitude": point[1] if point else None,
                "geo_precision": "exact" if point else None,
            }
        )

    logger.info("Yandex: получено %d заведений", len(leads))
    return leads


# ─────────────────────────────────────────────────────────────────────
# Источник 2: ручной список / CSV
# ─────────────────────────────────────────────────────────────────────
def parse_manual_csv(path: str) -> list[dict[str, Any]]:
    """
    CSV с заголовками: company_name,phone,email,address,review_score,review_summary
    (обязателен только company_name). Возвращает нормализованные лиды.
    """
    leads: list[dict[str, Any]] = []
    with open(path, newline="", encoding="utf-8") as f:
        for i, row in enumerate(csv.DictReader(f)):
            name = (row.get("company_name") or "").strip()
            if not name:
                continue
            score = row.get("review_score")
            leads.append(
                {
                    "company_name": name,
                    "phone": (row.get("phone") or "").strip() or None,
                    "email": (row.get("email") or "").strip() or None,
                    "address": (row.get("address") or "").strip() or None,
                    "review_score": float(score) if score else None,
                    "review_summary": (row.get("review_summary") or "").strip() or None,
                    "source": "manual",
                    "source_ref": (
                        row.get("source_ref") or f"manual:{name}:{i}"
                    ).strip(),
                    "company_type": "restaurant",
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


async def import_leads(leads: list[dict[str, Any]]) -> dict[str, int]:
    """
    Вставляет лидов в customers, пропуская дубликаты.
    Дедуп по (source, source_ref), затем по phone, затем по названию.
    Возвращает {'inserted': N, 'skipped': M}.

    Сверка идёт по ВСЕЙ базе клиентов и по обоим названиям (`name` и
    `company_name`), а не только по b2b и `company_name`, как раньше: ресторан,
    заведённый менеджером при продаже, лежит с `customer_type='b2b'`, но
    названием в `name` — ночной сбор его не видел и заводил рядом второго.
    """
    inserted = skipped = 0
    async with get_session_ctx() as session:
        # In-memory индексы: пачка бывает в сотни лидов, и три селекта на
        # каждого превратили бы ночную задачу в тысячи запросов.
        res = await session.execute(
            text("SELECT source, source_ref, phone, name, company_name FROM customers")
        )
        existing_rows = res.fetchall()

        seen_refs = {
            (r.source, r.source_ref) for r in existing_rows if r.source and r.source_ref
        }
        seen_phones = {
            sanitize_phone(r.phone) for r in existing_rows if sanitize_phone(r.phone)
        }
        seen_names = {
            sanitize_name(value)
            for r in existing_rows
            for value in (r.name, r.company_name)
            if sanitize_name(value)
        }

        for lead in leads:
            name = lead.get("company_name")
            if not name:
                skipped += 1
                continue

            s_phone = sanitize_phone(lead.get("phone"))
            s_name = sanitize_name(name)
            s_ref = (lead.get("source"), lead.get("source_ref"))

            # Проверка дублей
            is_dup = False
            if s_ref[0] and s_ref[1] and s_ref in seen_refs:
                is_dup = True
            elif s_phone and s_phone in seen_phones:
                is_dup = True
            elif s_name and s_name in seen_names:
                is_dup = True

            if is_dup:
                skipped += 1
                continue

            # Добавляем в локальные индексы, чтобы не добавить дубли внутри одной пачки
            if s_ref[0] and s_ref[1]:
                seen_refs.add(s_ref)
            if s_phone:
                seen_phones.add(s_phone)
            if s_name:
                seen_names.add(s_name)

            # Координаты пишутся здесь же: `geocoded_at` заполняем только
            # когда точка есть, иначе пакетный геокодер решит, что клиента
            # уже обработали, и обойдёт его стороной.
            point = _valid_point(lead.get("latitude"), lead.get("longitude"))

            await session.execute(
                text(
                    "INSERT INTO customers "
                    "(name, company_name, phone, email, address, city, customer_type, "
                    " company_type, status, source, source_ref, review_score, review_summary, "
                    " latitude, longitude, geo_source, geo_precision, geo_address, geocoded_at, created_at) "
                    "VALUES (:name, :company, :phone, :email, :address, :city, 'b2b', "
                    " :ctype, 'lead', :source, :ref, :score, :summary, "
                    " :lat, :lon, :geo_source, :geo_precision, :geo_address, :geocoded_at, NOW())"
                ),
                {
                    "lat": point[0] if point else None,
                    "lon": point[1] if point else None,
                    "geo_source": lead.get("source") if point else None,
                    "geo_precision": lead.get("geo_precision") if point else None,
                    "geo_address": lead.get("address") if point else None,
                    "geocoded_at": datetime.now(timezone.utc) if point else None,
                    "name": name,
                    "company": name,
                    # Канон +998XXXXXXXXX. Раньше сюда ложилась сырая строка из
                    # 2ГИС, и по ней потом промахивался поиск клиента при продаже.
                    "phone": phone_utils.normalize(lead.get("phone")),
                    "email": lead.get("email"),
                    "address": lead.get("address"),
                    "city": settings.lead_gen_city,
                    "ctype": lead.get("company_type", "restaurant"),
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


async def collect_and_import_all(
    limit: Optional[int] = None, city: Optional[str] = None
) -> dict[str, int]:
    """Собирает лиды со ВСЕХ настроенных источников (2ГИС, Google, Yandex).

    `city` проброшен во все три сборщика: каждый из них его принимает, но
    сюда он не доходил, и «собери лидов по Ташкенту» всегда собирало по
    городу из настроек. Пусто — прежнее поведение (город по умолчанию).
    """
    limit = limit or settings.b2b_daily_limit * 3
    all_leads = []

    # 1. 2GIS
    l2 = await collect_from_2gis(limit=limit, city=city)
    if l2:
        all_leads.extend(l2)

    # 2. Google
    lg = await collect_from_google_places(limit=limit, city=city)
    if lg:
        all_leads.extend(lg)

    # 3. Yandex
    ly = await collect_from_yandex_maps(limit=limit, city=city)
    if ly:
        all_leads.extend(ly)

    if not all_leads:
        logger.warning(
            "Сбор лидов завершён, но ни один источник не дал результатов (или ключи не настроены)."
        )
        return {"inserted": 0, "skipped": 0}

    return await import_leads(all_leads)
