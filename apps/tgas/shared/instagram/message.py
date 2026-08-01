import logging
import aiohttp
from shared.config import settings

logger = logging.getLogger(__name__)

async def send_ig_message(recipient_id: str, text: str) -> bool:
    page_id = getattr(settings, "facebook_page_id", None)
    user_access_token = getattr(settings, "instagram_access_token", None)

    if not page_id or not user_access_token:
        logger.error("Missing facebook_page_id or instagram_access_token for IG messages.")
        return False

    try:
        async with aiohttp.ClientSession() as session:
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
            payload = {"recipient": {"id": recipient_id}, "message": {"text": text}}
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
