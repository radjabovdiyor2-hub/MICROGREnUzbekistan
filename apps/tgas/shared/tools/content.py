"""
Инструменты контента: публикации, картинки, готовый прайс-лист постом.

`build_price_list_post` — прямой ответ на «сделай прайс»: он собирает пост из
реального каталога, а не из головы модели. Отделу остаётся оформить текст вокруг
готовых строк с ценами.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from shared import capabilities, catalog_repo
from shared.database import get_session_ctx
from shared.tools.registry import Tool, from_capability, register
from shared.utils import format_price

logger = logging.getLogger(__name__)

DEPTS = ["content"]


async def build_price_list_post(category: Optional[str] = None) -> Dict[str, Any]:
    """Готовые строки прайса для поста/сторис — из каталога."""
    items = await catalog_repo.list_active(category)
    if not items:
        return {
            "ok": False,
            "message": "В каталоге нет активных товаров — прайс собрать не из чего.",
        }
    return {
        "ok": True,
        "currency": "UZS",
        "lines": [
            {
                "name": item["name"],
                "price": item["price"],
                "price_text": format_price(item["price"]),
                "unit": item["unit"],
                "in_stock": item["stock"] > 0,
                "category": item["category_slug"],
            }
            for item in items
        ],
        "note": (
            "Цены брать только отсюда. Позиции с in_stock=false подавать как "
            "«под заказ», а не как доступные."
        ),
    }


async def publish_content(text_body: str = "", kind: str = "post") -> Dict[str, Any]:
    """Опубликовать контент через контент-бот."""
    result = await capabilities.run_capability(
        "publish_content", {"text": text_body, "kind": kind}
    )
    return from_capability(result)


async def generate_image(prompt: str) -> Dict[str, Any]:
    """Сгенерировать изображение в фирменном стиле."""
    # Импорт внутри функции намеренно: пакет mg_ai ставится только в контейнере,
    # а реестр инструментов должен собираться и вне Docker — иначе статические
    # сверки (scripts/check_tools.py) падали бы на импорте движка.
    try:
        from shared.ai_engine import AIEngine

        path = await AIEngine().generate_image(prompt, size="1024x1024")
    except Exception as exc:
        logger.warning("TOOLS: генерация картинки не удалась: %s", exc)
        return {"ok": False, "message": f"Не смог сгенерировать изображение: {exc}"}
    if not path:
        return {"ok": False, "message": "Генератор изображений не ответил."}
    return {"ok": True, "image": path}


async def get_content_schedule() -> Dict[str, Any]:
    """Расписание автопубликаций — чтобы не публиковать вручную то, что выйдет само."""
    return {
        "schedule": [
            {"what": "Рецепт дня", "when": "ежедневно 18:00"},
            {"what": "Утренний сторис", "when": "07:15 (лето) / 08:15 (зима)"},
            {"what": "Пост недели в ленту", "when": "суббота 12:00"},
        ],
        "note": (
            "Всё перечисленное публикуется автоматически по расписанию. "
            "Если задача про эти слоты — отдельная публикация не нужна, "
            "ответь расписанием."
        ),
    }


async def create_poll(
    question: str, options: List[str], chat_id: Optional[int] = None
) -> Dict[str, Any]:
    """Отправить опрос в чат задачи."""
    if not chat_id:
        return {"ok": False, "message": "Не знаю, в какой чат отправлять опрос."}
    clean = [str(o) for o in (options or []) if str(o).strip()][:10]
    if len(clean) < 2:
        return {"ok": False, "message": "Для опроса нужно минимум два варианта."}

    bot = _content_bot()
    if bot is None:
        return {"ok": False, "message": "Токен контент-бота не настроен."}
    try:
        await bot.send_poll(chat_id, question=question, options=clean)
        return {"ok": True, "question": question, "options": clean}
    except Exception as exc:
        return {"ok": False, "message": f"Опрос не отправлен: {exc}"}
    finally:
        await bot.session.close()


async def publish_story(text_body: str, headline: str = "") -> Dict[str, Any]:
    """Опубликовать сторис в Instagram: картинка 9:16 с заголовком + текст."""
    from shared.instagram import post_story_with_text

    title = (headline or text_body[:40]).strip()
    # Промпт под вертикальный сторис: типографика вписывается в картинку, потому
    # что Instagram Stories API не поддерживает подписи и стикеры.
    prompt = (
        "A vibrant, highly detailed vertical (9:16) Instagram Stories image. "
        f"Scene context: {text_body[:200]}. "
        f'The image MUST contain the bold typography text "{title}" placed elegantly. '
        f'DO NOT TRANSLATE THE TEXT. USE THE EXACT CYRILLIC/LATIN CHARACTERS: "{title}". '
        "Absolutely no other text or English words on the image."
    )
    image = await generate_image(prompt)
    if not image.get("ok"):
        return image

    ok = await post_story_with_text(image["image"], title, text_body)
    return {
        "ok": bool(ok),
        "image": image["image"],
        "message": (
            "Сторис опубликован в Instagram."
            if ok
            else "Картинка готова, но публикация в Instagram не прошла."
        ),
    }


def _content_bot():
    """Экземпляр контент-бота для отправки в чат. None — токена нет."""
    from shared.config import settings

    token = getattr(settings, "content_bot_token", None)
    if not token:
        return None
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode

    return Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))


async def get_content_status() -> Dict[str, Any]:
    """Что уже опубликовано сегодня и что ещё по плану."""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT slot, published_at, ig_posted, title FROM content_publications "
                    "WHERE date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') ORDER BY slot"
                )
            )
        ).fetchall()
    return {
        "published_today": len([r for r in rows if r[1]]),
        "slots": [
            {
                "slot": r[0],
                "published_at": r[1],
                "instagram": bool(r[2]),
                "title": r[3],
            }
            for r in rows
        ],
    }


register(
    Tool(
        name="build_price_list_post",
        description=(
            "Готовые строки прайс-листа из каталога для поста, сторис или "
            "коммерческого предложения. ВСЕГДА вызывай перед тем, как писать "
            "текст с ценами: выдумывать цены запрещено."
        ),
        run=build_price_list_post,
        departments=DEPTS,
        params={"category": {"type": "string", "description": "Слаг категории, необязательно"}},
    )
)

register(
    Tool(
        name="publish_content",
        description="Опубликовать пост или сторис в наших каналах.",
        run=publish_content,
        departments=DEPTS,
        params={
            "text_body": {"type": "string", "description": "Текст публикации"},
            "kind": {
                "type": "string",
                "enum": ["post", "story", "reel"],
                "description": "Формат",
            },
        },
        required=["text_body"],
        risky=True,
        confirm=lambda a: (
            f"Опубликовать {a.get('kind') or 'post'}: {str(a.get('text_body'))[:80]}…"
        ),
    )
)

register(
    Tool(
        name="generate_image",
        description="Сгенерировать изображение в фирменном стиле по описанию (на английском).",
        run=generate_image,
        departments=DEPTS,
        params={"prompt": {"type": "string", "description": "Описание картинки на английском"}},
        required=["prompt"],
    )
)

register(
    Tool(
        name="get_content_status",
        description="Статус публикаций на сегодня: что вышло, что ещё по плану.",
        run=get_content_status,
        departments=DEPTS,
    )
)

register(
    Tool(
        name="get_content_schedule",
        description=(
            "Расписание автопубликаций. Вызывай, когда спрашивают «во сколько», "
            "«какой график», «опубликовали ли», «статус публикаций» — и НЕ публикуй "
            "ничего вручную, если задача про эти слоты."
        ),
        run=get_content_schedule,
        departments=DEPTS,
    )
)

register(
    Tool(
        name="create_poll",
        description="Отправить опрос (голосование, викторину) в чат задачи.",
        run=create_poll,
        departments=DEPTS,
        params={
            "question": {"type": "string", "description": "Вопрос опроса"},
            "options": {
                "type": "array",
                "description": "Варианты ответа, от 2 до 10",
                "items": {"type": "string"},
            },
        },
        required=["question", "options"],
    )
)

register(
    Tool(
        name="publish_story",
        description=(
            "Опубликовать сторис в Instagram: сгенерировать вертикальную картинку "
            "с заголовком и выложить её. Вызывай для «сторис», «выложи в инстаграм»."
        ),
        run=publish_story,
        departments=DEPTS,
        params={
            "text_body": {"type": "string", "description": "Текст сторис"},
            "headline": {
                "type": "string",
                "description": "Броский заголовок в 2-4 слова для впечатывания в картинку",
            },
        },
        required=["text_body"],
        risky=True,
        confirm=lambda a: (
            f"Опубликовать сторис в Instagram: «{str(a.get('headline') or a.get('text_body'))[:60]}»"
        ),
    )
)
