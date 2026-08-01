import csv
import logging
import re
from typing import dict, Optional
from sqlalchemy import text
from shared.config import settings
from shared.database import get_session_ctx
from shared.lead_gen.fetchers import collect_from_2gis, collect_from_google_places, collect_from_yandex_maps

logger = logging.getLogger(__name__)

def parse_manual_csv(path: str) -> list[dict[str]]:
    leads: list[dict[str]] = []
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
                    "source_ref": (row.get("source_ref") or f"manual:{name}:{i}").strip(),
                    "company_type": "restaurant",
                }
            )
    logger.info("Ручной импорт: разобрано %d строк из %s", len(leads), path)
    return leads

def sanitize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    return digits[-9:] if len(digits) >= 9 else digits

def sanitize_name(name: str | None) -> str | None:
    if not name:
        return None
    return re.sub(r"[\s\.,'\"\-«»]", "", name.lower())

async def import_leads(leads: list[dict[str]]) -> dict[str, int]:
    inserted = skipped = 0
    async with get_session_ctx() as session:
        res = await session.execute(
            text("SELECT id, source, source_ref, phone, company_name FROM customers WHERE customer_type = 'b2b'")
        )
        existing_rows = res.fetchall()

        seen_refs = {(r.source, r.source_ref) for r in existing_rows if r.source and r.source_ref}
        seen_phones = {sanitize_phone(r.phone) for r in existing_rows if sanitize_phone(r.phone)}
        seen_names = {sanitize_name(r.company_name) for r in existing_rows if sanitize_name(r.company_name)}

        for lead in leads:
            name = lead.get("company_name")
            if not name:
                skipped += 1
                continue

            s_phone = sanitize_phone(lead.get("phone"))
            s_name = sanitize_name(name)
            s_ref = (lead.get("source"), lead.get("source_ref"))

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

            if s_ref[0] and s_ref[1]:
                seen_refs.add(s_ref)
            if s_phone:
                seen_phones.add(s_phone)
            if s_name:
                seen_names.add(s_name)

            await session.execute(
                text(
                    "INSERT INTO customers "
                    "(name, company_name, phone, email, address, city, customer_type, "
                    " company_type, status, source, source_ref, review_score, review_summary, created_at) "
                    "VALUES (:name, :company, :phone, :email, :address, :city, 'b2b', "
                    " :ctype, 'lead', :source, :ref, :score, :summary, NOW())"
                ),
                {
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
                },
            )
            inserted += 1

        if inserted > 0:
            await session.commit()

    logger.info("Импорт лидов: +%d новых, %d пропущено (дубли)", inserted, skipped)
    return {"inserted": inserted, "skipped": skipped}

async def collect_and_import_all(limit: Optional[int] = None) -> dict[str, int]:
    limit = limit or settings.b2b_daily_limit * 3
    all_leads = []

    l2 = await collect_from_2gis(limit=limit)
    if l2:
        all_leads.extend(l2)

    lg = await collect_from_google_places(limit=limit)
    if lg:
        all_leads.extend(lg)

    ly = await collect_from_yandex_maps(limit=limit)
    if ly:
        all_leads.extend(ly)

    if not all_leads:
        logger.warning("Сбор лидов завершён, но ни один источник не дал результатов (или ключи не настроены).")
        return {"inserted": 0, "skipped": 0}

    return await import_leads(all_leads)
