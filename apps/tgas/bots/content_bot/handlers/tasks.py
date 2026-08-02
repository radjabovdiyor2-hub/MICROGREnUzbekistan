import logging
import os
from datetime import date, datetime, timedelta, timezone

from aiogram import Bot
from shared.ai_engine import AIEngine
from shared.brand import BRAND_TEXT_STYLE, CONTENT_POLICY, BRAND, BRAND_HASHTAGS
from shared.config import settings
from shared.content_archive import (
    mark_published as _mark_published,
)
from shared.content_plan import (
    build_brief,
    build_recipe_brief,
    get_daily_fact_theme,
    get_daily_morning_format,
    get_weekly_grid_pillar,
    get_daily_pillar,
    get_daily_tip_theme,
    MORNING_FORMATS,
    get_daily_image_style,
    pick_language,
    LANG_INSTRUCTION,
)
from shared.database import get_session_ctx
from shared.trends import (
    build_topical_angle,
    fetch_weather_samarkand,
    get_daily_context,
    get_uz_season_occasion,
)
from shared.scheduler import BotScheduler

logger = logging.getLogger(__name__)

async def _post_to_channel(bot: Bot, image_path: str, caption: str) -> bool:
    try:
        channel_id = settings.telegram_channel_id
        if not channel_id or not bot:
            return False
        if image_path:
            from aiogram.types import FSInputFile

            await bot.send_photo(
                channel_id,
                FSInputFile(image_path),
                caption=caption[:1024],
                parse_mode="HTML",
            )
        else:
            await bot.send_message(channel_id, caption[:4000], parse_mode="HTML")
        return True
    except Exception as e:
        logger.error(f"_post_to_channel error: {e}")
        return False

async def daily_content_ideas(bot: Bot) -> None:
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        month_name = {
            1: "январь",
            2: "февраль",
            3: "март",
            4: "апрель",
            5: "май",
            6: "июнь",
            7: "июль",
            8: "август",
            9: "сентябрь",
            10: "октябрь",
            11: "ноябрь",
            12: "декабрь",
        }[now.month]

        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()
        prompt = (
            f"Сегодня {now.strftime('%d.%m.%Y')}, месяц: {month_name}.\n"
            f"Сгенерируй 3 креативные идеи контента для Instagram/Telegram "
            f"микрозелени в Узбекистане.\n"
            f"Учитывай сезон, тренды, местную культуру.\n"
            f"Для каждой идеи: заголовок, формат (reels/пост/stories), краткое описание.\n"
            f"Формат: пронумерованный список."
        )
        ideas = await ai.chat_completion(
            "Ты креативный контент-менеджер для бизнеса микрозелени в Узбекистане. "
            "Пиши на русском языке.",
            prompt,
        )

        report = (
            f"💡 <b>Идеи контента на сегодня</b>\n"
            f"📅 {now.strftime('%d.%m.%Y')} | {month_name}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"{ideas}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🎨 <i>Content Bot — ежедневные идеи</i>"
        )
        await bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logger.error(f"daily_content_ideas error: {e}", exc_info=True)

async def product_description_audit(bot: Bot) -> None:
    try:
        from sqlalchemy import text

        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT id, name_ru FROM products "
                    "WHERE description_ru IS NULL OR description_ru = '' "
                    "ORDER BY id"
                )
            )
            products = res.fetchall()

        if not products:
            await bot.send_message(
                admin_id,
                "✅ <b>Аудит описаний:</b> Все продукты имеют описание!",
                parse_mode="HTML",
            )
            return

        lines = [
            "📝 <b>Аудит описаний продуктов</b>\n",
            "━━━━━━━━━━━━━━━━━━━━━━\n",
            f"⚠️ Найдено <b>{len(products)}</b> продуктов без описания:\n",
        ]
        for pid, name in products:
            lines.append(f"  • #{pid} — {name}")

        lines.append("\n━━━━━━━━━━━━━━━━━━━━━━")
        lines.append("💡 <i>Создайте описания для повышения продаж!</i>")
        lines.append("🎨 <i>Content Bot — еженедельный аудит</i>")

        await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logger.error(f"product_description_audit error: {e}", exc_info=True)

async def auto_publish_to_channel(bot: Bot) -> None:
    try:
        channel_id = settings.telegram_channel_id
        if not channel_id:
            logger.warning("telegram_channel_id не настроен, пропускаем автопостинг.")
            return

        ai = AIEngine()
        pillar = get_daily_pillar()

        prompt = (
            f"Напиши пост для нашего официального Telegram-канала.\n"
            f"Тематика: {pillar['name']}. Угол подачи: {pillar['angle']}.\n"
            f"Пиши живо, интересно, добавь релевантные эмодзи. "
            f"В конце добавь наши контакты: @microgreen_uz и хэштеги {pillar['tags']}."
        )

        post_text = await ai.chat_completion(
            "Ты SMM-менеджер Microgreen Uzbekistan. Пиши красиво и профессионально.",
            prompt,
            temperature=0.8,
        )

        image_prompt = (
            f"Фотография для Telegram канала про микрозелень. "
            f"Тема: {pillar['name']}. Стиль: свежий, экологичный, аппетитный, зеленые и золотые тона."
        )
        image_url = await ai.generate_image(image_prompt)

        if image_url:
            from aiogram.types import URLInputFile

            photo = URLInputFile(image_url)
            await bot.send_photo(
                channel_id, photo=photo, caption=post_text, parse_mode="HTML"
            )
        else:
            await bot.send_message(channel_id, post_text, parse_mode="HTML")

        logger.info("auto_publish_to_channel: пост успешно отправлен в канал.")
    except Exception as e:
        logger.error(f"auto_publish_to_channel error: {e}", exc_info=True)

async def weekly_content_plan(bot: Bot) -> None:
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        days_ahead = 0 - now.weekday() + 7
        monday = now + timedelta(days=days_ahead)

        admin_id = settings.admin_telegram_ids[0]

        from sqlalchemy import text
        async with get_session_ctx() as session:
            res = await session.execute(
                text("SELECT name_ru FROM products WHERE is_active = true LIMIT 10")
            )
            products = [row[0] for row in res.fetchall()]

        products_str = (
            ", ".join(products)
            if products
            else "микрозелень (руккола, подсолнечник, горох, редис)"
        )

        ai = AIEngine()
        prompt = (
            f"Создай контент-план на неделю с {monday.strftime('%d.%m.%Y')}.\n"
            f"Наши продукты: {products_str}.\n"
            f"Бизнес: микрозелень в Узбекистане.\n\n"
            f"Для каждого дня (Пн-Вс) укажи:\n"
            f"1. Тип контента (reels/пост/stories/carousel)\n"
            f"2. Тема/заголовок\n"
            f"3. Краткое описание\n"
            f"4. Хештеги (3-5 штук)\n\n"
            f"Включи: образовательный, продающий и развлекательный контент."
        )
        plan = await ai.chat_completion(
            "Ты профессиональный SMM-менеджер для бизнеса микрозелени. "
            "Создавай структурированные контент-планы на русском языке.",
            prompt,
        )

        report = (
            f"📅 <b>Контент-план на неделю</b>\n"
            f"С {monday.strftime('%d.%m.%Y')}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"{plan}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🎨 <i>Content Bot — недельный план</i>"
        )
        if len(report) > 4000:
            await bot.send_message(
                admin_id,
                report[:4000] + "\n\n<i>...продолжение↓</i>",
                parse_mode="HTML",
            )
            await bot.send_message(admin_id, report[4000:], parse_mode="HTML")
        else:
            await bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logger.error(f"weekly_content_plan error: {e}", exc_info=True)

async def morning_post(bot: Bot, d: date | None = None) -> dict:
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        target_date = d or now.date()
        day_name = target_date.strftime("%A")
        weather = await fetch_weather_samarkand()

        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()

        fmt = get_daily_morning_format(target_date)
        fact_theme = get_daily_fact_theme(target_date)
        tip_theme = get_daily_tip_theme(target_date)
        pillar = get_daily_pillar(target_date)

        if pillar["key"] in ("news", "health_trend") or fmt["key"] in ("tip", "fact"):
            ctx = await get_daily_context()
            if pillar["key"] in ("news", "health_trend"):
                fact_theme = await build_topical_angle(
                    pillar["key"], ctx, fallback=fact_theme
                )
                tip_theme = fact_theme
            elif fmt["key"] == "tip":
                tip_theme = await build_topical_angle("tip", ctx, fallback=tip_theme)
            else:
                fact_theme = await build_topical_angle("fact", ctx, fallback=fact_theme)

        angle = fmt["angle"].replace("{fact}", fact_theme).replace("{tip}", tip_theme)
        is_info = fmt.get("kind") == "info"
        promo_hint = (
            ""
            if (fmt["key"] == "promo" or is_info)
            else "С вероятностью 25% органично добавь промокод BODRLIK (скидка 10%, 24 соат).\n"
        )

        prompt = (
            f"Создай короткий утренний сторис для Instagram (Microgreen Uzbekistan).\n"
            f"ФОРМАТ СЕГОДНЯ: {fmt['ru']}. Контекст: {day_name}, погода в Самарканде: {weather}.\n"
            f"Аудитория: обычные люди Узбекистана — семьи, кто любит вкусно поесть и принимать гостей, "
            f"плюс шефы/HoReCa. Тон: живой, тёплый, «по-человечески», как сообщение другу.\n"
            f"ЗАДАЧА: {angle}\n"
            f"ХУК: самая первая фраза должна ОСТАНОВИТЬ скролл (вопрос, неожиданность, узнаваемая "
            f"ситуация) — без «Assalomu alaykum» и общих приветствий.\n"
            f"ЦЕННОСТЬ > БРЕНД: сначала дай пользу или эмоцию; бренд/микрозелень упомяни ненавязчиво "
            f"(можно и вовсе не в лоб).\n"
            f"В конце ОБЯЗАТЕЛЬНО живой призыв к реакции: {fmt['trigger']} — так, чтобы захотелось "
            f"сохранить, переслать другу или ответить.\n"
            f"{promo_hint}"
            f"Коротко (до 4 предложений), уникально, без упоминания ИИ. Пиши ТОЛЬКО на Uzbek Latin."
        )
        post_text = await ai.chat_completion(
            "Sen Microgreen Uzbekistan brendining SMM-menejeri va oshpaz-ekspertisan. "
            "Yorqin, foydali, emoji bilan yoz."
            + BRAND_TEXT_STYLE
            + CONTENT_POLICY
            + "\n\n"
            + build_brief(pillar, "утренний сторис", d=target_date),
            prompt,
            temperature=0.9,
        )

        async def _gen_headline() -> str:
            return await ai.chat_completion(
                "Sen kreativ kopirayter. Grammatik to'g'ri, tabiiy o'zbek tilida yoz, so'zlarni buzma."
                + CONTENT_POLICY,
                f"Shu post uchun qisqa, jozibali SARLAVHA (hook) o'ylab top — FAQAT Uzbek Latin, ko'pi bilan 5 so'z, "
                f"emoji va tinish belgilarisiz. Faqat sarlavhani yoz:\n{post_text[:500]}",
            )

        headline = ""
        options = None
        benefit = ""
        points = None

        if is_info:
            import json

            raw = await ai.chat_completion(
                "Sen Microgreen Uzbekistan SMM-menejeri va oshpaz-ekspertisan. "
                "Faqat VALID JSON qaytar, markdownsiz." + CONTENT_POLICY,
                f"Vazifa: {angle}\n"
                f'JSON format: {{"headline": "...", "points": ["...","...","..."]}}\n'
                f"Talablar: headline — jozibali hook, ko'pi bilan 5 so'z. "
                f"points — 2-3 ANIQ, amaliy nuqta, har biri ko'pi bilan 7 so'z.\n"
                f"MUHIM: UMUMIY gaplar QAT'IY TAQIQLANADI. 'Uzoq saqlang' emas — "
                f"QANDAY aniq: harorat (°C), muddat (kun), usul (nam salfetka, muzlatkich...). "
                f"FAQAT Uzbek Latin, emoji va tinish belgilarisiz.\n"
                f"Post (kontekst):\n{post_text[:600]}",
                temperature=0.7,
            )
            try:
                data = json.loads(raw.strip().strip("`").replace("json\n", "", 1))
            except Exception:
                data = {}
            headline = str(data.get("headline") or "").strip()
            points = [
                str(x).strip() for x in (data.get("points") or []) if str(x).strip()
            ][:3]
            if not headline:
                headline = await _gen_headline()
            if not points:
                points = None
        elif fmt["key"] == "this_or_that":
            headline = await _gen_headline()
            raw_opts = await ai.chat_completion(
                "Sen kopirayter. Uzbek Latin, grammatik to'g'ri." + CONTENT_POLICY,
                f"Ikkita QISQA tanlov variantini taklif qil, har biri 1-3 so'z, ular orasiga '|' qo'y, "
                f"emoji va tinish belgilarisiz. FAQAT ikkita variant:\n{post_text[:300]}",
            )
            parts = [
                p.strip() for p in raw_opts.replace("\n", "|").split("|") if p.strip()
            ]
            options = parts[:2] if len(parts) >= 2 else ["1-variant", "2-variant"]
        else:
            headline = await _gen_headline()
            benefit = await ai.chat_completion(
                "Sen kopirayter. Grammatik to'g'ri, tabiiy o'zbek tilida yoz."
                + CONTENT_POLICY,
                f"Bitta ANIQ foyda/qiziqarli iborani yoz — Uzbek Latin, ko'pi bilan 6 so'z, "
                f"emoji va tinish belgilarisiz. MUHIM: bu sarlavhadan FARQ qilsin. Sarlavha: «{headline[:60]}». "
                f"Faqat iborani yoz:\n{post_text[:400]}",
            )

        image_prompt = (
            f"Photorealistic vertical 9:16 photo for Instagram story. {fmt['photo']}. "
            f"Aesthetic, premium, natural light. Keep a clean empty area for a text overlay. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
        )
        image_url = await ai.generate_image(image_prompt, size="1024x1792")

        from uuid import uuid4

        if image_url and os.path.isfile(image_url):
            from shared.brand import render_story_text

            story_img = f"story_{uuid4().hex[:8]}.jpg"
            ok = render_story_text(
                image_url,
                story_img,
                headline=headline or "",
                subtitle=benefit or "",
                hashtags="",
                mention=BRAND["instagram"],
                cta=fmt["cta"],
                badge=fmt["badge"],
                layout=fmt["layout"],
                options=options,
                note=fmt["note"],
                accent=(fmt["key"] == "promo"),
                points=points,
                section=fmt.get("section", ""),
            )
            final_img = story_img if ok else image_url
            from aiogram.types import FSInputFile

            await bot.send_photo(
                admin_id,
                photo=FSInputFile(final_img),
                caption=f"☀️ <b>{fmt['ru']}</b>",
                parse_mode="HTML",
            )
            from shared.instagram import post_to_instagram

            success = await post_to_instagram(final_img, "", post_type="story")
            channel_caption = f"<b>{headline}</b>\n\n{post_text}\n\n{fmt['cta']}\nmicrogreenuzbekistan.com"
            await _post_to_channel(bot, final_img, channel_caption)
            if success:
                await _mark_published(
                    "morning", image=final_img, caption=post_text, title=headline
                )
                await bot.send_message(
                    admin_id,
                    "✅ <i>Опубликовано в Instagram Stories</i>",
                    parse_mode="HTML",
                )
        else:
            channel_caption = f"<b>{headline}</b>\n\n{post_text}\n\n{fmt['cta']}\nmicrogreenuzbekistan.com"
            await _post_to_channel(bot, None, channel_caption)
            await bot.send_message(
                admin_id,
                "⚠️ Не удалось сгенерировать изображение утреннего сторис.",
                parse_mode="HTML",
            )
    except Exception as e:
        logger.error(f"morning_post error: {e}", exc_info=True)

async def evening_post(bot: Bot, d: date | None = None) -> None:
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        target_date = d or now.date()
        weather = await fetch_weather_samarkand()

        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()

        import json

        brief = build_recipe_brief(target_date)
        lang_uz = brief["lang"] == "uz"
        lang_name = (
            "узбекском языке (латиница, O'zbek tili)" if lang_uz else "русском языке"
        )

        _so = get_uz_season_occasion(target_date)
        occasion = _so.get("occasion") or ""
        season = _so.get("season") or ""
        occ_hint = (
            f"Сезон/повод: {season}{(', ' + occasion) if occasion else ''} — "
            f"учти при выборе блюда (лёгкость/сытность, праздничность).\n"
        )

        raw = await ai.chat_completion(
            "Ты шеф-повар мирового уровня в Microgreen Uzbekistan и знаешь кухни всех стран. "
            "Верни ТОЛЬКО валидный JSON, без markdown."
            + BRAND_TEXT_STYLE
            + CONTENT_POLICY,
            f"Придумай блюдо на ужин с национальным колоритом, НЕ похожее на вчерашние.\n"
            f"Кухня дня: {brief['cuisine']}.\n"
            f"Формат блюда: {brief['format']}.\n"
            f"Главный герой из нашего ассортимента: {brief['hero']} — он ключевой в блюде или подаче.\n"
            f"Погода сегодня: {weather} — подбери лёгкость/сытность под неё.\n"
            f"{occ_hint}"
            f"⚠️ ЯЗЫК: пиши ГРАМОТНО на {lang_name}. ТОЛЬКО латинские буквы — никакой кириллицы "
            f"(ь, ъ, й, ы запрещены). «Микрозелень» = 'mikrozelen'. Название блюда — ПРОСТОЕ, "
            f"естественное и понятное (напр. 'No'xat mikrozeleni bilan issiq salat'), без выдуманных "
            f"или искажённых слов.\n"
            f'Формат JSON: {{"title":"...","ingredients":["...","..."],"steps":["...","..."],"secret":"..."}}\n'
            f"Требования: понятное название блюда, 3-5 коротких ингредиентов, "
            f"3-4 коротких шага (каждый ≤ 90 символов), 1 секрет от шефа.",
            temperature=0.6,
        )
        try:
            data = json.loads(raw.strip().strip("`").replace("json\n", "", 1))
        except Exception:
            data = {}
        title = data.get("title") or (
            "Kechki retsept" if lang_uz else "Вечерний рецепт"
        )
        ingredients = [str(x) for x in (data.get("ingredients") or [])]
        steps = [str(x) for x in (data.get("steps") or [])]
        secret = data.get("secret") or ""

        ing_for_photo = (
            ", ".join(ingredients[:5]) if ingredients else "fresh microgreens"
        )
        image_prompt = (
            f"Photorealistic vertical 9:16 professional food photograph for Instagram story, "
            f"authentic {brief['cuisine']} cuisine plating and styling, warm evening light, "
            f"fresh microgreens and edible flowers as garnish. "
            f"The dish on the plate is exactly: {title} — made with {ing_for_photo}. "
            f"Show precisely THIS dish, appetizing and true to these ingredients. "
            f"Photography style: {get_daily_image_style(target_date)}. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
        )
        image_url = await ai.generate_image(image_prompt, size="1024x1792")

        steps_txt = "\n".join(f"{n}. {s}" for n, s in enumerate(steps, 1)) or "—"
        caption = (
            f"🍽 <b>{title}</b>\n\n"
            f"👨‍🍳 <b>Tayyorlash:</b>\n{steps_txt}\n"
            + (f"\n🔑 <i>Sirimiz:</i> {secret}\n" if secret else "")
            + "\n📞 +998 94 999 95 99 · Buyurtma berish\n#MicrogreenUzbekistan"
        )

        channel_caption = f"{caption}\n\nmicrogreenuzbekistan.com"

        if image_url and os.path.isfile(image_url):
            from shared.brand import render_recipe_card
            from uuid import uuid4

            story_img = f"recipe_{uuid4().hex[:8]}.jpg"
            ok = render_recipe_card(
                image_url, story_img, title, ingredients, cta="Buyurtma berish"
            )
            final_img = story_img if ok else image_url

            from aiogram.types import FSInputFile

            await bot.send_photo(
                admin_id,
                photo=FSInputFile(final_img),
                caption=caption[:1024],
                parse_mode="HTML",
            )
            from shared.instagram import post_to_instagram

            success = await post_to_instagram(final_img, "", post_type="story")
            await _post_to_channel(bot, final_img, channel_caption)
            if success:
                await _mark_published(
                    "recipe", image=final_img, caption=caption, title=title
                )
                await bot.send_message(
                    admin_id,
                    "✅ <i>Рецепт опубликован в Instagram Stories</i>",
                    parse_mode="HTML",
                )
        else:
            await _post_to_channel(bot, None, channel_caption)
            await bot.send_message(
                admin_id, "⚠️ Не удалось сгенерировать фото рецепта.", parse_mode="HTML"
            )

    except Exception as e:
        logger.error(f"evening_post error: {e}", exc_info=True)

async def weekly_grid_post(bot: Bot, d: date | None = None) -> None:
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        target_date = d or now.date()
        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()
        pillar = get_weekly_grid_pillar(target_date)
        brief = build_brief(
            pillar, "еженедельный флагманский пост в ленту", d=target_date
        )

        lang = pick_language(pillar, d=target_date)
        lang_name = LANG_INSTRUCTION[lang]

        post_text = await ai.chat_completion(
            "Ты главный SMM-редактор бренда Microgreen Uzbekistan. Пиши сильный, ценный пост "
            "для ленты Instagram — с пользой/историей и чётким призывом к действию."
            + BRAND_TEXT_STYLE
            + CONTENT_POLICY
            + "\n\n"
            + brief,
            f"Создай еженедельный флагманский пост в ленту по рубрике «{pillar['name']}». "
            f"⚠️ ЯЗЫК: пиши ПОЛНОСТЬЮ на {lang_name} языке. Категорически НЕ на английском. "
            f"4-7 абзацев, живо, с эмодзи, в конце — призыв к действию и контакты.",
        )
        import re as _re

        body = _re.sub(r"#\S+", "", post_text).rstrip()
        feed_caption = f"{body}\n\n{BRAND_HASHTAGS}"

        image_prompt = (
            f"Photorealistic premium square 1:1 Instagram feed photo for a microgreens brand. "
            f"Fresh microgreens, salads and beautiful plating, natural soft light, clean aesthetic composition, "
            f"theme: {pillar['name']}. "
            f"Photography style: {get_daily_image_style(target_date)}. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
        )
        image_url = await ai.generate_image(image_prompt, size="1024x1024")

        if image_url and os.path.isfile(image_url):
            from aiogram.types import FSInputFile

            await bot.send_photo(
                admin_id,
                photo=FSInputFile(image_url),
                caption=feed_caption[:1024],
                parse_mode="HTML",
            )
            from shared.instagram import post_to_instagram

            ok = await post_to_instagram(image_url, feed_caption, post_type="feed")
            await _post_to_channel(bot, image_url, feed_caption)
            if ok:
                await _mark_published(
                    "grid", image=image_url, caption=post_text, title=pillar["name"]
                )
                await bot.send_message(
                    admin_id,
                    "✅ <i>Пост недели опубликован в ленту Instagram</i>",
                    parse_mode="HTML",
                )
        else:
            await _post_to_channel(bot, None, feed_caption)
            await bot.send_message(
                admin_id,
                "⚠️ Не удалось сгенерировать фото поста недели.",
                parse_mode="HTML",
            )
    except Exception as e:
        logger.error(f"weekly_grid_post error: {e}", exc_info=True)

async def daily_site_recipe(bot: Bot) -> None:
    try:
        import aiohttp

        api = os.getenv("STOREFRONT_API_URL", "http://web:3000/api").rstrip("/")
        async with aiohttp.ClientSession() as s:
            async with s.get(
                f"{api}/content/recipe-of-day",
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    logger.warning("daily_site_recipe: HTTP %s", resp.status)
                    return
                data = await resp.json()
        caption = (data.get("captionRu") or "").strip()
        if not caption:
            return
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if admin_id and bot:
            await bot.send_message(
                admin_id,
                f"🍽 <b>Рецепт дня с сайта</b> (готов к публикации):\n\n{caption[:3500]}",
                parse_mode="HTML",
            )
    except Exception as e:
        logger.error("daily_site_recipe error: %s", e)

REEL_INFO_FORMATS = ["tip", "fact", "mini_recipe"]

async def reel_post(bot: Bot) -> None:
    try:
        import json
        from shared.video_utils import make_reel, ffmpeg_available
        from shared.brand import render_story_text
        from uuid import uuid4

        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()

        if not ffmpeg_available():
            await bot.send_message(
                admin_id,
                "⚠️ Reel не собран: ffmpeg недоступен в окружении.",
                parse_mode="HTML",
            )
            return

        from shared.content_archive import get_format_performance_weights_async
        import random

        weights = await get_format_performance_weights_async(REEL_INFO_FORMATS)
        key = random.choices(list(weights.keys()), weights=list(weights.values()), k=1)[
            0
        ]
        fmt = next(f for f in MORNING_FORMATS if f["key"] == key)
        ctx = await get_daily_context()
        angle = fmt["angle"]
        if "{fact}" in angle:
            angle = angle.replace(
                "{fact}",
                await build_topical_angle(
                    "fact", ctx, fallback=get_daily_fact_theme(now.date())
                ),
            )
        if "{tip}" in angle:
            angle = angle.replace(
                "{tip}",
                await build_topical_angle(
                    "tip", ctx, fallback=get_daily_tip_theme(now.date())
                ),
            )

        raw = await ai.chat_completion(
            "Sen Microgreen Uzbekistan SMM-menejeri. Faqat VALID JSON qaytar."
            + CONTENT_POLICY,
            f"Vazifa: {angle}\n"
            f'JSON: {{"headline":"...","points":["...","...","..."]}}\n'
            f"headline ≤5 so'z; points — 2-3 ANIQ nuqta (harorat/muddat/usul), har biri ≤7 so'z. "
            f"UMUMIY gaplar QAT'IY TAQIQ. FAQAT Uzbek Latin, emoji va tinish belgilarisiz.",
            temperature=0.7,
        )
        try:
            data = json.loads(raw.strip().strip("`").replace("json\n", "", 1))
        except Exception:
            data = {}
        headline = str(data.get("headline") or "").strip() or "Mikrozelen foydasi"
        points = [str(x).strip() for x in (data.get("points") or []) if str(x).strip()][
            :3
        ]

        image_prompt = (
            f"Photorealistic vertical 9:16 photo for Instagram reel. {fmt['photo']}. "
            f"Aesthetic, premium, natural light. Keep a clean empty area for a text overlay. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
        )
        image_url = await ai.generate_image(image_prompt, size="1024x1792")
        if not (image_url and os.path.isfile(image_url)):
            await bot.send_message(
                admin_id, "⚠️ Reel: не удалось сгенерировать фон.", parse_mode="HTML"
            )
            return

        frame = f"reel_{uuid4().hex[:8]}.jpg"
        render_story_text(
            image_url,
            frame,
            headline=headline,
            mention=BRAND["instagram"],
            cta=fmt["cta"],
            badge=fmt["badge"],
            layout=fmt["layout"],
            note=fmt["note"],
            points=points or None,
            section=fmt.get("section", ""),
        )
        reel = make_reel(frame, out_path=f"reel_{uuid4().hex[:8]}.mp4", duration=8.0)
        if not reel:
            await bot.send_message(
                admin_id, "⚠️ Reel: сборка видео не удалась (ffmpeg).", parse_mode="HTML"
            )
            return

        pts_txt = "\n".join(f"• {p}" for p in points) if points else ""
        caption = (
            f"{headline}\n\n{pts_txt}\n\n"
            f"📞 {BRAND['phone']} · Buyurtma berish\n\n{BRAND_HASHTAGS}"
        ).strip()

        from aiogram.types import FSInputFile

        await bot.send_video(
            admin_id,
            video=FSInputFile(reel),
            caption=f"🎬 <b>Reel: {fmt['ru']}</b>",
            parse_mode="HTML",
        )
        from shared.instagram import post_reel

        media_id = await post_reel(reel, caption, share_to_feed=True)
        if media_id:
            await _mark_published(
                "reel", image=frame, caption=caption, title=headline, media_id=media_id
            )
            await bot.send_message(
                admin_id, "✅ <i>Reel опубликован в Instagram</i>", parse_mode="HTML"
            )
    except Exception as e:
        logger.error(f"reel_post error: {e}", exc_info=True)

async def publish_restaurant_of_week(bot: Bot) -> None:
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.event_bus import event_bus

        admin_id = settings.admin_telegram_ids[0]

        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT name, city, cuisine, dishes, microgreens FROM restaurants "
                    "WHERE LOWER(tier) = 'premium' ORDER BY RANDOM() LIMIT 1"
                )
            )
            row = res.fetchone()

        if not row:
            logger.warning(
                "Ресторан недели: в базе витрины нет заведений с tier='premium' — публикация пропущена"
            )
            return

        name, city, cuisine, dishes, microgreens = row
        cuisine_str = ", ".join(cuisine) if isinstance(cuisine, list) else str(cuisine)
        dishes_str = ", ".join(dishes) if isinstance(dishes, list) else str(dishes)
        mg_str = (
            ", ".join(microgreens)
            if isinstance(microgreens, list)
            else str(microgreens)
        )

        post_text = (
            f"🍽 <b>Ресторан недели: {name} ({city.title()})</b>\n\n"
            f"Кухня: {cuisine_str}\n"
            f"Знаковые блюда: {dishes_str}\n"
            f"Рекомендуемая микрозелень: {mg_str}\n\n"
            f"<i>Читайте полный обзор в новом выпуске FRESH WEEKLY:</i>\n"
            f"👉 microgreenuzbekistan.com/magazine\n"
        )

        if bot:
            await bot.send_message(
                admin_id,
                f"📰 <b>Опубликовано в канал:</b>\n\n{post_text}",
                parse_mode="HTML",
            )

        await event_bus.publish(
            "MAGAZINE_PUBLISHED",
            {
                "rubric": "restaurant_of_week",
                "restaurant_name": name,
                "city": city,
                "microgreens_recommended": mg_str,
            },
            "content_bot",
        )

    except Exception as e:
        logger.error(f"publish_restaurant_of_week error: {e}", exc_info=True)

async def check_and_refresh_token_job(bot: Bot) -> None:
    try:
        from shared.token_refresh import auto_check_and_refresh_token

        await auto_check_and_refresh_token()
    except Exception as e:
        logger.error(f"Ошибка при автоматическом обновлении токена Instagram: {e}")
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if admin_id and bot:
            await bot.send_message(
                admin_id,
                f"⚠️ <b>Критическая ошибка:</b> Не удалось автоматически обновить Instagram Access Token.\n"
                f"Детали ошибки: <code>{e}</code>\n"
                f"Потребуется ручной перезапуск обмена токенов.",
                parse_mode="HTML",
            )

async def weekly_reach_report(bot: Bot) -> None:
    try:
        from shared.instagram_analytics import (
            build_reach_report,
            sync_publication_metrics,
        )

        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not (admin_id and bot):
            return
        await sync_publication_metrics()
        rep = await build_reach_report()
        if not rep.get("configured"):
            await bot.send_message(
                admin_id,
                "📊 Reach-отчёт: Instagram Graph API не настроен (нет токена/доступа).",
                parse_mode="HTML",
            )
            return
        await bot.send_message(admin_id, rep["summary"], parse_mode="HTML")
    except Exception as e:
        logger.error(f"weekly_reach_report error: {e}", exc_info=True)

async def daily_magazine_rubric(bot: Bot) -> None:
    try:
        from shared.event_bus import event_bus

        admin_id = settings.admin_telegram_ids[0]

        post_text = (
            "📰 <b>Рубрика дня из FRESH WEEKLY</b>\n\n"
            "✨ Факт дня: Пибимпаб с микрозеленью — это не только вкусно, но и полезно для пищеварения!\n"
            "Добавьте ростки дайкона для пикантности.\n\n"
            "👉 Читайте полную статью: <a href='https://microgreenuzbekistan.com/magazine/2'>FRESH WEEKLY #2</a>"
        )

        if bot:
            await bot.send_message(admin_id, post_text, parse_mode="HTML")

        await event_bus.publish(
            "MAGAZINE_PUBLISHED",
            {"rubric": "daily_highlight", "issue_id": 2},
            "content_bot",
        )

    except Exception as e:
        logger.error(f"daily_magazine_rubric error: {e}", exc_info=True)

_last_morning_date = None

async def morning_post_dynamic_check(bot: Bot) -> None:
    global _last_morning_date
    now = datetime.now(timezone(timedelta(hours=5)))
    month = now.month

    if 4 <= month <= 9:
        target_hour = 7
        target_minute = 15
    else:
        target_hour = 8
        target_minute = 15

    if now.hour == target_hour and now.minute == target_minute:
        if _last_morning_date == now.date():
            return
        _last_morning_date = now.date()
        await morning_post(bot)

def register_content_tasks(scheduler: BotScheduler, bot: Bot):
    scheduler.add_cron(
        name="weekly_grid_post", func=lambda: weekly_grid_post(bot), hour=12, minute=0, day_of_week=5
    )
    scheduler.add_interval(
        seconds=60, name="morning_post_dynamic_check", func=lambda: morning_post_dynamic_check(bot)
    )
    scheduler.add_cron(name="evening_post", func=lambda: evening_post(bot), hour=18, minute=0)
    scheduler.add_cron(
        name="instagram_token_refresh",
        func=lambda: check_and_refresh_token_job(bot),
        hour=10,
        minute=0,
        day_of_week=0,
    )
    scheduler.add_cron(
        name="weekly_reach_report",
        func=lambda: weekly_reach_report(bot),
        hour=10,
        minute=0,
        day_of_week=0,
    )
    scheduler.add_cron(
        name="publish_restaurant_of_week",
        func=lambda: publish_restaurant_of_week(bot),
        hour=11,
        minute=0,
        day_of_week=0,
    )
