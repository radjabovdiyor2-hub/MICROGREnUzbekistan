import os
import logging
import aiohttp
from typing import Optional
from shared.config import settings

logger = logging.getLogger(__name__)

async def _upload_image_to_facebook(local_path: str) -> Optional[str]:
    page_id = getattr(settings, "facebook_page_id", None)
    user_access_token = getattr(settings, "instagram_access_token", None)

    if not page_id or not user_access_token:
        return None

    try:
        async with aiohttp.ClientSession() as session:
            page_token = user_access_token
            try:
                page_url = f"https://graph.facebook.com/v18.0/{page_id}?fields=access_token&access_token={user_access_token}"
                async with session.get(page_url) as page_resp:
                    page_data = await page_resp.json()
                    if "access_token" in page_data:
                        page_token = page_data["access_token"]
                        logger.info("Успешно получен Page Access Token для загрузки фото.")
            except Exception as e:
                logger.warning(f"Не удалось получить Page Access Token, используем User Token: {e}")

            url = f"https://graph.facebook.com/v18.0/{page_id}/photos"

            with open(local_path, "rb") as f:
                data = aiohttp.FormData()
                data.add_field("source", f, filename="photo.jpg", content_type="image/jpeg")
                data.add_field("access_token", page_token)
                data.add_field("published", "false")

                async with session.post(url, data=data) as resp:
                    result = await resp.json()
                    if "id" in result:
                        photo_id = result["id"]
                        async with session.get(
                            f"https://graph.facebook.com/v18.0/{photo_id}",
                            params={"fields": "images", "access_token": page_token},
                        ) as r2:
                            photo_data = await r2.json()
                            if "images" in photo_data and len(photo_data["images"]) > 0:
                                public_url = photo_data["images"][0]["source"]
                                logger.info(f"Фото загружено на Facebook, URL: {public_url[:80]}...")
                                return public_url
                    logger.error(f"Facebook photo upload failed: {result}")
                    return None
    except Exception as e:
        logger.error(f"Error uploading image to Facebook: {e}", exc_info=True)
        return None

async def _upload_video_to_hosting(local_path: str) -> Optional[str]:
    if local_path.startswith("http://") or local_path.startswith("https://"):
        return local_path
    if not os.path.isfile(local_path):
        logger.error("Видео не найдено: %s", local_path)
        return None
    try:
        with open(local_path, "rb") as f:
            video_data = f.read()
        async with aiohttp.ClientSession() as session:
            form = aiohttp.FormData()
            form.add_field("file", video_data, filename="reel.mp4", content_type="video/mp4")
            async with session.post("https://0x0.st", data=form) as resp:
                if resp.status == 200:
                    url = (await resp.text()).strip()
                    logger.info("Видео загружено на 0x0.st: %s", url)
                    return url
                logger.error("0x0.st video upload error: status=%d", resp.status)
    except Exception as e:
        logger.error("Ошибка заливки видео: %s", e, exc_info=True)
    return None
