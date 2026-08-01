import logging
import aiohttp
from shared.config import settings
from shared.instagram_dm.state import GRAPH_BASE_URL, _processed_message_ids

logger = logging.getLogger(__name__)

async def check_new_messages() -> list:
    ig_account_id = getattr(settings, "instagram_account_id", "").strip("'\"")
    access_token = getattr(settings, "instagram_access_token", "").strip("'\"")
    page_id = getattr(settings, "facebook_page_id", "").strip("'\"")

    if not ig_account_id or not access_token or not page_id:
        logger.warning("Instagram Graph API не настроен. Невозможно проверить DM.")
        return []

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{page_id}/conversations"
            params = {
                "platform": "instagram",
                "access_token": access_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()

                if "error" in data:
                    error = data["error"]
                    logger.error(f"Ошибка получения DM (conversations): {error.get('message', data)}")
                    return []

                conversations = data.get("data", [])
                new_messages = []

                for conversation in conversations:
                    conv_id = conversation.get("id", "")
                    if not conv_id:
                        continue

                    msg_url = f"{GRAPH_BASE_URL}/{conv_id}"
                    msg_params = {
                        "fields": "messages{message,from,created_time}",
                        "access_token": access_token,
                    }
                    async with session.get(msg_url, params=msg_params) as msg_resp:
                        msg_data = await msg_resp.json()
                        messages_data = msg_data.get("messages", {}).get("data", [])

                        for msg in messages_data:
                            msg_id = msg.get("id", "")
                            if msg_id in _processed_message_ids:
                                continue

                            from_data = msg.get("from", {})
                            from_username = from_data.get("username", "")
                            from_id = from_data.get("id", "")

                            if from_username == "microgreenuzbekistan" or from_id == ig_account_id:
                                continue

                            new_messages.append(
                                {
                                    "conversation_id": conv_id,
                                    "message_id": msg_id,
                                    "text": msg.get("message", ""),
                                    "from_name": from_username or "Пользователь",
                                    "from_id": from_id,
                                    "created_time": msg.get("created_time", ""),
                                }
                            )

                if new_messages:
                    logger.info(f"📨 Найдено {len(new_messages)} новых DM в Instagram.")
                return new_messages
    except Exception as e:
        logger.error(f"Ошибка при проверке DM: {e}", exc_info=True)
        return []


async def send_dm_reply(recipient_id: str, message: str) -> bool:
    access_token = getattr(settings, "instagram_access_token", "").strip("'\"")
    page_id = getattr(settings, "facebook_page_id", "").strip("'\"")

    if not access_token or not page_id:
        logger.error("INSTAGRAM_ACCESS_TOKEN или FACEBOOK_PAGE_ID не установлен.")
        return False

    if not recipient_id:
        logger.error("Не указан recipient_id (IGSID) для отправки ответа.")
        return False

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{page_id}/messages"
            payload = {
                "recipient": {"id": recipient_id},
                "message": {"text": message},
                "messaging_type": "RESPONSE",
                "access_token": access_token,
            }
            async with session.post(url, json=payload) as resp:
                data = await resp.json()
                if "error" in data:
                    error = data["error"]
                    logger.error(f"Ошибка отправки DM: {error.get('message', data)}")
                    return False

                logger.info(f"✅ Ответ отправлен в DM (recipient: {recipient_id})")
                return True
    except Exception as e:
        logger.error(f"Ошибка при отправке DM: {e}", exc_info=True)
        return False
