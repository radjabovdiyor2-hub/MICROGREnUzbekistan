"""
Синхронизация каталога: витрина → CRM.

Каталог-мастер — Prisma-таблица `products` (web). CRM-зеркало — `crm_products`
(sales_bot/CRM). Синк односторонний и идемпотентный: каждая CRM-строка
помечается `storefront_id` (cuid товара витрины).

С единой базой обе таблицы рядом — синк через SQL, без HTTP API.
"""

from __future__ import annotations

import logging

from sqlalchemy import text

from shared.database import get_session_ctx

logger = logging.getLogger(__name__)


async def sync_catalog_from_storefront() -> dict:
    """Зеркалить каталог web-витрины в CRM-таблицу crm_products.

    С единой базой оба каталога рядом — тянем данные прямым SQL вместо HTTP.
    """
    synced = 0
    async with get_session_ctx() as session:
        # Берём активные товары из витрины (Prisma products)
        res = await session.execute(
            text(
                "SELECT id, name_uz, name_ru, price, stock, category_id, is_active "
                "FROM products WHERE is_active = TRUE"
            )
        )
        web_products = res.fetchall()

        for p in web_products:
            sid = str(p[0])  # cuid
            name_uz = p[1] or "Tovar"
            name_ru = p[2] or "Товар"
            price = p[3] or 0
            stock = p[4] or 0

            # Категория витрины — cuid, маппим по имени
            category = "microgreens"
            if p[5]:
                cat_row = await session.execute(
                    text("SELECT slug FROM categories WHERE id = :cid"),
                    {"cid": p[5]},
                )
                cat = cat_row.scalar()
                if cat:
                    category = cat

            existing = (
                await session.execute(
                    text("SELECT id FROM crm_products WHERE storefront_id = :sid"),
                    {"sid": sid},
                )
            ).scalar()

            if existing:
                await session.execute(
                    text(
                        "UPDATE crm_products SET name_uz = :name_uz, name_ru = :name_ru, "
                        "price = :price, stock_qty = :stock, category = :category, is_active = TRUE "
                        "WHERE id = :id"
                    ),
                    {
                        "name_uz": name_uz,
                        "name_ru": name_ru,
                        "price": price,
                        "stock": stock,
                        "category": category,
                        "id": existing,
                    },
                )
            else:
                await session.execute(
                    text(
                        "INSERT INTO crm_products (name_uz, name_ru, category, price, unit, stock_qty, "
                        "is_active, storefront_id) VALUES (:name_uz, :name_ru, :category, :price, "
                        "'piece', :stock, TRUE, :sid)"
                    ),
                    {
                        "name_uz": name_uz,
                        "name_ru": name_ru,
                        "category": category,
                        "price": price,
                        "stock": stock,
                        "sid": sid,
                    },
                )
            synced += 1

        # Товар ушёл с витрины — гасим и зеркало.
        #
        # Синхронизация переносила только активные и НИКОГДА не трогала строки
        # исчезнувших товаров. Скрытый на витрине товар оставался живым в
        # crm_products навсегда, и офис продолжал его предлагать: прайс-лист
        # ботов, регистрация продажи, подбор для КП — всё читает зеркало.
        # Уберёшь оборудование с сайта — Стёпан всё равно его продаёт.
        deactivated = (
            await session.execute(
                text(
                    "UPDATE crm_products SET is_active = FALSE "
                    "WHERE storefront_id IS NOT NULL AND is_active = TRUE "
                    "AND storefront_id NOT IN "
                    "(SELECT id FROM products WHERE is_active = TRUE) "
                    "RETURNING id"
                )
            )
        ).fetchall()
        await session.commit()

    if deactivated:
        logger.info("Catalog sync: погашено в зеркале (нет на витрине): %s", len(deactivated))
    logger.info("Catalog sync: витрина → CRM, товаров обработано: %s", synced)
    return {
        "synced": synced,
        "total": len(web_products),
        "deactivated": len(deactivated),
    }


async def ensure_schema() -> None:
    """Публичный вызов на старте: гарантировать колонку storefront_id.

    С Prisma-управляемой схемой колонка уже существует (CrmProduct.storefrontId).
    Метод оставлен для обратной совместимости — no-op.
    """
    pass
