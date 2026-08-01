import logging
import asyncio
from typing import Optional
import aiohttp
from shared.instagram_stories.core import GRAPH_BASE_URL

logger = logging.getLogger(__name__)

async def _create_story_container(
    session: aiohttp.ClientSession,
    ig_account_id: str,
    access_token: str,
    image_url: str,
) -> Optional[str]:
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
                    logger.info("Story container %s ready (attempt %d)", creation_id, attempt)
                    return True
                elif status == "ERROR":
                    logger.error("Story container %s processing failed: %s", creation_id, data)
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
            logger.warning("Error checking container status (attempt %d): %s", attempt, e)

        await asyncio.sleep(delay)

    logger.error("Story container %s not ready after %d attempts", creation_id, max_attempts)
    return False

async def _publish_story(
    session: aiohttp.ClientSession,
    ig_account_id: str,
    access_token: str,
    creation_id: str,
) -> Optional[str]:
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
