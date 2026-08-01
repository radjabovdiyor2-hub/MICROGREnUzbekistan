import logging
from typing import dict, Optional
import aiohttp
from shared.config import settings
from shared.lead_gen.core import DGIS_CATALOG_URL

logger = logging.getLogger(__name__)

async def collect_from_2gis(
    city: Optional[str] = None,
    query: str = "рестораны",
    limit: int = 50,
) -> list[dict[str]]:
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

    leads: list[dict[str]] = []
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(DGIS_CATALOG_URL, params=params) as resp:
                if resp.status != 200:
                    logger.error("2ГИС HTTP %s: %s", resp.status, (await resp.text())[:200])
                    return []
                data = await resp.json(content_type=None)
    except Exception as e:
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
        review_count = reviews.get("general_review_count") or reviews.get("review_count")
        review_summary = None
        if score:
            review_summary = f"Рейтинг 2ГИС: {score}" + (
                f" ({review_count} отзывов)" if review_count else ""
            )

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
            }
        )

    logger.info("2ГИС: получено %d заведений по запросу '%s %s'", len(leads), query, city)
    return leads

async def collect_from_google_places(
    city: Optional[str] = None,
    query: str = "рестораны",
    limit: int = 50,
) -> list[dict[str]]:
    if not settings.google_places_api_key:
        logger.warning("Google: GOOGLE_PLACES_API_KEY не задан — сбор пропущен.")
        return []

    city = city or settings.lead_gen_city
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "query": f"{query} {city}",
        "key": settings.google_places_api_key,
        "language": "ru",
    }

    leads: list[dict[str]] = []
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

    results = data.get("results") or []
    for it in results[:limit]:
        score = it.get("rating")
        review_count = it.get("user_ratings_total")
        review_summary = None
        if score:
            review_summary = f"Google Рейтинг: {score}" + (
                f" ({review_count} отзывов)" if review_count else ""
            )

        leads.append(
            {
                "company_name": it.get("name"),
                "phone": None,
                "email": None,
                "address": it.get("formatted_address"),
                "review_score": float(score) if score else None,
                "review_summary": review_summary,
                "source": "google_places",
                "source_ref": str(it.get("place_id")),
                "company_type": "restaurant",
            }
        )

    logger.info("Google: получено %d заведений", len(leads))
    return leads

async def collect_from_yandex_maps(
    city: Optional[str] = None,
    query: str = "ресторан",
    limit: int = 50,
) -> list[dict[str]]:
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

    leads: list[dict[str]] = []
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, params=params) as resp:
                if resp.status != 200:
                    logger.error("Yandex HTTP %s: %s", resp.status, (await resp.text())[:100])
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

        leads.append(
            {
                "company_name": name,
                "phone": phone,
                "email": None,
                "address": address,
                "review_score": None,
                "review_summary": f"Сайт: {url_website}" if url_website else None,
                "source": "yandex_maps",
                "source_ref": str(props.get("id")),
                "company_type": "restaurant",
            }
        )

    logger.info("Yandex: получено %d заведений", len(leads))
    return leads
