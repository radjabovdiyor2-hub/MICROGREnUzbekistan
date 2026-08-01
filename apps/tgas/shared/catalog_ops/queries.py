from typing import Optional, Dict
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.catalog_ops.core import CATEGORY_TITLES

async def list_categories() -> list[dict]:
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT category, COUNT(*) FROM products WHERE is_active = true "
                    "GROUP BY category ORDER BY COUNT(*) DESC"
                )
            )
        ).fetchall()
    return [
        {"slug": r[0], "title": CATEGORY_TITLES.get(r[0], r[0]), "count": r[1]}
        for r in rows
    ]

async def list_products(
    category: Optional[str], page: int = 0, per_page: int = 8
) -> dict:
    where = "is_active = true" + (" AND category = :cat" if category else "")
    params: Dict[str, object] = {"limit": per_page, "offset": page * per_page}
    if category:
        params["cat"] = category

    async with get_session_ctx() as session:
        total = (
            await session.execute(
                text(f"SELECT COUNT(*) FROM products WHERE {where}"),
                {k: v for k, v in params.items() if k == "cat"},
            )
        ).scalar() or 0
        rows = (
            await session.execute(
                text(
                    f"SELECT id, name_ru, price, unit FROM products WHERE {where} "
                    "ORDER BY sort_order, id LIMIT :limit OFFSET :offset"
                ),
                params,
            )
        ).fetchall()

    pages = max(1, (total + per_page - 1) // per_page)
    return {
        "items": [
            {"id": r[0], "name": r[1], "price": float(r[2]), "unit": r[3]} for r in rows
        ],
        "page": page,
        "pages": pages,
        "total": total,
    }
