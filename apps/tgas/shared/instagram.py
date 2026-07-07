import logging
import aiohttp
import asyncio
import os
from typing import Optional
from shared.config import settings

logger = logging.getLogger(__name__)

# ── Dry-run: когда включён, реальная публикация в Instagram пропускается ──
# (для тестового прогона контента только в Telegram).
_DRY_RUN = False


def set_dry_run(value: bool) -> None:
    """Включить/выключить режим без публикации в Instagram."""
    global _DRY_RUN
    _DRY_RUN = value


def _is_dry_run() -> bool:
    import os
    return _DRY_RUN or bool(os.getenv("SMM_DRY_RUN"))


async def _upload_image_to_facebook(local_path: str) -> Optional[str]:
    """
    Загружает локальное изображение на Facebook и возвращает публичный URL.
    """
    page_id = getattr(settings, "facebook_page_id", None)
    user_access_token = getattr(settings, "instagram_access_token", None)
    
    if not page_id or not user_access_token:
        return None
    
    try:
        async with aiohttp.ClientSession() as session:
            # Шаг 1: Обмениваем User Token на Page Token для обхода ошибки (#200)
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
                            params={"fields": "images", "access_token": page_token}
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


async def post_to_instagram(image_url: str, caption: str, post_type: str = 'story') -> bool:
    """
    Публикация фото в Instagram через Facebook Graph API.
    
    post_type:
        'story' — публикация в Stories (media_type='STORIES')
        'feed'  — публикация в ленту (без media_type, с caption)
    """
    if _is_dry_run():
        logger.info(f"🧪 DRY-RUN: публикация в Instagram пропущена (post_type={post_type}).")
        return False

    ig_account_id = getattr(settings, "instagram_account_id", None)
    access_token = getattr(settings, "instagram_access_token", None)

    if not ig_account_id or not access_token:
        logger.warning("Instagram Graph API не настроен. Пропущена реальная публикация.")
        return False

    # Если передан локальный файл — загружаем на Facebook
    if os.path.isfile(image_url):
        logger.info(f"Локальный файл: {image_url}. Загружаем на Facebook...")
        public_url = await _upload_image_to_facebook(image_url)
        if not public_url:
            logger.error("Не удалось загрузить изображение на Facebook.")
            return False
        image_url = public_url

    api_version = "v18.0"
    base_url = f"https://graph.facebook.com/{api_version}/{ig_account_id}"

    try:
        async with aiohttp.ClientSession() as session:
            # Шаг 1: Создание медиа-контейнера
            create_url = f"{base_url}/media"
            if post_type == 'feed':
                payload = {
                    "image_url": image_url,
                    "caption": caption,
                    "access_token": access_token
                }
            else:
                payload = {
                    "image_url": image_url,
                    "media_type": "STORIES",
                    "access_token": access_token
                }
            async with session.post(create_url, data=payload) as resp:
                data = await resp.json()
                if "id" not in data:
                    logger.error(f"Ошибка создания контейнера: {data}")
                    return False
                creation_id = data["id"]
                logger.info(f"Контейнер создан: {creation_id}")

            # Шаг 2: Ожидание обработки контейнера (до 60 сек)
            for attempt in range(12):
                await asyncio.sleep(5)
                async with session.get(
                    f"https://graph.facebook.com/{api_version}/{creation_id}",
                    params={"fields": "status_code", "access_token": access_token}
                ) as resp:
                    status_data = await resp.json()
                    status = status_data.get("status_code")
                    logger.info(f"Статус контейнера: {status} (попытка {attempt+1}/12)")
                    
                    if status == "FINISHED":
                        break
                    elif status == "ERROR":
                        logger.error(f"Контейнер завершился с ошибкой: {status_data}")
                        return False
            else:
                logger.error("Таймаут ожидания обработки контейнера Instagram")
                return False

            # Шаг 3: Публикация
            publish_url = f"{base_url}/media_publish"
            publish_payload = {
                "creation_id": creation_id,
                "access_token": access_token
            }
            async with session.post(publish_url, data=publish_payload) as resp:
                publish_data = await resp.json()
                if "id" not in publish_data:
                    logger.error(f"Ошибка публикации: {publish_data}")
                    return False
                
                logger.info(f"✅ Опубликовано в Instagram! Post ID: {publish_data['id']}")
                return True

    except Exception as e:
        logger.error(f"Сбой при постинге в Instagram: {e}", exc_info=True)
        return False

async def post_story_with_text(
    image_path: str,
    headline: str = "",
    caption: str = "",
    cta: str = "ПОДРОБНЕЕ →",
) -> bool:
    """
    Публикует СТОРИС с впечатанным текстом (заголовок + хэштеги + @упоминание + CTA),
    т.к. Instagram Stories API не поддерживает подписи/стикеры/музыку.
    Текст берётся из headline и хэштегов внутри caption.
    """
    import re
    from shared.brand import render_story_text, BRAND

    story_img = image_path
    if os.path.isfile(image_path):
        tags = " ".join(re.findall(r"#\w+", caption or "")) or BRAND["hashtag"]
        out = "temp_story.jpg"
        ok = render_story_text(
            image_path, out,
            headline=headline or "",
            hashtags=tags,
            mention=BRAND["instagram"],
            cta=cta,
        )
        if ok:
            story_img = out
    return await post_to_instagram(story_img, "", post_type="story")


async def publish_daily_and_grid(
    image_path: str,
    caption: str,
    headline: str = "",
    to_grid: bool = False,
) -> dict:
    """
    Единая точка публикации по контент-стратегии:
      • всегда → СТОРИС с впечатанным текстом (ежедневный охват);
      • если to_grid=True → ещё и ПОСТ В СЕТКУ (feed) с полной подписью (раз в неделю).
    Возвращает {'story': bool, 'grid': bool|None}.
    """
    result = {"story": False, "grid": None}
    result["story"] = await post_story_with_text(image_path, headline, caption)
    if to_grid:
        result["grid"] = await post_to_instagram(image_path, caption, post_type="feed")
    return result


async def send_ig_message(recipient_id: str, text: str) -> bool:
    """
    Отправляет текстовое сообщение (Direct Message) пользователю Instagram.
    """
    page_id = getattr(settings, "facebook_page_id", None)
    user_access_token = getattr(settings, "instagram_access_token", None)
    
    if not page_id or not user_access_token:
        logger.error("Missing facebook_page_id or instagram_access_token for IG messages.")
        return False
        
    try:
        async with aiohttp.ClientSession() as session:
            # Пытаемся получить Page Access Token (если передан User Token)
            page_token = user_access_token
            try:
                page_url = f"https://graph.facebook.com/v18.0/{page_id}?fields=access_token&access_token={user_access_token}"
                async with session.get(page_url) as page_resp:
                    page_data = await page_resp.json()
                    if "access_token" in page_data:
                        page_token = page_data["access_token"]
            except Exception:
                pass
                
            url = f"https://graph.facebook.com/v18.0/{page_id}/messages"
            payload = {
                "recipient": {"id": recipient_id},
                "message": {"text": text}
            }
            params = {"access_token": page_token}
            
            async with session.post(url, params=params, json=payload) as resp:
                result = await resp.json()
                if "message_id" in result or "recipient_id" in result:
                    logger.info(f"Successfully sent IG message to {recipient_id}")
                    return True
                else:
                    logger.error(f"Failed to send IG message: {result}")
                    return False
    except Exception as e:
        logger.error(f"Error sending IG message: {e}", exc_info=True)
        return False
