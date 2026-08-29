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
from aiogram.types import (
    Message,
    CallbackQuery,
    FSInputFile,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)

from shared.config import settings
from shared.ai_engine import AIEngine
from shared.brand import BRAND_TEXT_STYLE

logger = logging.getLogger(__name__)
router = Router()
ai = AIEngine()

# token -> {"caption": str, "image": str|None, "kind": "feed"|"story", "topic": str}
PENDING_POSTS: dict = {}
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


def _kb(token: str) -> InlineKeyboardMarkup:
    """Две кнопки публикации — и это не удобство, а согласие.

    «В Instagram» и «в Instagram и Telegram-канал» — разные по охвату
    действия, и второе владелец должен выбрать сам. Дописать канал в
    существующую кнопку значило бы расширить рассылку молча: одобряли
    сторис, а вышел пост подписчикам канала.
    """
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Опубликовать в Instagram",
                    callback_data=f"autopost:pub:{token}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="📣 Instagram и Telegram-канал",
                    callback_data=f"autopost:pub_all:{token}",
                ),
                InlineKeyboardButton(
                    text="❌ Отмена", callback_data=f"autopost:cancel:{token}"
                ),
            ],
        ]
    )


def _drop_temp(post: dict) -> None:
    """Убрать временную картинку одобренного или отменённого поста."""
    img = post.get("image")
    if img and str(img).startswith(str(_STORE_DIR)) and os.path.isfile(img):
        try:
            os.remove(img)
        except OSError as exc:
            logger.warning("autopost: не удалил временный файл %s: %s", img, exc)


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

    token = uuid.uuid4().hex[:8]
    PENDING_POSTS[token] = {
        "caption": caption,
        "image": image_path,
        "kind": kind,
        "topic": topic,
    }
    if len(PENDING_POSTS) > 40:
        for old in list(PENDING_POSTS.keys())[:-40]:
            PENDING_POSTS.pop(old, None)

    preview_head = "📸 <b>Превью поста</b> — проверьте и подтвердите публикацию:\n\n"
    body = caption if len(caption) < 900 else caption[:900] + "…"
    try:
        if image_path and os.path.isfile(image_path):
            await message.answer_photo(
                FSInputFile(image_path),
                caption=preview_head + body,
                reply_markup=_kb(token),
                parse_mode="HTML",
            )
        else:
            await message.answer(
                preview_head + body, reply_markup=_kb(token), parse_mode="HTML"
            )
    except Exception:
        await message.answer(preview_head + body, reply_markup=_kb(token))


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


@router.callback_query(F.data.startswith("autopost:pub:"))
async def approve_publish(cb: CallbackQuery):
    if not _is_admin(cb.message) and cb.from_user.id not in settings.admin_telegram_ids:
        await cb.answer("⛔ Только для руководителя")
        return
    token = cb.data.split(":")[-1]
    post = PENDING_POSTS.pop(token, None)
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception as exc:
        # Кнопки уже убраны или сообщение устарело — не повод прерывать
        # обработку, но и молчать нельзя: сюда же попадёт отзыв прав бота.
        logger.debug("autopost: не убрал кнопки под сообщением: %s", exc)
    if not post:
        await cb.answer("Пост устарел или уже обработан")
        return
    await cb.answer("Публикую…")
    await cb.message.answer("⏳ Публикую в Instagram…")

    from shared.instagram import post_to_instagram

    ok = False
    try:
        if post.get("image"):
            ok = await post_to_instagram(
                post["image"], post["caption"], post_type=post.get("kind", "feed")
            )
        else:
            await cb.message.answer(
                "⚠️ Нет картинки для публикации — публикация в Instagram отменена."
            )
    except Exception as e:
        logger.error(f"autopost publish error: {e}", exc_info=True)

    if ok:
        await cb.message.answer(
            "✅ <b>Опубликовано в Instagram!</b>", parse_mode="HTML"
        )
    else:
        await cb.message.answer(
            "⚠️ Не удалось опубликовать в Instagram (проверьте токен/доступ Graph API). "
            "Текст и картинка выше — можно опубликовать вручную.",
            parse_mode="HTML",
        )
    _drop_temp(post)


@router.callback_query(F.data.startswith("autopost:pub_all:"))
async def approve_publish_all(cb: CallbackQuery):
    """Один пост — Instagram и Telegram-канал сразу.

    Раскладывает его единый издатель (`shared/publisher.py`): Instagram
    напрямую, канал — через дверь витрины, потому что токен витринного
    бота живёт там, а прямых импортов между приложениями нет.
    """
    if not _is_admin(cb.message) and cb.from_user.id not in settings.admin_telegram_ids:
        await cb.answer("⛔ Только для руководителя")
        return
    token = cb.data.split(":")[-1]
    post = PENDING_POSTS.pop(token, None)
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception as exc:
        logger.debug("autopost: не убрал кнопки под сообщением: %s", exc)
    if not post:
        await cb.answer("Пост устарел или уже обработан")
        return

    await cb.answer("Публикую…")
    await cb.message.answer("⏳ Публикую в Instagram и Telegram-канал…")

    from shared.publisher import Post, publish

    report = await publish(
        Post(
            title=post.get("topic", "Microgreen Uzbekistan"),
            body=post["caption"],
            image=post.get("image"),
            kind=post.get("kind", "feed"),
        ),
        ["instagram", "telegram_channel"],
    )

    # Отчёт по каждой цели отдельно: «опубликовано» без разбора скрыло бы
    # то, что в Instagram пост не ушёл, а владелец бы этого не узнал.
    lines = []
    for target, result in report.items():
        name = "Instagram" if target == "instagram" else "Telegram-канал"
        if result.get("ok"):
            note = " (без картинки)" if result.get("photo_lost") else ""
            lines.append(f"✅ {name}{note}")
        else:
            lines.append(f"⚠️ {name}: {result.get('error', 'не удалось')}")
    await cb.message.answer("\n".join(lines) or "Не выбрано ни одной площадки")

    _drop_temp(post)


@router.callback_query(F.data.startswith("autopost:cancel:"))
async def cancel_post(cb: CallbackQuery):
    token = cb.data.split(":")[-1]
    post = PENDING_POSTS.pop(token, None)
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception as exc:
        # Кнопки уже убраны или сообщение устарело — не повод прерывать
        # обработку, но и молчать нельзя: сюда же попадёт отзыв прав бота.
        logger.debug("autopost: не убрал кнопки под сообщением: %s", exc)
    if post:
        _drop_temp(post)
    await cb.answer("Отменено")
    await cb.message.answer("❌ Публикация отменена.")
