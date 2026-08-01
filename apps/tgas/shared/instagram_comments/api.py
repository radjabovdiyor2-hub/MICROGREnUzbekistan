import logging
import aiohttp
from shared.config import settings
from shared.instagram_comments.core import GRAPH_BASE_URL

logger = logging.getLogger(__name__)

async def get_recent_comments(media_limit: int = 8, per_media: int = 30) -> list:
    token = getattr(settings, "instagram_access_token", "").strip("'\"")
    ig_id = getattr(settings, "instagram_account_id", "").strip("'\"")
    if not token or not ig_id:
        logger.warning("IG comments: токен/аккаунт не настроены")
        return []

    out = []
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{ig_id}/media"
            params = {"fields": "id", "limit": str(media_limit), "access_token": token}
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                if "error" in data:
                    logger.error(f"IG comments media error: {data['error'].get('message')}")
                    return []
                media_ids = [m["id"] for m in data.get("data", [])]

            for mid in media_ids:
                curl = f"{GRAPH_BASE_URL}/{mid}/comments"
                cparams = {
                    "fields": "id,text,username,timestamp",
                    "limit": str(per_media),
                    "access_token": token,
                }
                async with session.get(curl, params=cparams) as cresp:
                    cdata = await cresp.json()
                    if "error" in cdata:
                        continue
                    for c in cdata.get("data", []):
                        out.append(
                            {
                                "id": c.get("id"),
                                "text": c.get("text", ""),
                                "username": c.get("username", ""),
                                "timestamp": c.get("timestamp", ""),
                                "media_id": mid,
                            }
                        )
    except Exception as e:
        logger.error(f"IG comments fetch error: {e}", exc_info=True)
    return out

async def reply_to_comment(comment_id: str, message: str) -> bool:
    token = getattr(settings, "instagram_access_token", "").strip("'\"")
    if not token or not comment_id:
        return False
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{comment_id}/replies"
            async with session.post(
                url, data={"message": message, "access_token": token}
            ) as resp:
                data = await resp.json()
                if "error" in data:
                    logger.error(f"IG reply error: {data['error'].get('message')}")
                    return False
                logger.info(f"✅ Ответ на комментарий {comment_id} опубликован")
                return True
    except Exception as e:
        logger.error(f"IG reply exception: {e}", exc_info=True)
        return False
