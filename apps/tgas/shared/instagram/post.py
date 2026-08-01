import os
import logging
import asyncio
from typing import Optional
import aiohttp
from shared.config import settings
from shared.instagram.core import _is_dry_run
from shared.instagram.upload import _upload_image_to_facebook, _upload_video_to_hosting

logger = logging.getLogger(__name__)

async def post_to_instagram(
    image_url: str, caption: str, post_type: str = "story"
) -> Optional[str]:
    if _is_dry_run():
        logger.info(f"🧪 DRY-RUN: публикация в Instagram пропущена (post_type={post_type}).")
        return None

    ig_account_id = getattr(settings, "instagram_account_id", None)
    access_token = getattr(settings, "instagram_access_token", None)

    if not ig_account_id or not access_token:
        logger.warning("Instagram Graph API не настроен. Пропущена реальная публикация.")
        return None

    if os.path.isfile(image_url):
        logger.info(f"Локальный файл: {image_url}. Загружаем на Facebook...")
        public_url = await _upload_image_to_facebook(image_url)
        if not public_url:
            logger.error("Не удалось загрузить изображение на Facebook.")
            return None
        image_url = public_url

    api_version = "v18.0"
    base_url = f"https://graph.facebook.com/{api_version}/{ig_account_id}"

    try:
        async with aiohttp.ClientSession() as session:
            create_url = f"{base_url}/media"
            if post_type == "feed":
                payload = {
                    "image_url": image_url,
                    "caption": caption,
                    "access_token": access_token,
                }
            else:
                payload = {
                    "image_url": image_url,
                    "media_type": "STORIES",
                    "access_token": access_token,
                }
            async with session.post(create_url, data=payload) as resp:
                data = await resp.json()
                if "id" not in data:
                    logger.error(f"Ошибка создания контейнера: {data}")
                    return None
                creation_id = data["id"]
                logger.info(f"Контейнер создан: {creation_id}")

            for attempt in range(12):
                await asyncio.sleep(5)
                async with session.get(
                    f"https://graph.facebook.com/{api_version}/{creation_id}",
                    params={"fields": "status_code", "access_token": access_token},
                ) as resp:
                    status_data = await resp.json()
                    status = status_data.get("status_code")
                    logger.info(f"Статус контейнера: {status} (попытка {attempt + 1}/12)")

                    if status == "FINISHED":
                        break
                    elif status == "ERROR":
                        logger.error(f"Контейнер завершился с ошибкой: {status_data}")
                        return None
            else:
                logger.error("Таймаут ожидания обработки контейнера Instagram")
                return None

            publish_url = f"{base_url}/media_publish"
            publish_payload = {"creation_id": creation_id, "access_token": access_token}
            async with session.post(publish_url, data=publish_payload) as resp:
                publish_data = await resp.json()
                if "id" not in publish_data:
                    logger.error(f"Ошибка публикации: {publish_data}")
                    return None

                logger.info(f"✅ Опубликовано в Instagram! Post ID: {publish_data['id']}")
                return str(publish_data["id"])

    except Exception as e:
        logger.error(f"Сбой при постинге в Instagram: {e}", exc_info=True)
        return None

async def post_reel(
    video_path: str, caption: str = "", share_to_feed: bool = True
) -> Optional[str]:
    if _is_dry_run():
        logger.info("🧪 DRY-RUN: публикация Reel пропущена.")
        return None

    ig_account_id = getattr(settings, "instagram_account_id", None)
    access_token = getattr(settings, "instagram_access_token", None)

    if not ig_account_id or not access_token:
        logger.warning("Instagram Graph API не настроен. Пропущена реальная публикация Reel.")
        return None

    public_url = await _upload_video_to_hosting(video_path)
    if not public_url:
        logger.error("Не удалось получить публичный URL для Reel")
        return None

    api_version = "v18.0"
    base_url = f"https://graph.facebook.com/{api_version}/{ig_account_id}"

    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "media_type": "REELS",
                "video_url": public_url,
                "caption": caption,
                "share_to_feed": "true" if share_to_feed else "false",
                "access_token": access_token,
            }
            async with session.post(f"{base_url}/media", data=payload) as resp:
                data = await resp.json()
                if "id" not in data:
                    logger.error(f"Ошибка создания Reel-контейнера: {data}")
                    return None
                creation_id = data["id"]
                logger.info(f"Reel-контейнер создан: {creation_id}")

            for attempt in range(18):
                await asyncio.sleep(5)
                async with session.get(
                    f"https://graph.facebook.com/{api_version}/{creation_id}",
                    params={"fields": "status_code", "access_token": access_token},
                ) as resp:
                    st = await resp.json()
                    status = st.get("status_code")
                    logger.info(f"Статус Reel-контейнера: {status} ({attempt + 1}/18)")
                    if status == "FINISHED":
                        break
                    if status == "ERROR":
                        logger.error("Reel-контейнер завершился с ошибкой")
                        return None
            else:
                logger.error("Таймаут обработки Reel-контейнера")
                return None

            async with session.post(
                f"{base_url}/media_publish",
                data={"creation_id": creation_id, "access_token": access_token},
            ) as resp:
                pub = await resp.json()
                if "id" not in pub:
                    logger.error(f"Ошибка публикации Reel: {pub}")
                    return None
                logger.info(f"✅ Reel опубликован! ID: {pub['id']}")
                return str(pub['id'])
    except Exception as e:
        logger.error(f"Сбой при публикации Reel: {e}", exc_info=True)
        return None
