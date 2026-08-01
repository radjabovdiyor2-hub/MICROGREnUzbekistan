import logging
import aiohttp
from shared.config import settings
from shared.instagram_analytics.core import GRAPH_BASE_URL

logger = logging.getLogger(__name__)

async def get_media_insights(media_id: str, media_type: str = "") -> dict:
    access_token = getattr(settings, "instagram_access_token", "")
    if not media_id or not access_token:
        return {}
    mt = (media_type or "").upper()
    if mt == "STORY":
        metrics = "reach,replies"
    elif mt in ("VIDEO", "REELS"):
        metrics = "reach,saved,shares,views"
    else:
        metrics = "reach,saved,shares"
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{media_id}/insights"
            params = {"metric": metrics, "access_token": access_token}
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                if "error" in data:
                    logger.debug(f"insights /{media_id}: {data['error'].get('message', '')}")
                    return {}
                out = {}
                for item in data.get("data", []):
                    vals = item.get("values") or [{}]
                    out[item.get("name")] = vals[0].get("value", 0)
                return out
    except Exception as e:
        logger.debug(f"insights error {media_id}: {e}")
        return {}

async def get_recent_media_stats(limit: int = 10, with_insights: bool = False) -> list:
    ig_account_id = getattr(settings, "instagram_account_id", "")
    access_token = getattr(settings, "instagram_access_token", "")

    if not ig_account_id or not access_token:
        logger.warning("Instagram Graph API не настроен. Невозможно получить медиа.")
        return []

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{ig_account_id}/media"
            params = {
                "fields": "id,caption,timestamp,like_count,comments_count,media_type",
                "limit": str(limit),
                "access_token": access_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()

                if "error" in data:
                    error = data["error"]
                    logger.error(f"Ошибка получения медиа: {error.get('message', data)}")
                    return []

                media_list = data.get("data", [])
                result = []
                for media in media_list:
                    likes = media.get("like_count", 0)
                    comments = media.get("comments_count", 0)
                    engagement = likes + comments

                    row = {
                        "id": media.get("id", ""),
                        "caption": media.get("caption", "")[:200] if media.get("caption") else "",
                        "timestamp": media.get("timestamp", ""),
                        "like_count": likes,
                        "comments_count": comments,
                        "media_type": media.get("media_type", ""),
                        "engagement": engagement,
                        "score": engagement,
                    }
                    if with_insights:
                        ins = await get_media_insights(row["id"], row["media_type"])
                        row["reach"] = ins.get("reach", 0)
                        row["saved"] = ins.get("saved", 0)
                        row["shares"] = ins.get("shares", 0)
                        row["score"] = engagement + 2 * row["saved"] + 3 * row["shares"]
                    result.append(row)

                logger.info(f"📊 Получено {len(result)} публикаций из Instagram{' (+insights)' if with_insights else ''}.")
                return result
    except Exception as e:
        logger.error(f"Ошибка при получении медиа: {e}", exc_info=True)
        return []

async def _fetch_media(edge: str, fields: str, limit: int) -> list:
    ig_account_id = getattr(settings, "instagram_account_id", "")
    access_token = getattr(settings, "instagram_access_token", "")

    if not ig_account_id or not access_token:
        logger.warning("Instagram Graph API не настроен — медиа недоступно.")
        return []

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{ig_account_id}/{edge}"
            params = {
                "fields": fields,
                "limit": str(limit),
                "access_token": access_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                if "error" in data:
                    logger.error(f"Ошибка получения /{edge}: {data['error'].get('message', data)}")
                    return []
                return data.get("data", [])
    except Exception as e:
        logger.error(f"Ошибка при запросе /{edge}: {e}", exc_info=True)
        return []

async def get_recent_media(limit: int = 5) -> list:
    media = await _fetch_media("media", "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp", limit)
    return [
        {
            "id": m.get("id", ""),
            "caption": m.get("caption") or "",
            "media_type": m.get("media_type", ""),
            "media_url": m.get("media_url") or m.get("thumbnail_url") or "",
            "permalink": m.get("permalink", ""),
            "timestamp": m.get("timestamp", ""),
            "source": "feed",
        }
        for m in media
    ]

async def get_recent_stories(limit: int = 10) -> list:
    media = await _fetch_media("stories", "id,media_type,media_url,permalink,timestamp", limit)
    return [
        {
            "id": m.get("id", ""),
            "caption": "",
            "media_type": m.get("media_type", ""),
            "media_url": m.get("media_url", ""),
            "permalink": m.get("permalink", ""),
            "timestamp": m.get("timestamp", ""),
            "source": "story",
        }
        for m in media
    ]

async def get_top_posts(limit: int = 5) -> list:
    fetch_limit = max(limit * 3, 15)
    all_media = await get_recent_media_stats(limit=fetch_limit, with_insights=True)

    if not all_media:
        logger.info("Нет данных для определения топ-постов.")
        return []

    sorted_media = sorted(all_media, key=lambda x: x.get("score", x["engagement"]), reverse=True)
    top = sorted_media[:limit]

    if top:
        b = top[0]
        logger.info(
            f"🏆 Топ-{len(top)} постов: лучший score={b.get('score')} "
            f"(👍{b['like_count']} 💬{b['comments_count']} "
            f"🔖{b.get('saved', 0)} 🔁{b.get('shares', 0)} 👁{b.get('reach', 0)})"
        )
    return top
