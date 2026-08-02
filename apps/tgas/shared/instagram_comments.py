"""
Microgreen Uzbekistan — Instagram Comments Auto-Reply
=====================================================
Авто-ответ на комментарии под постами Instagram.

Логика (публичная фича — потому осторожно):
- Берём последние посты и их комментарии через Graph API.
- Публично отвечаем ТОЛЬКО на комментарии-вопросы/интерес (цена, наличие,
  доставка, «как заказать» и т.п.) за последние 48 часов.
- Свои комментарии и уже обработанные — пропускаем (таблица ig_comment_seen).
- На каждый прогон — лимит ответов (чтобы не «залить» фид на первом запуске).
- О каждом ответе уведомляем руководителя (лид) через event_bus → Степан.
"""

import logging
import aiohttp
from datetime import datetime, timezone
from shared.config import settings
from shared.ai_engine import AIEngine

logger = logging.getLogger(__name__)

API_VERSION = "v21.0"
GRAPH_BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

OUR_HANDLE = "microgreenuzbekistan"  # наш аккаунт — на свои комменты не отвечаем
REPLY_WINDOW_HOURS = 48  # отвечаем только на свежие комментарии
MAX_REPLIES_PER_RUN = 8  # предохранитель от флуда

ai = AIEngine()

# Ключевые слова «интереса/вопроса» — только на них публично отвечаем
_INQUIRY_WORDS = [
    "цена",
    "цен",
    "стои",
    "сколько",
    "почём",
    "почем",
    "narx",
    "qancha",
    "достав",
    "yetkaz",
    "заказ",
    "buyurtma",
    "купить",
    "sotib",
    "заказать",
    "наличи",
    "есть в",
    " бор",
    "boru",
    "available",
    "how much",
    "price",
    "адрес",
    "manzil",
    "номер",
    "telefon",
    "телефон",
    "склад",
]

REPLY_SYSTEM = (
    "Ты — SMM-менеджер Microgreen Uzbekistan (микрозелень, салаты, съедобные цветы, Самарканд). "
    "Отвечаешь на комментарий под постом в Instagram — вежливо, тепло, КОРОТКО (1-2 предложения), "
    "с 1 эмодзи. Отвечай на языке комментария (русский/узбекский). Не упоминай, что ты бот. "
    "Если спрашивают цену/наличие/как заказать — коротко направь в Директ или на номер "
    "+998 94 999 95 99. Без длинных списков."
)


def _is_inquiry(text: str) -> bool:
    if not text:
        return False
    low = text.lower()
    return "?" in text or any(w in low for w in _INQUIRY_WORDS)


async def _ensure_seen_table():
    # Таблица ig_comment_seen управляется Prisma (schema.prisma).
    # CREATE TABLE IF NOT EXISTS больше не нужен.
    pass


async def _already_seen(comment_id: str) -> bool:
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        async with get_session_ctx() as s:
            r = await s.execute(
                text("SELECT 1 FROM ig_comment_seen WHERE comment_id = :c"),
                {"c": comment_id},
            )
            return r.fetchone() is not None
    except Exception:
        return False


async def _mark_seen(comment_id: str):
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        async with get_session_ctx() as s:
            await s.execute(
                text(
                    "INSERT INTO ig_comment_seen (comment_id) VALUES (:c) ON CONFLICT DO NOTHING"
                ),
                {"c": comment_id},
            )
            await s.commit()
    except Exception as e:
        logger.warning(f"mark_seen error: {e}")


async def get_recent_comments(media_limit: int = 8, per_media: int = 30) -> list:
    """Список комментариев последних постов: {id, text, username, timestamp, media_id}."""
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
                    logger.error(
                        f"IG comments media error: {data['error'].get('message')}"
                    )
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


async def _notify_owner(username: str, comment: str, reply: str):
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


async def auto_reply_to_comments():
    """Главный цикл: отвечает на свежие комментарии-вопросы, остальное помечает просмотренным."""
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

        # свои комментарии — не отвечаем
        if (c.get("username") or "").lower() == OUR_HANDLE:
            await _mark_seen(cid)
            continue

        # свежесть
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
            # просмотрено, публичный ответ не нужен
            await _mark_seen(cid)

    if replied:
        logger.info(f"IG comments: отвечено на {replied} комментариев")
