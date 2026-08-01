import logging
from typing import Optional
import aiohttp
from shared.catalog_ops.core import STOREFRONT_API_URL, _headers, slugify

logger = logging.getLogger(__name__)

async def _storefront_category_id(
    session: aiohttp.ClientSession, category: str
) -> Optional[str]:
    url = f"{STOREFRONT_API_URL.rstrip('/')}/categories"
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
        if resp.status != 200:
            logger.warning("CATALOG_OPS: категории витрины недоступны (HTTP %s)", resp.status)
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
    return flat[0].get("id")

async def upload_image(file_bytes: bytes, filename: str) -> Optional[str]:
    try:
        form = aiohttp.FormData()
        form.add_field("file", file_bytes, filename=filename, content_type="image/jpeg")
        url = f"{STOREFRONT_API_URL.rstrip('/')}/upload"
        async with aiohttp.ClientSession(headers=_headers()) as session:
            async with session.post(url, data=form, timeout=aiohttp.ClientTimeout(total=60)) as resp:
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
            async with session.post(url, json=body, timeout=aiohttp.ClientTimeout(total=20)) as resp:
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
