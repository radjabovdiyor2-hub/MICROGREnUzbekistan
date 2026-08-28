"""
📸 Автопост с подтверждением (идея №3)
========================================
Руководитель пишет контент-боту: «/post польза витграсса» или
«сделай пост про витграсс» → бот генерит текст+картинку, присылает
ПРЕВЬЮ с кнопками, и публикует в Instagram ТОЛЬКО после «✅ Опубликовать».
"""

import logging
import os
import re
import shutil
import uuid
from pathlib import Path

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message

from shared import approvals
from shared.config import settings
from shared.ai_engine import AIEngine
from shared.brand import BRAND_TEXT_STYLE

logger = logging.getLogger(__name__)
router = Router()
ai = AIEngine()

# ⚠️ ЗДЕСЬ БЫЛ СВОЙ СЛОВАРЬ ЗАЯВОК — `PENDING_POSTS` в памяти процесса.
#
# Два изъяна разом. Во-первых, механизм подтверждения в проекте ОДИН
# (`shared/approvals.py`), и три предыдущие самодельные копии уже свели к
# нему — эта осталась четвёртой. Во-вторых, ровно из-за того, из-за чего
# сводили: выкатка стирала словарь, владелец нажимал «Опубликовать» и
# получал «Пост устарел», а сгенерированная картинка (платный вызов
# модели) оставалась сиротой в bus_tasks.
#
# Теперь заявка лежит в `owner_approvals` и переживает рестарт. Картинка
# показывается отдельным сообщением — `approvals.request(photo=...)`.
_STORE_DIR = Path(__file__).resolve().parents[3] / "bus_tasks"


def _is_admin(message: Message) -> bool:
    return (
        bool(message.from_user) and message.from_user.id in settings.admin_telegram_ids
    )


def _extract_topic(text: str) -> str:
    """Вытащить тему из «сделай пост про X» / «пост о X»."""
    t = text.strip()
    m = re.search(r"(?:про|о|об|на тему|about)\s+(.+)", t, re.IGNORECASE)
    if m:
        return m.group(1).strip(" .!?")
    # убираем командные слова, остальное — тема
    t = re.sub(
        r"(?i)\b(сделай|сделать|напиши|запили|опубликуй|сгенерируй|пост|в инстаграм[е]?|instagram|сторис|story)\b",
        "",
        t,
    )
    return t.strip(" .!?:") or "микрозелень"


async def _generate_and_preview(message: Message, topic: str, kind: str = "feed"):
    from bots.content_bot.main import get_dynamic_content_policy
    await message.answer(f"🎨 Генерирую пост про «{topic}»… это займёт ~30–60 сек.")

    # 1. Текст поста (бренд-стиль)
    try:
        caption = await ai.chat_completion(
            "Ты главный SMM-редактор бренда Microgreen Uzbekistan. Пиши сильный, "
            "ценный пост для ленты Instagram с пользой и чётким призывом к действию."
            + BRAND_TEXT_STYLE
            + (await get_dynamic_content_policy()),
            f"Создай пост для Instagram на тему: «{topic}». 3–6 абзацев, живо, с эмодзи, "
            f"в конце — призыв к действию и контакты. Пиши на русском (или узбекском, если тема того требует).",
            temperature=0.8,
            max_tokens=700,
        )
    except Exception as e:
        logger.error(f"autopost caption error: {e}")
        await message.answer("😔 Не удалось сгенерировать текст. Попробуйте ещё раз.")
        return

    # 2. Картинка (чистая, без текста)
    image_prompt = (
        f"Photorealistic premium {'square 1:1' if kind == 'feed' else 'vertical 9:16'} "
        f"Instagram photo for a microgreens brand. Theme: {topic}. Fresh microgreens, "
        f"beautiful plating, natural soft light, clean aesthetic composition. "
        f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
    )
    image_path = None
    try:
        size = "1024x1024" if kind == "feed" else "1024x1792"
        img = await ai.generate_image(image_prompt, size=size)
        if img and os.path.isfile(img):
            # копируем в уникальный файл, чтобы не затёрся другой генерацией до одобрения
            _STORE_DIR.mkdir(exist_ok=True)
            uniq = _STORE_DIR / f"autopost_{uuid.uuid4().hex[:8]}.jpg"
            shutil.copy(img, uniq)
            image_path = str(uniq)
        elif img:
            image_path = img  # это URL
    except Exception as e:
        logger.warning(f"autopost image error: {e}")

    body = caption if len(caption) < 900 else caption[:900] + "…"
    await approvals.request(
        message.bot,
        message.chat.id,
        "instagram_post",
        {"caption": caption, "image": image_path, "kind": kind, "topic": topic},
        summary=f"Опубликовать в Instagram: {topic}",
        bot_name="content_bot",
        details=body,
        photo=image_path or None,
    )


@router.message(Command("post"))
async def cmd_post(message: Message, command=None):
    if not _is_admin(message):
        return
    args = (getattr(command, "args", None) or "").strip()
    if not args:
        await message.answer(
            "📝 Формат: <code>/post тема поста</code>\nНапример: <code>/post польза витграсса</code>",
            parse_mode="HTML",
        )
        return
    await _generate_and_preview(message, args, kind="feed")


# Естественный язык: «сделай пост про …», «опубликуй пост о …»
@router.message(
    F.text.regexp(r"(?i)(сдела|напиши|запили|опубликуй|сгенерир).{0,20}пост")
)
async def nl_post(message: Message):
    if not _is_admin(message):
        return
    topic = _extract_topic(message.text)
    await _generate_and_preview(message, topic, kind="feed")


# ── Публикация после одобрения ───────────────────────────────────────────
#
# Обработчик регистрируется в общем механизме, а не ловит свой
# `callback_data`: кнопки рисует `approvals`, решение хранит
# `owner_approvals`, а сюда приходит только payload заявки.
#
# Возвращаемая строка дописывается в карточку — по ней владелец видит,
# опубликовалось ли на самом деле, а не «команда принята».
async def _publish_approved(payload: dict, callback) -> str:
    from shared.instagram import post_to_instagram

    image = payload.get("image")
    caption = payload.get("caption") or ""

    if not image:
        return "⚠️ Нет картинки — публикация отменена."

    ok = False
    try:
        ok = await post_to_instagram(
            image, caption, post_type=payload.get("kind", "feed")
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("autopost: публикация не удалась: %s", exc, exc_info=True)

    _cleanup(image)

    if ok:
        return "✅ Опубликовано в Instagram."
    return (
        "⚠️ Не удалось опубликовать (проверьте токен и доступ Graph API). "
        "Текст и картинка выше — можно опубликовать вручную."
    )


async def _discard_post(payload: dict, callback) -> str:
    """Отклонили — временную картинку держать незачем."""
    _cleanup(payload.get("image"))
    return ""


def _cleanup(image) -> None:
    """Убрать временный файл превью. URL и чужие пути не трогаем."""
    if not image or not str(image).startswith(str(_STORE_DIR)):
        return
    if not os.path.isfile(image):
        return
    try:
        os.remove(image)
    except OSError as exc:
        logger.warning("autopost: не удалил временный файл %s: %s", image, exc)


approvals.register_handler("instagram_post", _publish_approved)
approvals.register_reject_handler("instagram_post", _discard_post)
