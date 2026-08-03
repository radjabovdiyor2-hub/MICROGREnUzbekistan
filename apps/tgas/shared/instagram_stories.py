"""
Microgreen Uzbekistan — Instagram Stories Promo Publisher
=========================================================
Автоматическая публикация рекламных Stories в Instagram.
Каждые 1-2 дня генерирует промо-контент через AI и публикует
его как Story через Instagram Content Publishing API (Graph API v19.0).

Поток:
  1. AIEngine генерирует промо-текст о продукции
  2. AIEngine.generate_image() создаёт промо-изображение
  3. Изображение загружается на публичный хостинг (imgbb)
  4. POST /{ig_account_id}/media  — создание контейнера Story
  5. POST /{ig_account_id}/media_publish — публикация Story
"""

from __future__ import annotations

import asyncio
import base64
import logging
import random
from pathlib import Path

# brand.py — единственный источник фирменных контактов. Раньше телефон был
# вписан здесь строкой заглушкой «+998 91 123 45 67», и он уходил в
# публикуемые Stories.
from shared.brand import BRAND
from typing import Optional

import aiohttp

from shared.config import settings
from shared.ai_engine import AIEngine

logger = logging.getLogger(__name__)

GRAPH_BASE_URL = "https://graph.facebook.com/v19.0"

# ── Каталог продукции (контекст для AI) ──────────────────────────────────
# Раньше здесь лежал каталог с ценами строкой. Он разошёлся с базой (цены
# менялись в админке, а промпт нет) и вдобавок предлагал «стартовый набор для
# выращивания дома» — ровно то, что фирменный промпт продаж запрещает. Теперь
# каталог берётся из базы: shared/catalog_repo — единственный источник цен.
async def _product_catalog() -> str:
    from shared import catalog_repo
    from shared.utils import format_price

    catalog = await catalog_repo.price_list()
    threshold = format_price(float(settings.free_delivery_threshold))
    return (
        "ПРОДУКЦИЯ Microgreen Uzbekistan (актуальный каталог):\n"
        f"{catalog}\n\n"
        f"ДОСТАВКА: бесплатно от {threshold} по Самарканду\n"
        f"ТЕЛЕФОН: {BRAND['phone']}\n"
        "САЙТ: microgreenuzbekistan.com"
    )

# ── Промо-темы для разнообразия ──────────────────────────────────────────
PROMO_THEMES = [
    "сезонная акция на микрозелень",
    "польза микрозелени для здоровья",
    "стартовый набор — идеальный подарок",
    "свежие салатные миксы для ресторанов",
    "съедобные цветы — тренд ресторанного декора",
    "домашнее выращивание микрозелени",
    "скидка на первый заказ",
    "бесплатная доставка по Самарканду",
    "витамины и суперфуды на каждый день",
    "идеи для healthy-завтрака с микрозеленью",
    "почему HoReCa выбирает Microgreen Uzbekistan",
    "факты о микрозелени, которые удивят",
]

# ── Системный промпт для генерации текста Stories ────────────────────────
STORY_TEXT_SYSTEM_PROMPT = f"""Ты — креативный маркетолог компании Microgreen Uzbekistan.
Твоя задача — писать короткие, цепляющие промо-тексты для Instagram Stories.

ПРАВИЛА:
- Текст ОЧЕНЬ короткий: 2-4 строки, максимум 100 слов
- Используй эмодзи к месту (2-4 штуки)
- Пиши на русском языке
- Обязательно укажи цену или выгоду
- Добавь призыв к действию (закажи, напиши, переходи)
- Упомяни телефон {BRAND["phone"]} или "напишите в Direct"
- Не используй хештеги (это Story, не пост)
- Стиль: дружелюбный, живой, не рекламный
- Каждый текст должен быть уникальным
"""


async def _generate_promo_text(ai: AIEngine) -> str:
    """
    Генерирует промо-текст для Instagram Story через AI.

    Returns:
        Короткий промо-текст для наложения на Story-изображение.
    """
    theme = random.choice(PROMO_THEMES)
    user_prompt = (
        f"Напиши промо-текст для Instagram Story на тему: '{theme}'.\n\n"
        f"Каталог продукции:\n{await _product_catalog()}\n\n"
        f"Помни: текст должен быть очень коротким (2-4 строки) и цепляющим."
    )

    text = await ai.chat_completion(
        system_prompt=STORY_TEXT_SYSTEM_PROMPT,
        user_message=user_prompt,
        temperature=0.9,
        max_tokens=200,
    )

    logger.info("Промо-текст сгенерирован (тема: %s): %s", theme, text[:80])
    return text


async def _generate_promo_image(ai: AIEngine) -> Optional[str]:
    """
    Генерирует промо-изображение через AIEngine.generate_image().

    Возвращает путь к локальному файлу или URL изображения.
    """
    themes_visual = [
        "beautiful microgreens arrangement on a wooden cutting board, "
        "professional food photography, vibrant green colors, "
        "soft natural light, restaurant quality presentation",
        "fresh organic microgreens growing in a modern hydroponic tray, "
        "bright studio lighting, clean white background, "
        "vivid green sprouts, commercial food photography",
        "colorful edible flowers and microgreens salad bowl, "
        "top-down view, restaurant plating, fresh and appetizing, "
        "professional food styling, soft bokeh background",
        "home growing kit for microgreens on a kitchen counter, "
        "cozy lifestyle photography, morning sunlight, "
        "modern kitchen, healthy living concept",
        "assortment of microgreens: arugula, basil, sunflower, pea shoots, "
        "neatly arranged in eco containers, farmers market aesthetic, "
        "natural daylight, sharp focus on greens",
    ]

    prompt = random.choice(themes_visual)
    # Story-формат: вертикальный 9:16
    result = await ai.generate_image(prompt, size="1024x1792")

    if result:
        logger.info("Промо-изображение сгенерировано: %s", str(result)[:80])
    else:
        logger.error("Не удалось сгенерировать промо-изображение")

    return result


async def _upload_image_to_hosting(image_path: str) -> Optional[str]:
    """
    Загружает локальный файл изображения на публичный хостинг (imgbb.com)
    для получения публичного URL, необходимого для Instagram Graph API.

    Если изображение уже является URL — возвращает его как есть.

    Args:
        image_path: путь к локальному файлу или URL

    Returns:
        Публичный URL изображения или None при ошибке
    """
    # Если это уже URL — возвращаем как есть
    if image_path.startswith("http://") or image_path.startswith("https://"):
        return image_path

    # Локальный файл — читаем и загружаем на хостинг
    file_path = Path(image_path)
    if not file_path.exists():
        logger.error("Файл изображения не найден: %s", image_path)
        return None

    # Первичный (надёжный) способ: загрузка на Facebook-страницу тем же токеном,
    # что и обычные посты. Возвращает публичный URL. imgbb/0x0.st — только фолбэк.
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

        # Загрузка на imgbb (бесплатный хостинг изображений)
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

        # Fallback: загрузка через 0x0.st (бесплатный файлообменник)
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


async def _create_story_container(
    session: aiohttp.ClientSession,
    ig_account_id: str,
    access_token: str,
    image_url: str,
) -> Optional[str]:
    """
    Шаг 1: Создание контейнера медиа для Instagram Story.

    POST /{ig_account_id}/media
      - image_url: публичный URL изображения
      - media_type: STORIES

    Returns:
        creation_id контейнера или None при ошибке.
    """
    url = f"{GRAPH_BASE_URL}/{ig_account_id}/media"
    params = {
        "image_url": image_url,
        "media_type": "STORIES",
        "access_token": access_token,
    }

    async with session.post(url, params=params) as resp:
        data = await resp.json()

        if "error" in data:
            error = data["error"]
            logger.error(
                "Instagram Story container error: [%s] %s",
                error.get("code", "?"),
                error.get("message", data),
            )
            return None

        creation_id = data.get("id")
        if creation_id:
            logger.info("Story container created: %s", creation_id)
        return creation_id


async def _wait_for_container_ready(
    session: aiohttp.ClientSession,
    ig_account_id: str,
    access_token: str,
    creation_id: str,
    max_attempts: int = 10,
    delay: float = 3.0,
) -> bool:
    """
    Ожидание готовности контейнера Story.

    Instagram обрабатывает медиа асинхронно; после POST /media
    контейнер может быть в статусе IN_PROGRESS.

    Returns:
        True если контейнер готов к публикации.
    """
    url = f"{GRAPH_BASE_URL}/{creation_id}"
    params = {
        "fields": "status_code",
        "access_token": access_token,
    }

    for attempt in range(1, max_attempts + 1):
        try:
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                status = data.get("status_code", "UNKNOWN")

                if status == "FINISHED":
                    logger.info(
                        "Story container %s ready (attempt %d)", creation_id, attempt
                    )
                    return True
                elif status == "ERROR":
                    logger.error(
                        "Story container %s processing failed: %s",
                        creation_id,
                        data,
                    )
                    return False
                else:
                    logger.debug(
                        "Story container %s status: %s (attempt %d/%d)",
                        creation_id,
                        status,
                        attempt,
                        max_attempts,
                    )
        except Exception as e:
            logger.warning(
                "Error checking container status (attempt %d): %s", attempt, e
            )

        await asyncio.sleep(delay)

    logger.error(
        "Story container %s not ready after %d attempts", creation_id, max_attempts
    )
    return False


async def _publish_story(
    session: aiohttp.ClientSession,
    ig_account_id: str,
    access_token: str,
    creation_id: str,
) -> Optional[str]:
    """
    Шаг 2: Публикация Instagram Story.

    POST /{ig_account_id}/media_publish
      - creation_id: ID контейнера из шага 1

    Returns:
        ID опубликованной Story или None при ошибке.
    """
    url = f"{GRAPH_BASE_URL}/{ig_account_id}/media_publish"
    params = {
        "creation_id": creation_id,
        "access_token": access_token,
    }

    async with session.post(url, params=params) as resp:
        data = await resp.json()

        if "error" in data:
            error = data["error"]
            logger.error(
                "Instagram Story publish error: [%s] %s",
                error.get("code", "?"),
                error.get("message", data),
            )
            return None

        story_id = data.get("id")
        if story_id:
            logger.info("Instagram Story published! ID: %s", story_id)
        return story_id


def _cleanup_temp_file(file_path: str) -> None:
    """Удаляет временный файл изображения, если он существует."""
    try:
        p = Path(file_path)
        if p.exists() and p.is_file() and p.name.startswith(("temp_img", "story")):
            p.unlink()
            logger.debug("Temp file removed: %s", file_path)
    except Exception as e:
        logger.debug("Could not remove temp file %s: %s", file_path, e)


async def post_promotional_story() -> bool:
    """
    Главная функция: генерирует промо-контент и публикует Instagram Story.

    Полный цикл:
      1. Проверяет конфигурацию Instagram API
      2. Генерирует промо-текст через AI
      3. Генерирует промо-изображение через AI
      4. Загружает изображение на публичный хостинг
      5. Создаёт контейнер Story (POST /media)
      6. Ожидает готовности контейнера
      7. Публикует Story (POST /media_publish)
      8. Очищает временные файлы

    Returns:
        True если Story успешно опубликована, False иначе.
    """
    # ── 1. Проверка конфигурации ──────────────────────────────────────
    ig_account_id = getattr(settings, "instagram_account_id", "").strip("'\"")
    access_token = getattr(settings, "instagram_access_token", "").strip("'\"")

    if not ig_account_id or not access_token:
        logger.warning(
            "Instagram API not configured "
            "(instagram_account_id or instagram_access_token missing). "
            "Story not posted."
        )
        return False

    ai = AIEngine()
    local_image_path: Optional[str] = None

    try:
        # ── 2. Генерация промо-текста ─────────────────────────────────
        promo_text = await _generate_promo_text(ai)
        logger.info("=== Promo Story text ===\n%s", promo_text)

        # ── 3. Генерация промо-изображения ────────────────────────────
        image_result = await _generate_promo_image(ai)

        if not image_result:
            logger.error("Image generation failed, aborting story post")
            return False

        # Запоминаем путь к локальному файлу для очистки
        if not image_result.startswith("http"):
            local_image_path = image_result

        # ── 4. Загрузка на публичный хостинг ──────────────────────────
        public_url = await _upload_image_to_hosting(image_result)

        if not public_url:
            logger.error("Image upload to hosting failed, aborting story post")
            return False

        # ── 5-7. Публикация через Instagram Graph API ─────────────────
        async with aiohttp.ClientSession() as session:
            # Шаг 5: создание контейнера
            creation_id = await _create_story_container(
                session, ig_account_id, access_token, public_url
            )

            if not creation_id:
                return False

            # Шаг 6: ожидание готовности
            ready = await _wait_for_container_ready(
                session, ig_account_id, access_token, creation_id
            )

            if not ready:
                return False

            # Шаг 7: публикация
            story_id = await _publish_story(
                session, ig_account_id, access_token, creation_id
            )

            if story_id:
                logger.info(
                    "=== Instagram Story PUBLISHED === "
                    "story_id=%s, promo_text_preview='%s'",
                    story_id,
                    promo_text[:60],
                )
                return True
            else:
                return False

    except Exception as e:
        logger.error("Unexpected error posting Instagram Story: %s", e, exc_info=True)
        return False

    finally:
        # ── 8. Очистка ────────────────────────────────────────────────
        if local_image_path:
            _cleanup_temp_file(local_image_path)
        await ai.close()
