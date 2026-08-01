import logging
from datetime import datetime, timezone
from shared.config import settings
from shared.instagram_comments.core import _INQUIRY_WORDS, REPLY_SYSTEM, ai, OUR_HANDLE, REPLY_WINDOW_HOURS, MAX_REPLIES_PER_RUN
from shared.instagram_comments.db import _ensure_seen_table, _already_seen, _mark_seen
from shared.instagram_comments.api import get_recent_comments, reply_to_comment

logger = logging.getLogger(__name__)

def _is_inquiry(text: str) -> bool:
    if not text:
        return False
    low = text.lower()
    return "?" in text or any(w in low for w in _INQUIRY_WORDS)

async def _gen_reply(comment_text: str) -> str:
    try:
        return (
            await ai.chat_completion(
                REPLY_SYSTEM,
                f"Комментарий клиента: {comment_text}",
                temperature=0.6,
                max_tokens=120,
                effort="medium",
            )
        ).strip()
    except Exception as e:
        logger.warning(f"IG reply gen error: {e}")
        return "Спасибо за интерес! Напишите нам в Директ или на +998 94 999 95 99 — всё расскажем 🌱"

async def _notify_owner(username: str, comment: str, reply: str) -> None:
    try:
        from shared.event_bus import event_bus

        txt = (
            f"💬 <b>Instagram-комментарий</b> от @{username}:\n«{comment[:200]}»\n\n"
            f"🤖 Ответили: «{reply[:200]}»"
        )
        await event_bus.publish(
            "new_message",
            {"bot": "Instagram — комментарии", "text": txt},
            "support_bot",
        )
    except Exception as e:
        logger.warning(f"IG comment notify error: {e}")

async def auto_reply_to_comments() -> None:
    if not getattr(settings, "ig_comments_autoreply_enabled", True):
        return
    await _ensure_seen_table()
    comments = await get_recent_comments()
    if not comments:
        return

    now = datetime.now(timezone.utc)
    replied = 0
    for c in comments:
        cid = c.get("id")
        if not cid or await _already_seen(cid):
            continue

        if (c.get("username") or "").lower() == OUR_HANDLE:
            await _mark_seen(cid)
            continue

        recent = True
        ts = (c.get("timestamp") or "").replace("Z", "+00:00")
        try:
            age_h = (now - datetime.fromisoformat(ts)).total_seconds() / 3600
            recent = age_h <= REPLY_WINDOW_HOURS
        except Exception:
            recent = True

        if recent and _is_inquiry(c.get("text", "")) and replied < MAX_REPLIES_PER_RUN:
            reply = await _gen_reply(c["text"])
            ok = await reply_to_comment(cid, reply)
            await _mark_seen(cid)
            if ok:
                replied += 1
                await _notify_owner(c.get("username", "?"), c.get("text", ""), reply)
        else:
            await _mark_seen(cid)

    if replied:
        logger.info(f"IG comments: отвечено на {replied} комментариев")
