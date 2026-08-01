import logging
import os
from typing import Any

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse, PlainTextResponse

from shared.event_bus import event_bus

logger = logging.getLogger(__name__)

router = APIRouter()

META_WEBHOOK_VERIFY_TOKEN = os.getenv("META_WEBHOOK_VERIFY_TOKEN")

@router.get("/webhooks/meta")
async def verify_meta_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
) -> Any:
    if hub_mode == "subscribe" and hub_verify_token == META_WEBHOOK_VERIFY_TOKEN:
        logger.info("Meta webhook verified successfully")
        return PlainTextResponse(hub_challenge)
    logger.warning("Meta webhook verification failed: token mismatch")
    return PlainTextResponse("Verification failed", status_code=403)

@router.post("/webhooks/meta")
async def handle_meta_webhook(request: Request) -> Any:
    try:
        body = await request.json()
        logger.debug("Received Meta webhook: %s", body)

        if body.get("object") == "instagram":
            for entry in body.get("entry", []):
                for change in entry.get("changes", []):
                    field = change.get("field")
                    value = change.get("value", {})
                    if field == "comments":
                        await event_bus.publish(
                            "IG_COMMENT_RECEIVED",
                            {
                                "media_id": value.get("media_id"),
                                "comment_id": value.get("id"),
                                "text": value.get("text"),
                                "from_user": value.get("from", {}).get("username"),
                                "source": "instagram_webhook",
                            },
                            "web_office",
                        )
                    elif field == "messages":
                        await event_bus.publish(
                            "IG_MESSAGE_RECEIVED",
                            {
                                "message_id": value.get("message_id"),
                                "text": value.get("text"),
                                "from_user": value.get("sender", {}).get("id"),
                                "source": "instagram_webhook",
                            },
                            "web_office",
                        )
        return JSONResponse({"status": "ok"})
    except Exception as exc:
        logger.exception("Meta webhook handler error: %s", exc)
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=500)
