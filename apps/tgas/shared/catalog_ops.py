"""
🛒 CATALOG OPS — добавление товара в каталог «везде»
=====================================================
База одна, но каталог в ней двухслойный: мастер — витринная таблица `products`
(Prisma, cuid-ключи), зеркало — офисная `crm_products` (см. shared/catalog_sync.py).
Поэтому новый товар заводится СНАЧАЛА на витрине через её API, а офисная строка
привязывается к нему через `storefront_id` — тогда товар виден и в магазине, и в
CRM, и в позициях офисных заказов.

Читать каталог отсюда не надо: чтение живёт в shared/catalog_repo.py, здесь
только запись. Раньше запись шла в `products` офисными колонками
(`unit`, `stock_qty`, `storefront_id`) — после переименования таблиц это
таблица витрины, и добавление товара падало.

Вызывается только по явному одобрению руководителя (Степан спрашивает, прежде
чем добавлять).
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from typing import Any, Dict, Optional

import aiohttp
from sqlalchemy import text

from shared import catalog_repo
from shared.database import get_session_ctx
from shared.utils import format_price

logger = logging.getLogger(__name__)

STOREFRONT_API_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")

ALLOWED_CATEGORY = {
    "microgreens",
    "baby-leaf",
    "salads",
    "flowers",
    "seeds",
    "substrate",
    "equipment",
    "sets",
}
ALLOWED_UNIT = {"kg", "g", "piece", "pack", "set"}

_TRANSLIT = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "sch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}


def slugify(name: str) -> str:
    """«Микрозелень Санго» → microzelen-sango-a1b2 (уникальный slug для витрины)."""
    lowered = str(name).strip().lower()
    latin = "".join(_TRANSLIT.get(ch, ch) for ch in lowered)
    slug = re.sub(r"[^a-z0-9]+", "-", latin).strip("-") or "tovar"
    return f"{slug[:40]}-{uuid.uuid4().hex[:4]}"


def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {BOT_SECRET}"} if BOT_SECRET else {}


async def _storefront_category_id(
    session: aiohttp.ClientSession, category: str
) -> Optional[str]:
    """ID категории витрины по slug. Нет совпадения — берём первую доступную."""
    url = f"{STOREFRONT_API_URL.rstrip('/')}/categories"
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
        if resp.status != 200:
            logger.warning(
                "CATALOG_OPS: категории витрины недоступны (HTTP %s)", resp.status
            )
            return None
        payload = await resp.json()

    flat: list[dict] = []
    for parent in payload.get("categories", []):
        flat.append(parent)
        flat.extend(parent.get("children", []) or [])
    if not flat:
        return None

    for cat in flat:
        if str(cat.get("slug", "")).lower() == category.lower():
            return cat.get("id")
    # Точной категории нет — не выдумываем структуру, кладём в первую (обычно «Каталог»)
    return flat[0].get("id")


async def upload_image(file_bytes: bytes, filename: str) -> Optional[str]:
    """
    Залить фото товара на витрину (POST /api/upload) → путь вида /uploads/xxx.jpg.

    Фото присылает руководитель в Telegram; карточка без картинки в магазине
    выглядит пустой, поэтому грузим в то же хранилище, что и админка сайта.
    """
    try:
        form = aiohttp.FormData()
        form.add_field("file", file_bytes, filename=filename, content_type="image/jpeg")
        url = f"{STOREFRONT_API_URL.rstrip('/')}/upload"
        async with aiohttp.ClientSession(headers=_headers()) as session:
            async with session.post(
                url, data=form, timeout=aiohttp.ClientTimeout(total=60)
            ) as resp:
                if resp.status != 200:
                    logger.warning(
                        "CATALOG_OPS: загрузка фото отклонена (HTTP %s): %s",
                        resp.status,
                        (await resp.text())[:200],
                    )
                    return None
                data = await resp.json()
                return data.get("url")
    except Exception as exc:
        logger.warning("CATALOG_OPS: не смог загрузить фото: %s", exc)
        return None


async def _create_on_storefront(
    name: str,
    price: float,
    category: str,
    stock: float,
    description_ru: str = "",
    description_uz: str = "",
    image_url: Optional[str] = None,
) -> Optional[str]:
    """Создать товар на витрине. Возвращает storefront_id (cuid) или None."""
    try:
        async with aiohttp.ClientSession(headers=_headers()) as session:
            category_id = await _storefront_category_id(session, category)
            if not category_id:
                return None
            url = f"{STOREFRONT_API_URL.rstrip('/')}/products"
            body = {
                "nameUz": name,
                "nameRu": name,
                "slug": slugify(name),
                "price": price,
                "categoryId": category_id,
                "stock": stock,
                "descriptionRu": description_ru or None,
                "descriptionUz": description_uz or None,
                "images": [image_url] if image_url else [],
            }
            async with session.post(
                url, json=body, timeout=aiohttp.ClientTimeout(total=20)
            ) as resp:
                if resp.status not in (200, 201):
                    logger.warning(
                        "CATALOG_OPS: витрина отказала (HTTP %s): %s",
                        resp.status,
                        (await resp.text())[:200],
                    )
                    return None
                data = await resp.json()
                return (data.get("product") or {}).get("id")
    except Exception as exc:
        logger.warning("CATALOG_OPS: витрина недоступна: %s", exc)
        return None


CATEGORY_TITLES = {
    "microgreens": "🌱 Микрозелень",
    "baby-leaf": "🍃 Бейби-листья",
    "salads": "🥗 Салаты",
    "flowers": "🌸 Цветы",
    "seeds": "🌾 Семена",
    "substrate": "🧱 Субстрат",
    "equipment": "⚙️ Оборудование",
    "sets": "🎁 Наборы",
}


async def list_categories() -> list[dict]:
    """Категории каталога с количеством товаров — для навигации по магазину."""
    return [
        {**row, "title": CATEGORY_TITLES.get(row["slug"], row["title"] or row["slug"])}
        for row in await catalog_repo.categories()
    ]


async def list_products(
    category: Optional[str], page: int = 0, per_page: int = 8
) -> dict:
    """Страница товаров каталога (для листалки в чате).

    Страницу режем в Python, а не в SQL: каталог микрозелени — десятки позиций,
    и один запрос к `catalog_repo` дешевле пары запросов с COUNT + OFFSET.
    """
    items = await catalog_repo.list_active(category)
    total = len(items)
    start = page * per_page
    return {
        "items": [
            {
                "id": item["id"],
                "name": item["name"],
                "price": item["price"],
                "unit": item["unit"],
            }
            for item in items[start : start + per_page]
        ],
        "page": page,
        "pages": max(1, (total + per_page - 1) // per_page),
        "total": total,
    }


async def add_product(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Добавить товар в каталог: витрина (магазин) + офис (CRM).

    Параметры: name (обяз.), price (обяз.), unit, category, stock.

    Возвращает {"status": "ok"|"exists"|"clarify"|"error", "message", "data"}.
    Если витрина недоступна — товар всё равно заводится в офисе, но об этом
    честно сообщается: в магазине его пока нет.
    """
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
        # Дубликат ищем по всем написаниям в каталоге-мастере: «Sango» не должен
        # завестись вторым товаром рядом с «Санго».
        existing = await catalog_repo.find(name, limit=1)
        if existing:
            return {
                "status": "exists",
                "message": f"«{existing[0]['name']}» уже есть в каталоге — повторно не добавляю.",
                "data": {"product_id": existing[0]["id"], "name": existing[0]["name"]},
            }

        description_ru = str(params.get("description_ru") or "").strip()
        description_uz = str(params.get("description_uz") or "").strip()
        image_url = str(params.get("image_url") or "").strip() or None

        storefront_id = await _create_on_storefront(
            name, price, category, stock, description_ru, description_uz, image_url
        )

        async with get_session_ctx() as session:
            # Зеркало в CRM: на него ссылаются позиции офисных заказов
            # (crm_order_items.product_id — целочисленный ключ) и из него же
            # берётся единица измерения, которой у витрины нет.
            product_id = (
                await session.execute(
                    text(
                        "INSERT INTO crm_products (name_uz, name_ru, category, price, unit, stock_qty, "
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
