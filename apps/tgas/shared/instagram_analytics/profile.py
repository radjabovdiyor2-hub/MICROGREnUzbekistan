import logging
import aiohttp
from shared.config import settings
from shared.instagram_analytics.core import GRAPH_BASE_URL

logger = logging.getLogger(__name__)

async def get_profile_stats() -> dict:
    ig_account_id = getattr(settings, "instagram_account_id", "")
    access_token = getattr(settings, "instagram_access_token", "")

    if not ig_account_id or not access_token:
        logger.warning("Instagram Graph API не настроен. Невозможно получить статистику.")
        return {}

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{ig_account_id}"
            params = {
                "fields": "followers_count,media_count,follows_count",
                "access_token": access_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()

                if "error" in data:
                    error = data["error"]
                    logger.error(f"Ошибка получения статистики профиля: {error.get('message', data)}")
                    return {}

                stats = {
                    "followers_count": data.get("followers_count", 0),
                    "media_count": data.get("media_count", 0),
                    "follows_count": data.get("follows_count", 0),
                }
                logger.info(
                    f"📊 Статистика профиля: "
                    f"подписчики={stats['followers_count']}, "
                    f"посты={stats['media_count']}, "
                    f"подписки={stats['follows_count']}"
                )
                return stats
    except Exception as e:
        logger.error(f"Ошибка при получении статистики профиля: {e}", exc_info=True)
        return {}
