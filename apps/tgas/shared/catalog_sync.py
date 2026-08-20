"""
Синхронизация каталога: витрина → CRM.

Каталог-мастер — Prisma-таблица `products` (web). CRM-зеркало — `crm_products`
(sales_bot/CRM). Синк односторонний и идемпотентный: каждая CRM-строка
помечается `storefront_id` (cuid товара витрины).

С единой базой обе таблицы рядом — синк через SQL, без HTTP API.

ПОЧЕМУ ЗДЕСЬ НЕТ ЦИКЛА ПО ТОВАРАМ

Был. На каждый товар уходило до трёх round-trip'ов: выбрать slug категории,
найти зеркальную строку по storefront_id, обновить или вставить. При сотне
позиций это три сотни последовательных запросов внутри одной длинной
транзакции — и всё это в петле, которую владелец дёргает кнопкой «Пульт ИИ»
и потом ждёт.

Теперь тем же занимаются три запроса, и все они множественные: обновить
существующие, вставить новые, погасить исчезнувшие. Соединение с категорией
делает сама база (`LEFT JOIN categories`), а не Python.

ПОЧЕМУ ВЫБОРКА-ИСТОЧНИК ВЫПИСАНА ДВАЖДЫ, А НЕ ВЫНЕСЕНА В КОНСТАНТУ

Потому что `scripts/check_schema.py` сверяет весь сырой SQL со `schema.prisma`,
а читать он умеет только строковые литералы внутри `text(...)`. Стоит собрать
запрос f-строкой из общего куска — и сверка увидит `WITH src AS ()` с пустыми
скобками: сам SELECT для неё исчезнет вместе с именами таблиц и колонок.
Именно эта проверка когда-то поймала `SELECT unit FROM products` (в витринной
таблице такой колонки нет), из-за чего прайс-лист приходил пустым. Платить
за краткость слепотой guard'а не стоит: повторяются десять строк, а
проверяется — вся схема.
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
    async with get_session_ctx() as session:
        # 1. Обновить то, что уже есть в зеркале.
        #
        # `unit` приезжает с витрины: здесь стояло жёсткое 'piece', и зеркало
        # объявляло штуками даже то, что продаётся за килограмм. Обрезка до 20
        # символов — под `crm_products.unit VARCHAR(20)`.
        #
        # Категория витрины — cuid, в зеркале это slug. Товар без категории
        # попадает в 'microgreens': так было и раньше.
        updated = (
            await session.execute(
                text(
                    """
                    WITH src AS (
                        SELECT p.id AS sid,
                               COALESCE(NULLIF(p.name_uz, ''), 'Tovar') AS name_uz,
                               COALESCE(NULLIF(p.name_ru, ''), 'Товар') AS name_ru,
                               COALESCE(c.slug, 'microgreens') AS category,
                               COALESCE(p.price, 0) AS price,
                               LEFT(COALESCE(NULLIF(p.unit, ''), 'шт'), 20) AS unit,
                               COALESCE(p.stock, 0) AS stock
                          FROM products p
                          LEFT JOIN categories c ON c.id = p.category_id
                         WHERE p.is_active = TRUE
                    )
                    UPDATE crm_products m
                       SET name_uz   = src.name_uz,
                           name_ru   = src.name_ru,
                           price     = src.price,
                           stock_qty = src.stock,
                           category  = src.category,
                           unit      = src.unit,
                           is_active = TRUE
                      FROM src
                     WHERE m.storefront_id = src.sid
                    RETURNING m.id
                    """
                )
            )
        ).fetchall()

        # 2. Завести то, чего в зеркале ещё нет.
        #
        # `LEFT JOIN ... IS NULL`, а не `ON CONFLICT`: у `crm_products.storefront_id`
        # нет уникального индекса, и вешать его задним числом на прод, где дубли
        # уже могли накопиться, значило бы уронить выкатку на создании индекса.
        inserted = (
            await session.execute(
                text(
                    """
                    WITH src AS (
                        SELECT p.id AS sid,
                               COALESCE(NULLIF(p.name_uz, ''), 'Tovar') AS name_uz,
                               COALESCE(NULLIF(p.name_ru, ''), 'Товар') AS name_ru,
                               COALESCE(c.slug, 'microgreens') AS category,
                               COALESCE(p.price, 0) AS price,
                               LEFT(COALESCE(NULLIF(p.unit, ''), 'шт'), 20) AS unit,
                               COALESCE(p.stock, 0) AS stock
                          FROM products p
                          LEFT JOIN categories c ON c.id = p.category_id
                         WHERE p.is_active = TRUE
                    )
                    INSERT INTO crm_products
                        (name_uz, name_ru, category, price, unit, stock_qty, is_active, storefront_id)
                    SELECT src.name_uz, src.name_ru, src.category, src.price,
                           src.unit, src.stock, TRUE, src.sid
                      FROM src
                      LEFT JOIN crm_products m ON m.storefront_id = src.sid
                     WHERE m.id IS NULL
                    RETURNING id
                    """
                )
            )
        ).fetchall()

        # 3. Товар ушёл с витрины — гасим и зеркало.
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

    synced = len(updated) + len(inserted)
    if deactivated:
        logger.info("Catalog sync: погашено в зеркале (нет на витрине): %s", len(deactivated))
    logger.info(
        "Catalog sync: витрина → CRM, обновлено %s, заведено %s", len(updated), len(inserted)
    )
    return {
        "synced": synced,
        "total": synced,
        "deactivated": len(deactivated),
    }


async def ensure_schema() -> None:
    """Публичный вызов на старте: гарантировать колонку storefront_id.

    С Prisma-управляемой схемой колонка уже существует (CrmProduct.storefrontId).
    Метод оставлен для обратной совместимости — no-op.
    """
    pass
