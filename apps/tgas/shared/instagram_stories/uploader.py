import base64
import logging
import random
from pathlib import Path
from typing import Optional
import aiohttp
from shared.config import settings

logger = logging.getLogger(__name__)

async def _upload_image_to_hosting(image_path: str) -> Optional[str]:
    if image_path.startswith("http://") or image_path.startswith("https://"):
        return image_path

    file_path = Path(image_path)
    if not file_path.exists():
        logger.error("Файл изображения не найден: %s", image_path)
        return None

    try:
        from shared.instagram import _upload_image_to_facebook
        fb_url = await _upload_image_to_facebook(str(file_path))
        if fb_url:
            logger.info("Изображение загружено через Facebook: %s", fb_url[:80])
            return fb_url
    except Exception as e:
        logger.warning("Facebook-заливка не удалась, пробуем imgbb/0x0.st: %s", e)

    try:
        with open(file_path, "rb") as f:
            image_data = f.read()

        image_b64 = base64.b64encode(image_data).decode("utf-8")
        imgbb_key = getattr(settings, "imgbb_api_key", "").strip("'\"")

        if imgbb_key:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.imgbb.com/1/upload",
                    data={
                        "key": imgbb_key,
                        "image": image_b64,
                        "name": f"ig_story_{random.randint(1000, 9999)}",
                    },
                ) as resp:
                    result = await resp.json()
                    if result.get("success"):
                        url = result["data"]["url"]
                        logger.info("Изображение загружено на imgbb: %s", url)
                        return url
                    else:
                        logger.error("imgbb upload error: %s", result)

        async with aiohttp.ClientSession() as session:
            form_data = aiohttp.FormData()
            form_data.add_field(
                "file",
                image_data,
                filename="story.jpg",
                content_type="image/jpeg",
            )
            async with session.post("https://0x0.st", data=form_data) as resp:
                if resp.status == 200:
                    url = (await resp.text()).strip()
                    logger.info("Изображение загружено на 0x0.st: %s", url)
                    return url
                else:
                    logger.error("0x0.st upload error: status=%d", resp.status)

    except Exception as e:
        logger.error("Ошибка загрузки изображения на хостинг: %s", e, exc_info=True)

    return None
