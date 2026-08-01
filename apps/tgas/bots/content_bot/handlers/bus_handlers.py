import logging
import os
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings
from shared.content_archive import (
    get_last_publications_async as get_last_publications,
    get_publications_async as get_publications,
    status_message_async as _content_status_message,
    tz_now as _tz_now,
)
from shared.ai_engine import AIEngine
from shared.brand import BRAND_TEXT_STYLE, CONTENT_POLICY
from shared.trends import fetch_uzbek_trends

logger = logging.getLogger(__name__)

async def bus_sync_publication_metrics(params: dict) -> dict:
    from shared.instagram_analytics import sync_publication_metrics, build_reach_report

    updated = await sync_publication_metrics()
    report = await build_reach_report()
    if not report.get("configured"):
        raise RuntimeError("Instagram Graph API не настроен: нет токена или доступа")

    return {
        "message": f"Метрики обновлены ({updated if updated is not None else '—'} публикаций)",
        "summary": report.get("summary", ""),
    }

async def bus_publish_story(params: dict) -> dict:
    topic = params.get("topic", "микрозелень")
    admin_id = settings.admin_telegram_ids[0]
    ai = AIEngine()

    post_text = await ai.chat_completion(
        "Ты SMM-менеджер Microgreen Uzbekistan." + BRAND_TEXT_STYLE + CONTENT_POLICY,
        f"Напиши короткий, цепляющий текст для Instagram Stories на тему: {topic}. "
        "Максимум 3-4 предложения, добавь эмодзи. На русском языке.",
    )

    headline = await ai.chat_completion(
        "Ты копирайтер.",
        f"Придумай ОДИН короткий, броский заголовок (максимум 2-4 слова) на ТОМ ЖЕ ЯЗЫКЕ, что и тема (узбекский или русский). Пиши ТОЛЬКО сам заголовок без кавычек:\nТема: {topic}",
    )

    image_prompt = (
        f"A beautiful vertical (9:16) Instagram Stories image. Topic: {topic}. "
        f"Style: modern, vibrant, appetizing, professional food photography. "
        f'The image MUST contain the bold typography text "{headline}" placed elegantly. '
        f'DO NOT TRANSLATE THE TEXT. USE THE EXACT CYRILLIC/LATIN CHARACTERS: "{headline}". '
        f"Absolutely no other text or English words on the image."
    )

    image_url = await ai.generate_image(image_prompt, size="1024x1792")

    if image_url:
        from aiogram.types import FSInputFile

        bot = Bot(token=settings.content_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        photo_file = FSInputFile(image_url) if os.path.isfile(image_url) else image_url
        await bot.send_photo(
            admin_id,
            photo=photo_file,
            caption=f"📸 <b>Сторис по запросу:</b> {topic}\n\n{post_text}",
            parse_mode="HTML",
        )
        await bot.session.close()

        from shared.instagram import post_story_with_text

        public_url = getattr(ai, "_last_image_url", image_url) or image_url
        success = await post_story_with_text(public_url, headline, post_text)
        status = (
            "опубликован в Instagram Stories"
            if success
            else "отправлен только в Telegram"
        )
        return {"status": "ok", "message": f"Сторис '{topic}' — {status}"}

    return {"status": "error", "message": "Не удалось сгенерировать изображение"}

async def bus_generate_meme(params: dict) -> dict:
    topic = params.get("topic", "микрозелень")
    admin_id = settings.admin_telegram_ids[0]
    ai = AIEngine()

    context = await fetch_uzbek_trends()

    meme_idea = await ai.chat_completion(
        "Ты топовый мемолог Узбекистана. Аудитория: молодёжь 18-35, женщины, ЗОЖники.",
        f"Тема: {topic}\n\nАКТУАЛЬНЫЙ КОНТЕКСТ:\n{context}\n\n"
        f"Создай вирусный мем связанный с темой '{topic}' и актуальными трендами. "
        f"Юмор для узбекской аудитории. На русском. Опиши сцену и пунчлайн.",
    )

    headline = await ai.chat_completion(
        "Ты редактор мемов.",
        f"Выдели ОДНУ смешную фразу (до 5 слов) на РУССКОМ. Без кавычек:\n{meme_idea}",
    )

    image_prompt = await ai.chat_completion(
        "Ты создатель мемов.",
        f"Промпт на английском для DALL-E 3 (funny meme, vertical for Instagram Stories). "
        f'Вписать текст: "{headline}" (bold white text, black outline, meme font). Ситуация: {meme_idea[:300]}',
    )
    image_url = await ai.generate_image(image_prompt, size="1024x1792")

    if image_url:
        from aiogram.types import FSInputFile

        bot = Bot(token=settings.content_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        photo_file = FSInputFile(image_url) if os.path.isfile(image_url) else image_url
        await bot.send_photo(
            admin_id,
            photo=photo_file,
            caption=f"😂 <b>Мем по запросу:</b> {topic}\n\n{meme_idea}",
            parse_mode="HTML",
        )
        await bot.session.close()

        from shared.instagram import post_story_with_text

        success = await post_story_with_text(image_url, headline, meme_idea)
        status = "опубликован в Instagram Stories" if success else "только в Telegram"
        return {"status": "ok", "message": f"Мем '{topic}' — {status}"}

    return {"status": "error", "message": "Не удалось сгенерировать мем"}

async def bus_get_status(params: dict) -> dict:
    return {"status": "ok", "message": await _content_status_message()}

async def bus_product_description(params: dict) -> dict:
    import json

    name = str(params.get("name") or "").strip()
    category = str(params.get("category") or "microgreens")
    price = params.get("price")
    if not name:
        return {"status": "error", "message": "Не указано название товара."}

    ai = AIEngine()
    sys_prompt = (
        f"Ты — контент-менеджер Microgreen Uzbekistan. {BRAND_TEXT_STYLE}\n"
        "Пишешь описание товара для карточки интернет-магазина: польза, вкус, "
        "применение на кухне, почему стоит взять. Без выдуманных фактов о составе "
        "и без обещаний лечебного эффекта.\n"
        'Верни ТОЛЬКО JSON: {"ru": "<описание на русском, 2-3 предложения>", '
        '"uz": "<то же то узбекском>"}'
    )
    user_prompt = f"Товар: {name}\nКатегория: {category}\nЦена: {price} сум"

    try:
        raw = await ai.chat_completion(
            sys_prompt, user_prompt, temperature=0.7, max_tokens=400
        )
        cleaned = (
            raw.strip()
            .removeprefix("```json")
            .removeprefix("```")
            .removesuffix("```")
            .strip()
        )
        data = json.loads(cleaned)
        return {
            "status": "ok",
            "message": "Описание готово.",
            "data": {
                "ru": str(data.get("ru", "")).strip(),
                "uz": str(data.get("uz", "")).strip(),
            },
        }
    except Exception as e:
        logger.error(f"CONTENT_BOT: описание товара не получилось: {e}", exc_info=True)
        return {"status": "error", "message": f"Не смог составить описание: {e}"}

async def bus_get_last_post(params: dict) -> dict:
    from datetime import timedelta

    day = str(params.get("day") or "today").lower()
    now = _tz_now()

    if day in ("today", "сегодня", ""):
        target = now.strftime("%Y-%m-%d")
    elif day in ("yesterday", "вчера"):
        target = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    elif day in ("last", "последний", "последние"):
        target = None
    else:
        target = day

    posts = await get_publications(target) if target else await get_last_publications()
    fell_back = False
    if not posts and target:
        posts = await get_last_publications()
        fell_back = True

    if not posts:
        return {
            "status": "ok",
            "data": {"posts": [], "fell_back": False},
            "message": (
                "Пока нет ни одной сохранённой публикации.\n\n"
                + await _content_status_message()
            ),
        }

    if fell_back:
        msg = "За сегодня публикаций ещё нет. Вот последнее, что выходило:"
    else:
        msg = f"Публикаций за {target or 'последние дни'}: {len(posts)}"

    return {
        "status": "ok",
        "message": msg,
        "data": {"posts": posts, "fell_back": fell_back},
    }

async def _draft_magazine(params: dict) -> dict:
    try:
        ai = AIEngine()

        facts = params.get("facts", "Нет фактов")
        products = params.get("products", "Нет продуктов")
        restaurant = params.get("restaurant", "Нет ресторана")

        prompt = (
            "Сформируй контент для нового выпуска журнала FRESH WEEKLY.\n"
            f"Факты и рецепт от агронома: {facts}\n"
            f"Топ продаж недели: {products}\n"
            f"Ресторан недели: {restaurant}\n\n"
            "Выдай JSON-объект с полями:\n"
            "- 'title': Креативный заголовок выпуска\n"
            "- 'content': Массив статей (объектов { 'title': '...', 'text': '...' }). Напиши 3 статьи на основе переданных данных.\n"
            "- 'highlights': Массив из 2-3 коротких фраз (буллеты)\n"
        )

        import json
        import re

        response = await ai.chat_completion(
            system_prompt=(
                "Ты главный редактор журнала о микрозелени Microgreen Uzbekistan. "
                "Отвечай ТОЛЬКО валидным JSON, без markdown и пояснений. "
                "Не выдумывай фактов и цифр: если данных нет — оставляй поле пустым."
            ),
            user_message=prompt,
        )

        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        if json_match:
            issue_data = json.loads(json_match.group(0))
        else:
            issue_data = {
                "title": "Fresh Weekly: Новый выпуск",
                "content": [{"title": "Обзор", "text": response}],
                "highlights": ["Свежие новости фермы"],
            }

        from shared.brand import BRAND_IMAGE_STYLE

        image_prompt = f"Magazine cover layout, modern minimalist design, fresh microgreens, vibrant, high quality, highly detailed, {BRAND_IMAGE_STYLE}"
        try:
            image_url = await ai.generate_image(image_prompt)
            issue_data["cover_image_url"] = image_url
        except Exception as e:
            logger.error(f"Failed to generate cover: {e}")
            issue_data["cover_image_url"] = ""

        return issue_data

    except Exception as e:
        logger.error(f"Error drafting magazine: {e}")
        return {"error": str(e)}
