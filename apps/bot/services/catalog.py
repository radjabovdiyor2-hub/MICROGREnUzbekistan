"""
🥬 Каталог витрины — единственная дверь витринного бота к товарам.

ЗАЧЕМ ЭТОТ МОДУЛЬ СУЩЕСТВУЕТ

Ответ `/api/products` разбирали в трёх местах независимо, и два из трёх
разбирали его неправильно — молча, с кодом 200 и без единой строки в логах:

  · `services/ecosystem_bridge.get_products` проверял `isinstance(result, list)`,
    а роут отдаёт объект `{items, pagination}`. Функция ВСЕГДА возвращала
    пустой список. На ней сидят объединённое меню, избранное, поиск по
    каналу и контекст ИИ-агронома.
  · `services/ai_service._load_product_catalog` — та же проверка, тот же
    результат: системный промпт собирался без единого товара и без единой
    цены, и модель называла клиенту суммы, которых нет в каталоге.
  · `handlers/shop.fetch_products` конверт разбирал верно, но потом ФИЛЬТРОВАЛ
    ещё раз на клиенте: `p.get("category") == category`, где `category` в
    ответе — вложенный объект, а не строка. Сравнение никогда не истинно.

Плюс форма полей. Витрина отдаёт Prisma-модель: `nameUz`/`nameRu`, `images`
(список), `category` (объект), `stock` (число). Обработчики читали `title`,
`image`, `inStock` — имена от старой версии API. Восемнадцать мест по пяти
файлам показывали бы «Товар» вместо названия и логотип вместо фотографии,
если бы товары до них вообще доходили.

Поэтому здесь одно место, где ответ витрины превращается во внутренний вид,
и одно место, где живёт HTTP-запрос к каталогу.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

WEB_API_URL = os.getenv("WEB_API_URL", "http://localhost:3005/api")
WEB_URL = os.getenv("WEB_URL", "https://microgreenuzbekistan.com")

TIMEOUT = 10.0


def normalize_product(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Товар витрины → внутренний вид бота.

    Русское имя первым: бот говорит с клиентом по-русски, узбекское —
    запасное. Картинка приводится к абсолютной ссылке, потому что витрина
    отдаёт путь вида `/catalog/romano.png`, а Telegram нужен полный URL.
    """
    category = raw.get("category")
    category_slug = category.get("slug") if isinstance(category, dict) else category

    images = raw.get("images")
    image = images[0] if isinstance(images, list) and images else None
    if isinstance(image, str) and image.startswith("/"):
        image = f"{WEB_URL}{image}"

    stock = raw.get("stock")
    try:
        stock_value = int(stock) if stock is not None else 0
    except (TypeError, ValueError):
        stock_value = 0

    return {
        "id": raw.get("id"),
        "title": raw.get("nameRu") or raw.get("nameUz") or "Товар",
        "price": int(raw.get("price") or 0),
        "old_price": int(raw["oldPrice"]) if raw.get("oldPrice") else None,
        "unit": raw.get("unit") or "",
        "image": image,
        "category": category_slug,
        "description": raw.get("descriptionRu") or raw.get("descriptionUz") or "",
        "stock": stock_value,
        "in_stock": stock_value > 0,
        "slug": raw.get("slug"),
    }


async def fetch_products(
    category: Optional[str] = None, limit: int = 50
) -> List[Dict[str, Any]]:
    """Товары каталога. Фильтр по категории делает витрина — здесь его нет.

    Повторная фильтрация на клиенте и была той ошибкой, из-за которой список
    всегда получался пустым.
    """
    params: Dict[str, Any] = {"limit": limit}
    if category:
        params["category"] = category

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{WEB_API_URL}/products", params=params)
        if resp.status_code != 200:
            logger.warning("Каталог: витрина ответила %s", resp.status_code)
            return []
        data = resp.json()
    except Exception as exc:
        logger.error("Каталог: запрос не удался: %s", exc)
        return []

    # Роут отдаёт `{items, pagination}`. Голый список поддерживаем на случай
    # старого ответа, но именно предположение «это список» и ломало всё.
    if isinstance(data, dict):
        items = data.get("items") or data.get("products") or []
    elif isinstance(data, list):
        items = data
    else:
        items = []

    return [normalize_product(item) for item in items if isinstance(item, dict)]


async def fetch_product(product_id: str) -> Optional[Dict[str, Any]]:
    """Один товар по id или None."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{WEB_API_URL}/products/{product_id}")
        if resp.status_code != 200:
            return None
        data = resp.json()
    except Exception as exc:
        logger.error("Каталог: товар %s не получен: %s", product_id, exc)
        return None

    if not isinstance(data, dict) or data.get("error") or not data.get("id"):
        return None
    return normalize_product(data)
