import logging
import re
from typing import Dict, List, Optional
from sqlalchemy import String, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY

from shared.text_match import query_variants
from shared.sales_ops.core import FUZZY_THRESHOLD, _to_float

logger = logging.getLogger(__name__)

async def _find_products(session, query: Optional[str]) -> List[Dict[str]]:
    variants = query_variants(query or "")
    if not variants:
        return []

    patterns = [f"%{v}%" for v in variants]
    res = await session.execute(
        text(
            "SELECT id, name_ru, price, unit FROM products "
            "WHERE is_active = true "
            "AND (name_ru ILIKE ANY(:pats) OR name_uz ILIKE ANY(:pats)) "
            "ORDER BY sort_order, id LIMIT 10"
        ).bindparams(bindparam("pats", value=patterns, type_=ARRAY(String))),
    )
    rows = res.fetchall()

    words = [w for w in re.split(r"\s+", str(query).strip()) if len(w) >= 3]
    if not rows and len(words) > 1:
        conditions, params = [], {}
        for idx, word in enumerate(words):
            word_patterns = [f"%{v}%" for v in query_variants(word)]
            if not word_patterns:
                continue
            key = f"w{idx}"
            conditions.append(f"(name_ru ILIKE ANY(:{key}) OR name_uz ILIKE ANY(:{key}))")
            params[key] = word_patterns
        if conditions:
            stmt = text(
                "SELECT id, name_ru, price, unit FROM products "
                "WHERE is_active = true AND "
                + " AND ".join(conditions)
                + " ORDER BY sort_order, id LIMIT 10"
            ).bindparams(*[bindparam(key, value=value, type_=ARRAY(String)) for key, value in params.items()])
            rows = (await session.execute(stmt)).fetchall()

    if not rows:
        try:
            res = await session.execute(
                text(
                    "SELECT id, name_ru, price, unit, "
                    "  (SELECT MAX(GREATEST(word_similarity(v, lower(p.name_ru)), "
                    "                       word_similarity(v, lower(p.name_uz)))) "
                    "   FROM unnest(:vars) AS v) AS sim "
                    "FROM products p "
                    "WHERE is_active = true "
                    "ORDER BY sim DESC NULLS LAST LIMIT 5"
                ).bindparams(bindparam("vars", value=variants, type_=ARRAY(String))),
            )
            rows = [r for r in res.fetchall() if (r[4] or 0) >= FUZZY_THRESHOLD]
        except Exception as exc:
            logger.warning("SALES_OPS: нечёткий поиск недоступен (%s)", exc)
            rows = []

    return [{"id": r[0], "name": r[1], "price": float(r[2]), "unit": r[3]} for r in rows]

def _normalize_items(params: Dict[str]) -> List[Dict[str]]:
    raw = params.get("items")
    if not raw:
        raw = [
            {
                "product": params.get("product"),
                "quantity": params.get("quantity"),
                "unit_price": params.get("unit_price"),
            }
        ]
    items = []
    for entry in raw:
        if not isinstance(entry):
            continue
        items.append(
            {
                "product_id": entry.get("product_id"),
                "product": str(entry.get("product") or "").strip() or None,
                "quantity": _to_float(entry.get("quantity")) or 1.0,
                "unit_price": _to_float(entry.get("unit_price")),
            }
        )
    return items

async def _product_by_id(session, product_id: int) -> Optional[Dict[str]]:
    row = (
        await session.execute(
            text("SELECT id, name_ru, price, unit FROM products WHERE id = :pid"),
            {"pid": int(product_id)},
        )
    ).fetchone()
    if not row:
        return None
    return {"id": row[0], "name": row[1], "price": float(row[2]), "unit": row[3]}

async def _resolve_items(session, items: List[Dict[str]]) -> Dict[str]:
    resolved: List[Dict[str]] = []
    ambiguous: List[Dict[str]] = []
    missing: List[Dict[str]] = []

    for index, item in enumerate(items):
        product: Optional[Dict[str]] = None

        if item.get("product_id"):
            product = await _product_by_id(session, item["product_id"])

        if not product:
            name = item["product"]
            if not name:
                missing.append(
                    {
                        "index": index,
                        "name": None,
                        "quantity": item["quantity"],
                        "unit_price": item["unit_price"],
                    }
                )
                continue

            matches = await _find_products(session, name)
            exact = [m for m in matches if m["name"].strip().lower() == name.strip().lower()]

            if exact:
                product = exact[0]
            elif len(matches) == 1:
                product = matches[0]
            elif len(matches) > 1:
                ambiguous.append({"index": index, "query": name, "candidates": matches})
                continue
            else:
                missing.append(
                    {
                        "index": index,
                        "name": name,
                        "quantity": item["quantity"],
                        "unit_price": item["unit_price"],
                    }
                )
                continue

        unit_price = item["unit_price"] if item["unit_price"] is not None else product["price"]
        resolved.append(
            {
                "product_id": product["id"],
                "name": product["name"],
                "unit": product["unit"] or "piece",
                "quantity": item["quantity"],
                "unit_price": unit_price,
                "total_price": unit_price * item["quantity"],
            }
        )

    if ambiguous or missing:
        return {"ambiguous": ambiguous, "missing": missing}
    return {"resolved": resolved}
