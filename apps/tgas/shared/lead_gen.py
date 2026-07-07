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
      "source", "source_ref", "company_type"
    }
"""

from __future__ import annotations

import csv
import logging
from typing import Any, Optional

import aiohttp
from sqlalchemy import text

from shared.config import settings
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

DGIS_CATALOG_URL = "https://catalog.api.2gis.com/3.0/items"


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
                    logger.error("2ГИС HTTP %s: %s", resp.status, (await resp.text())[:200])
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
        review_count = reviews.get("general_review_count") or reviews.get("review_count")
        review_summary = None
        if score:
            review_summary = f"Рейтинг 2ГИС: {score}" + (
                f" ({review_count} отзывов)" if review_count else ""
            )

        leads.append({
            "company_name": it.get("name"),
            "phone": phone,
            "email": email,
            "address": it.get("address_name"),
            "review_score": float(score) if score else None,
            "review_summary": review_summary,
            "source": "2gis",
            "source_ref": str(it.get("id")) if it.get("id") else None,
            "company_type": "restaurant",
        })

    logger.info("2ГИС: получено %d заведений по запросу '%s %s'", len(leads), query, city)
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
            leads.append({
                "company_name": name,
                "phone": (row.get("phone") or "").strip() or None,
                "email": (row.get("email") or "").strip() or None,
                "address": (row.get("address") or "").strip() or None,
                "review_score": float(score) if score else None,
                "review_summary": (row.get("review_summary") or "").strip() or None,
                "source": "manual",
                "source_ref": (row.get("source_ref") or f"manual:{name}:{i}").strip(),
                "company_type": "restaurant",
            })
    logger.info("Ручной импорт: разобрано %d строк из %s", len(leads), path)
    return leads


# ─────────────────────────────────────────────────────────────────────
# Запись в БД с дедупликацией
# ─────────────────────────────────────────────────────────────────────
async def import_leads(leads: list[dict[str, Any]]) -> dict[str, int]:
    """
    Вставляет лидов в customers, пропуская дубликаты.
    Дедуп по (source, source_ref), затем по phone, затем по company_name+city.
    Возвращает {'inserted': N, 'skipped': M}.
    """
    inserted = skipped = 0
    async with get_session_ctx() as session:
        for lead in leads:
            name = lead.get("company_name")
            if not name:
                skipped += 1
                continue

            # 1) дедуп по внешнему источнику
            exists = None
            if lead.get("source_ref"):
                exists = (await session.execute(text(
                    "SELECT id FROM customers WHERE source = :src AND source_ref = :ref LIMIT 1"
                ), {"src": lead["source"], "ref": lead["source_ref"]})).scalar()
            # 2) дедуп по телефону
            if not exists and lead.get("phone"):
                exists = (await session.execute(text(
                    "SELECT id FROM customers WHERE phone = :ph LIMIT 1"
                ), {"ph": lead["phone"]})).scalar()
            # 3) дедуп по названию+городе
            if not exists:
                exists = (await session.execute(text(
                    "SELECT id FROM customers WHERE lower(company_name) = lower(:nm) "
                    "AND customer_type = 'b2b' LIMIT 1"
                ), {"nm": name})).scalar()

            if exists:
                skipped += 1
                continue

            await session.execute(text(
                "INSERT INTO customers "
                "(name, company_name, phone, email, address, city, customer_type, "
                " company_type, status, source, source_ref, review_score, review_summary, created_at) "
                "VALUES (:name, :company, :phone, :email, :address, :city, 'b2b', "
                " :ctype, 'lead', :source, :ref, :score, :summary, NOW())"
            ), {
                "name": name,
                "company": name,
                "phone": lead.get("phone"),
                "email": lead.get("email"),
                "address": lead.get("address"),
                "city": settings.lead_gen_city,
                "ctype": lead.get("company_type", "restaurant"),
                "source": lead.get("source", "manual"),
                "ref": lead.get("source_ref"),
                "score": lead.get("review_score"),
                "summary": lead.get("review_summary"),
            })
            inserted += 1
        await session.commit()

    logger.info("Импорт лидов: +%d новых, %d пропущено (дубли)", inserted, skipped)
    return {"inserted": inserted, "skipped": skipped}


async def collect_and_import_2gis(limit: Optional[int] = None) -> dict[str, int]:
    """Удобная обёртка: собрать из 2ГИС и сразу записать. Для ночной задачи."""
    limit = limit or settings.b2b_daily_limit * 3  # запас, т.к. часть отсеется дедупом
    leads = await collect_from_2gis(limit=limit)
    if not leads:
        return {"inserted": 0, "skipped": 0}
    return await import_leads(leads)
