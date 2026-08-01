import logging
from typing import Dict
from sqlalchemy import String, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY

from shared.database import get_session_ctx
from shared.text_match import query_variants
from shared.utils import format_price
from shared.catalog_ops.core import ALLOWED_CATEGORY, ALLOWED_UNIT
from shared.catalog_ops.storefront import _create_on_storefront

logger = logging.getLogger(__name__)

async def add_product(params: Dict[str, object]) -> Dict[str, object]:
    name = str(params.get("name") or "").strip()
    price = params.get("price")
    if not name:
        return {
            "status": "clarify",
            "message": "Как называется товар, который добавляем?",
        }
    try:
        price = (
            float(str(price).replace(" ", "").replace(",", "."))
            if price is not None
            else None
        )
    except (TypeError, ValueError):
        price = None
    if not price or price <= 0:
        return {
            "status": "clarify",
            "message": f"По какой цене продаём «{name}»? Без цены в каталог не добавлю.",
        }

    unit = str(params.get("unit") or "piece").lower()
    if unit not in ALLOWED_UNIT:
        unit = "piece"
    category = str(params.get("category") or "microgreens").lower()
    if category not in ALLOWED_CATEGORY:
        category = "sets"
    try:
        stock = float(params.get("stock") or 0)
    except (TypeError, ValueError):
        stock = 0.0

    try:
        async with get_session_ctx() as session:
            patterns = [f"%{v}%" for v in query_variants(name)] or [f"%{name}%"]
            existing = (
                await session.execute(
                    text(
                        "SELECT id, name_ru FROM products "
                        "WHERE name_ru ILIKE ANY(:pats) OR name_uz ILIKE ANY(:pats) LIMIT 1"
                    ).bindparams(
                        bindparam("pats", value=patterns, type_=ARRAY(String))
                    ),
                )
            ).fetchone()
            if existing:
                return {
                    "status": "exists",
                    "message": f"«{existing[1]}» уже есть в каталоге — повторно не добавляю.",
                    "data": {"product_id": existing[0], "name": existing[1]},
                }

        description_ru = str(params.get("description_ru") or "").strip()
        description_uz = str(params.get("description_uz") or "").strip()
        image_url = str(params.get("image_url") or "").strip() or None

        storefront_id = await _create_on_storefront(
            name, price, category, stock, description_ru, description_uz, image_url
        )

        async with get_session_ctx() as session:
            product_id = (
                await session.execute(
                    text(
                        "INSERT INTO products (name_uz, name_ru, category, price, unit, stock_qty, "
                        "is_active, storefront_id, description_ru, description_uz, image_url) "
                        "VALUES (:n, :n, :cat, :price, :unit, :stock, true, :sid, :dru, :duz, :img) "
                        "RETURNING id"
                    ),
                    {
                        "n": name,
                        "cat": category,
                        "price": price,
                        "unit": unit,
                        "stock": stock,
                        "sid": storefront_id,
                        "dru": description_ru or None,
                        "duz": description_uz or None,
                        "img": image_url,
                    },
                )
            ).scalar()
            await session.commit()
    except Exception as exc:
        logger.exception("CATALOG_OPS: не смог добавить товар «%s»: %s", name, exc)
        return {
            "status": "error",
            "message": f"Не смог добавить товар в каталог: {exc}",
        }

    logger.info(
        "CATALOG_OPS: товар «%s» добавлен (office #%s, storefront %s)",
        name,
        product_id,
        storefront_id or "—",
    )

    if storefront_id:
        message = (
            f"✅ Товар «{name}» добавлен: {format_price(price)} / {unit}.\n"
            f"Он есть и в магазине, и в CRM."
        )
    else:
        message = (
            f"✅ Товар «{name}» добавлен в CRM: {format_price(price)} / {unit}.\n"
            f"⚠️ В магазин витрины не попал (сайт не ответил) — добавьте там вручную "
            f"или повторите позже."
        )

    return {
        "status": "ok",
        "message": message,
        "data": {
            "product_id": product_id,
            "storefront_id": storefront_id,
            "name": name,
            "price": price,
            "unit": unit,
            "category": category,
            "in_storefront": bool(storefront_id),
        },
    }
