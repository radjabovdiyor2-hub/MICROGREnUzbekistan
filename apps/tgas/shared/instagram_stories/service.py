import logging
from typing import Optional
import aiohttp
from shared.config import settings
from shared.ai_engine import AIEngine
from shared.instagram_stories.core import _cleanup_temp_file
from shared.instagram_stories.generator import _generate_promo_text, _generate_promo_image
from shared.instagram_stories.uploader import _upload_image_to_hosting
from shared.instagram_stories.publisher import _create_story_container, _wait_for_container_ready, _publish_story

logger = logging.getLogger(__name__)

async def post_promotional_story() -> bool:
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
        promo_text = await _generate_promo_text(ai)
        logger.info("=== Promo Story text ===\n%s", promo_text)

        image_result = await _generate_promo_image(ai)

        if not image_result:
            logger.error("Image generation failed, aborting story post")
            return False

        if not image_result.startswith("http"):
            local_image_path = image_result

        public_url = await _upload_image_to_hosting(image_result)

        if not public_url:
            logger.error("Image upload to hosting failed, aborting story post")
            return False

        async with aiohttp.ClientSession() as session:
            creation_id = await _create_story_container(session, ig_account_id, access_token, public_url)
            if not creation_id:
                return False

            ready = await _wait_for_container_ready(session, ig_account_id, access_token, creation_id)
            if not ready:
                return False

            story_id = await _publish_story(session, ig_account_id, access_token, creation_id)

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
        if local_image_path:
            _cleanup_temp_file(local_image_path)
        await ai.close()
