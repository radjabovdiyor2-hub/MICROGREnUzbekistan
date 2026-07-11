"""
Синхронизация каталога: витрина → офис.

Каталог-мастер живёт на витрине (`microgreen_db.products`, Prisma) — там картинки,
категории, отзывы, POS. Офис (`microgreen.products`) — зеркало для sales_bot/CRM и
для полноценных `order_items` по заказам из приложения.

Синк односторонний и идемпотентный: каждая офисная строка помечается
`storefront_id` (cuid товара витрины). Повторный синк обновляет те же строки,
нативные офисные товары (`storefront_id IS NULL`) не трогаются.
"""
from __future__ import annotations

import logging
import os

import aiohttp
from sqlalchemy import text

from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

STOREFRONT_API_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")

# Категории витрины — подмножество CHECK-констрейнта products.category. Всё, что
# не совпало, кладём в нейтральный 'sets', чтобы не упереться в констрейнт.
_ALLOWED_CATEGORY = {
    "microgreens", "baby-leaf", "salads", "flowers",
    "seeds", "substrate", "equipment", "sets",
}


async def _ensure_schema(session) -> None:
    """Гарантируем колонку storefront_id (для уже развёрнутых БД без миграции)."""
    await session.execute(text(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS storefront_id VARCHAR(64)"
    ))
    await session.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_products_storefront_id "
        "ON products(storefront_id) WHERE storefront_id IS NOT NULL"
    ))


async def ensure_schema() -> None:
    """Публичный вызов на старте: гарантировать колонку до приёма заказов.

    Иначе `/ingest/order` может обратиться к products.storefront_id раньше первого
    синка и откатить транзакцию заказа на уже развёрнутой БД.
    """
    async with get_session_ctx() as session:
        await _ensure_schema(session)


async def _fetch_storefront_products() -> list[dict]:
    headers = {"Authorization": f"Bearer {BOT_SECRET}"} if BOT_SECRET else {}
    url = f"{STOREFRONT_API_URL.rstrip('/')}/products/export"
    async with aiohttp.ClientSession() as s:
        async with s.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                raise RuntimeError(f"storefront export HTTP {resp.status}")
            data = await resp.json()
    return data.get("products", []) if isinstance(data, dict) else []


async def sync_catalog_from_storefront() -> dict:
    """Затянуть каталог витрины и зеркалить в офис. Возвращает счётчики."""
    products = await _fetch_storefront_products()
    synced = 0
    async with get_session_ctx() as session:
        await _ensure_schema(session)
        for p in products:
            sid = str(p.get("id") or "").strip()
            if not sid:
                continue
            category = p.get("categorySlug") or ""
            if category not in _ALLOWED_CATEGORY:
                category = "sets"
            # Убедимся, что price и stock числа
            try:
                price = float(p.get("price") or 0)
            except (ValueError, TypeError):
                price = 0.0

            try:
                stock = int(p.get("stock") or 0)
            except (ValueError, TypeError):
                stock = 0

            params = {
                "sid": sid,
                "name_uz": str(p.get("nameUz") or "").strip() or "Tovar",
                "name_ru": str(p.get("nameRu") or "").strip() or "Товар",
                "price": price,
                "stock": stock,
                "category": category,
            }
            existing = (await session.execute(
                text("SELECT id FROM products WHERE storefront_id = :sid"), {"sid": sid},
            )).scalar()
            if existing:
                await session.execute(text(
                    "UPDATE products SET name_uz = :name_uz, name_ru = :name_ru, "
                    "price = :price, stock_qty = :stock, category = :category, is_active = TRUE "
                    "WHERE id = :id"
                ), {**params, "id": existing})
            else:
                await session.execute(text(
                    "INSERT INTO products (name_uz, name_ru, category, price, unit, stock_qty, "
                    "is_active, storefront_id) VALUES (:name_uz, :name_ru, :category, :price, "
                    "'piece', :stock, TRUE, :sid)"
                ), params)
            synced += 1
    logger.info("Catalog sync: витрина → офис, товаров обработано: %s", synced)
    return {"synced": synced, "total": len(products)}
