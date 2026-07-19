"""Content Bot — main.py с EventBus интеграцией"""
import asyncio
import logging
from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db, get_session_ctx
from shared.event_bus import event_bus
from bots.content_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from shared.ai_engine import AIEngine
from shared.utils import simulate_typing
from aiogram.types import Message
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat
from shared.brand import BRAND_TEXT_STYLE, CONTENT_POLICY
from shared.content_plan import (
    get_daily_pillar, get_weekly_grid_pillar, build_brief,
    get_daily_fact_theme, build_recipe_brief, get_daily_morning_format,
)

logging.basicConfig(level=logging.INFO)

# ── Глобальные ссылки для задач ──────────────────────────────────────────
_bot: Bot = None
scheduler = BotScheduler("content_bot")

# ── Журнал публикаций (общий volume bus_tasks — виден и Степану через bot_bus) ──
# Пишем не только факт «опубликовано в 07:16», но и САМ контент (картинка + текст):
# иначе показать руководителю реальный пост нечем — temp_story.jpg перезатирается
# следующей же публикацией.
from shared.content_archive import (
    mark_published as _mark_published,
    status_message as _content_status_message,
    get_publications,
    get_last_publications,
    tz_now as _tz_now,
)


async def ai_fallback(msg: Message):
    ai = AIEngine()
    await simulate_typing(msg, delay=2)
    from shared.prompts import TEAM_CONTEXT
    r = await ai.chat_completion(f"{TEAM_CONTEXT}\n\nТы контент-менеджер Microgreen Uzbekistan. Помогай пользователю.", msg.text)
    await msg.answer(r)


# ═══════════════════════════════════════════════════════════════════════════
# ФОНОВЫЕ ЗАДАЧИ
# ═══════════════════════════════════════════════════════════════════════════

async def daily_content_ideas():
    """Ежедневно в 8:00: 3 идеи контента от AI."""
    try:
        from datetime import datetime, timedelta, timezone
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        month_name = {
            1: "январь", 2: "февраль", 3: "март", 4: "апрель",
            5: "май", 6: "июнь", 7: "июль", 8: "август",
            9: "сентябрь", 10: "октябрь", 11: "ноябрь", 12: "декабрь",
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
            prompt
        )

        report = (
            f"💡 <b>Идеи контента на сегодня</b>\n"
            f"📅 {now.strftime('%d.%m.%Y')} | {month_name}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"{ideas}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🎨 <i>Content Bot — ежедневные идеи</i>"
        )
        await _bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logging.error(f"daily_content_ideas error: {e}", exc_info=True)


async def product_description_audit():
    """Понедельник 11:00: проверка продуктов без описания."""
    try:
        from sqlalchemy import text
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            res = await session.execute(text(
                "SELECT id, name_ru FROM products "
                "WHERE description_ru IS NULL OR description_ru = '' "
                "ORDER BY id"
            ))
            products = res.fetchall()

        if not products:
            await _bot.send_message(
                admin_id,
                "✅ <b>Аудит описаний:</b> Все продукты имеют описание!",
                parse_mode="HTML"
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

        await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logging.error(f"product_description_audit error: {e}", exc_info=True)


async def weekly_content_plan():
    """Воскресенье 20:00: полный контент-план на неделю от AI."""
    try:
        from datetime import datetime, timedelta, timezone
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        # Следующий понедельник
        days_ahead = 0 - now.weekday() + 7
        monday = now + timedelta(days=days_ahead)

        admin_id = settings.admin_telegram_ids[0]

        # Получаем список продуктов для контекста
        from sqlalchemy import text
        async with get_session_ctx() as session:
            res = await session.execute(text(
                "SELECT name_ru FROM products WHERE is_active = true LIMIT 10"
            ))
            products = [row[0] for row in res.fetchall()]

        products_str = ", ".join(products) if products else "микрозелень (руккола, подсолнечник, горох, редис)"

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
            prompt
        )

        report = (
            f"📅 <b>Контент-план на неделю</b>\n"
            f"С {monday.strftime('%d.%m.%Y')}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"{plan}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🎨 <i>Content Bot — недельный план</i>"
        )
        # Telegram limit
        if len(report) > 4000:
            await _bot.send_message(admin_id, report[:4000] + "\n\n<i>...продолжение↓</i>", parse_mode="HTML")
            await _bot.send_message(admin_id, report[4000:], parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logging.error(f"weekly_content_plan error: {e}", exc_info=True)


import aiohttp
from datetime import datetime, timedelta, timezone

# Источники повестки вынесены в shared/trends.py (их использует и bus_generate_meme).
# get_daily_context — кэшированный на день контекст (новости/тренды/сезон/погода),
# build_topical_angle — тема поста из этой повестки в рамках CONTENT_POLICY.
from shared.trends import (
    fetch_weather_samarkand, fetch_local_news, fetch_uzbek_trends,
    get_daily_context, build_topical_angle,
)


async def morning_post():
    """Ежедневно утром: утренний сторис. Каждый день — ДРУГОЙ формат (факт / вопрос /
    выбор / лайфхак / мини-рецепт / цитата / промо): разное фото, разный макет оверлея
    и свой триггер вовлечения — чтобы сторис не выглядел одинаково и лучше заходил в охват."""
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        day_name = now.strftime('%A')
        weather = await fetch_weather_samarkand()

        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()

        # Формат дня определяет угол подачи, фото, макет, CTA и триггер вовлечения
        fmt = get_daily_morning_format(now.date())
        from shared.content_plan import get_daily_tip_theme
        fact_theme = get_daily_fact_theme(now.date())   # fallback-семя из списка
        tip_theme = get_daily_tip_theme(now.date())     # fallback-семя из списка
        # Тема дня из актуальной повестки (новости/тренды/сезон/погода), с fallback на списки
        if fmt["key"] in ("tip", "fact"):
            ctx = await get_daily_context()
            if fmt["key"] == "tip":
                tip_theme = await build_topical_angle("tip", ctx, fallback=tip_theme)
            else:
                fact_theme = await build_topical_angle("fact", ctx, fallback=fact_theme)
        angle = fmt["angle"].replace("{fact}", fact_theme).replace("{tip}", tip_theme)
        is_info = fmt.get("kind") == "info"          # info → список пунктов на картинке
        promo_hint = "" if (fmt["key"] == "promo" or is_info) else \
            "С вероятностью 25% органично добавь промокод BODRLIK (скидка 10%, 24 соат).\n"

        prompt = (
            f"Создай утренний сторис (доброе утро) для Microgreen Uzbekistan.\n"
            f"ФОРМАТ СЕГОДНЯ: {fmt['ru']}. Контекст: {day_name}, погода в Самарканде: {weather}.\n"
            f"Аудитория: домашние хозяйки и шеф-повара (HoReCa). Тон: тёплый, бодрый, живой.\n"
            f"ЗАДАЧА: {angle}\n"
            f"В конце ОБЯЗАТЕЛЬНО органичный призыв к реакции: {fmt['trigger']}.\n"
            f"{promo_hint}"
            f"Коротко (до 4 предложений), уникально, без упоминания ИИ. Пиши ТОЛЬКО на Uzbek Latin."
        )
        post_text = await ai.chat_completion(
            "Sen Microgreen Uzbekistan brendining SMM-menejeri va oshpaz-ekspertisan. "
            "Yorqin, foydali, emoji bilan yoz." + BRAND_TEXT_STYLE + CONTENT_POLICY + "\n\n" + build_brief(get_daily_pillar(), "утренний сторис"),
            prompt,
            temperature=0.9,
        )

        async def _gen_headline() -> str:
            return await ai.chat_completion(
                "Sen kreativ kopirayter. Grammatik to'g'ri, tabiiy o'zbek tilida yoz, so'zlarni buzma." + CONTENT_POLICY,
                f"Shu post uchun qisqa, jozibali SARLAVHA (hook) o'ylab top — FAQAT Uzbek Latin, ko'pi bilan 5 so'z, "
                f"emoji va tinish belgilarisiz. Faqat sarlavhani yoz:\n{post_text[:500]}"
            )

        headline = ""
        options = None
        benefit = ""
        points = None

        if is_info:
            # Инфо-формат: заголовок + 2-3 КОНКРЕТНЫХ пункта (одним JSON-вызовом).
            # Ключевое против «расплывчатости» — жёсткий запрет общих фраз.
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
                data = json.loads(raw.strip().strip('`').replace('json\n', '', 1))
            except Exception:
                data = {}
            headline = str(data.get("headline") or "").strip()
            points = [str(x).strip() for x in (data.get("points") or []) if str(x).strip()][:3]
            if not headline:
                headline = await _gen_headline()
            if not points:
                points = None   # деградация: без списка (render покажет только заголовок)
        elif fmt["key"] == "this_or_that":
            headline = await _gen_headline()
            raw_opts = await ai.chat_completion(
                "Sen kopirayter. Uzbek Latin, grammatik to'g'ri." + CONTENT_POLICY,
                f"Ikkita QISQA tanlov variantini taklif qil, har biri 1-3 so'z, ular orasiga '|' qo'y, "
                f"emoji va tinish belgilarisiz. FAQAT ikkita variant:\n{post_text[:300]}"
            )
            parts = [p.strip() for p in raw_opts.replace("\n", "|").split("|") if p.strip()]
            options = parts[:2] if len(parts) >= 2 else ["1-variant", "2-variant"]
        else:
            # Вовлекающие форматы (вопрос/цитата) — заголовок + одна фраза пользы
            headline = await _gen_headline()
            benefit = await ai.chat_completion(
                "Sen kopirayter. Grammatik to'g'ri, tabiiy o'zbek tilida yoz." + CONTENT_POLICY,
                f"Bitta ANIQ foyda/qiziqarli iborani yoz — Uzbek Latin, ko'pi bilan 6 so'z, "
                f"emoji va tinish belgilarisiz. MUHIM: bu sarlavhadan FARQ qilsin. Sarlavha: «{headline[:60]}». "
                f"Faqat iborani yoz:\n{post_text[:400]}"
            )

        # Фото — арт-направление меняется по формату дня (не всегда флэтлей)
        image_prompt = (
            f"Photorealistic vertical 9:16 photo for Instagram story. {fmt['photo']}. "
            f"Aesthetic, premium, natural light. Keep a clean empty area for a text overlay. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
        )
        image_url = await ai.generate_image(image_prompt, size="1024x1792")

        import os
        from uuid import uuid4
        if image_url and os.path.isfile(image_url):
            from shared.brand import render_story_text, BRAND
            story_img = f"story_{uuid4().hex[:8]}.jpg"
            ok = render_story_text(
                image_url, story_img,
                headline=headline or "", subtitle=benefit or "", hashtags="",
                mention=BRAND["instagram"], cta=fmt["cta"],
                badge=fmt["badge"], layout=fmt["layout"], options=options,
                note=fmt["note"], accent=(fmt["key"] == "promo"),
                points=points, section=fmt.get("section", ""),
            )
            final_img = story_img if ok else image_url
            from aiogram.types import FSInputFile
            await _bot.send_photo(admin_id, photo=FSInputFile(final_img),
                                  caption=f"☀️ <b>{fmt['ru']}</b>", parse_mode="HTML")
            from shared.instagram import post_to_instagram
            success = await post_to_instagram(final_img, "", post_type="story")
            if success:
                _mark_published("morning", image=final_img, caption=post_text, title=headline)
                await _bot.send_message(admin_id, "✅ <i>Опубликовано в Instagram Stories</i>", parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, "⚠️ Не удалось сгенерировать изображение утреннего сторис.", parse_mode="HTML")

    except Exception as e:
        logging.error(f"morning_post error: {e}", exc_info=True)

_last_morning_date = None   # защита от двойного утреннего поста в одну и ту же минуту


async def morning_post_dynamic_check():
    """Ежеминутная проверка: если наступило идеальное время для утреннего поста, запускаем его."""
    global _last_morning_date
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone(timedelta(hours=5)))
    month = now.month
    
    # Абсолютная автоматизация: статистика Instagram + рассвет/закат
    # Лето (апрель - сентябрь): светает рано, люди просыпаются раньше -> 07:15
    # Зима (октябрь - март): светает поздно, люди спят дольше -> 08:15
    if 4 <= month <= 9:
        target_hour = 7
        target_minute = 15
    else:
        target_hour = 8
        target_minute = 15
        
    if now.hour == target_hour and now.minute == target_minute:
        # Идемпотентность: не постить повторно, если уже постили сегодня (джиттер планировщика)
        if _last_morning_date == now.date():
            return
        _last_morning_date = now.date()
        await morning_post()


async def evening_post():
    """Ежедневно в 18:00: вечерний пост с уникальным блюдом."""
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        day_of_year = now.timetuple().tm_yday
        day_name = now.strftime('%A')
        weather = await fetch_weather_samarkand()

        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()
        
        import os
        import json
        # Разнообразие: каждый день другая кухня мира + формат блюда + «герой»-зелень
        brief = build_recipe_brief(now.date())
        lang_uz = brief["lang"] == "uz"
        lang_name = "узбекском языке (латиница, O'zbek tili)" if lang_uz else "русском языке"
        # Сезон/повод дня — чистая математика по дате (без AI-вызова), чтобы блюдо попадало
        # в момент (жара, Рамазан, школа…)
        from shared.trends import get_uz_season_occasion
        _so = get_uz_season_occasion(now.date())
        occasion = _so.get("occasion") or ""
        season = _so.get("season") or ""
        occ_hint = (f"Сезон/повод: {season}{(', ' + occasion) if occasion else ''} — "
                    f"учти при выборе блюда (лёгкость/сытность, праздничность).\n")

        raw = await ai.chat_completion(
            "Ты шеф-повар мирового уровня в Microgreen Uzbekistan и знаешь кухни всех стран. "
            "Верни ТОЛЬКО валидный JSON, без markdown." + BRAND_TEXT_STYLE + CONTENT_POLICY,
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
            data = json.loads(raw.strip().strip('`').replace('json\n', '', 1))
        except Exception:
            data = {}
        title = data.get("title") or ("Kechki retsept" if lang_uz else "Вечерний рецепт")
        ingredients = [str(x) for x in (data.get("ingredients") or [])]
        steps = [str(x) for x in (data.get("steps") or [])]
        secret = data.get("secret") or ""

        # Фото ДОЛЖНО соответствовать рецепту → промпт строим детерминированно из блюда и ингредиентов
        # (без второго вызова AI, чтобы фото не «уплывало» от рецепта). Текст впечатаем сами (в бренде).
        ing_for_photo = ", ".join(ingredients[:5]) if ingredients else "fresh microgreens"
        image_prompt = (
            f"Photorealistic vertical 9:16 professional food photograph for Instagram story, "
            f"authentic {brief['cuisine']} cuisine plating and styling, warm evening light, "
            f"fresh microgreens and edible flowers as garnish. "
            f"The dish on the plate is exactly: {title} — made with {ing_for_photo}. "
            f"Show precisely THIS dish, appetizing and true to these ingredients. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
        )
        image_url = await ai.generate_image(image_prompt, size="1024x1792")

        if image_url and os.path.isfile(image_url):
            from shared.brand import render_recipe_card
            from uuid import uuid4
            story_img = f"recipe_{uuid4().hex[:8]}.jpg"
            # На картинке — только название + ингредиенты + CTA (шаги в подпись)
            ok = render_recipe_card(image_url, story_img, title, ingredients, cta="Buyurtma berish")
            final_img = story_img if ok else image_url
            # Подробный рецепт (шаги) — в ПОДПИСИ (caption), не на картинке
            steps_txt = "\n".join(f"{n}. {s}" for n, s in enumerate(steps, 1)) or "—"
            caption = (
                f"🍽 <b>{title}</b>\n\n"
                f"👨‍🍳 <b>Tayyorlash:</b>\n{steps_txt}\n"
                + (f"\n🔑 <i>Sirimiz:</i> {secret}\n" if secret else "")
                + "\n📞 +998 94 999 95 99 · Buyurtma berish\n#MicrogreenUzbekistan"
            )
            from aiogram.types import FSInputFile
            await _bot.send_photo(admin_id, photo=FSInputFile(final_img), caption=caption[:1024], parse_mode="HTML")
            from shared.instagram import post_to_instagram
            success = await post_to_instagram(final_img, "", post_type="story")
            if success:
                _mark_published("recipe", image=final_img, caption=caption, title=title)
                await _bot.send_message(admin_id, "✅ <i>Рецепт опубликован в Instagram Stories</i>", parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, "⚠️ Не удалось сгенерировать фото рецепта.", parse_mode="HTML")

    except Exception as e:
        logging.error(f"evening_post error: {e}", exc_info=True)


async def afternoon_post():
    """Ежедневно в 14:00: Дневной пост (UGC Отзыв и Карусель)."""
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        weather = await fetch_weather_samarkand()
        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()
        
        prompt = (
            "Создай дневной пост (14:00) для Microgreen Uzbekistan. "
            "Формат: UGC (пользовательский контент). Напиши реалистичный, эстетичный отзыв от лица выдуманного шеф-повара известного ресторана в Самарканде или от довольного клиента о том, как наша микрозелень преобразила их блюдо.\n"
            "Пост должен быть в кавычках (цитата), с эмодзи. Без упоминания того, что это сгенерировано ИИ."
        )
        post_text = await ai.chat_completion(
            "Ты копирайтер.",
            prompt
        )

        # Generate 1 image for the post
        image1_prompt = await ai.chat_completion(
            "Ты дизайнер и фотограф.", 
            f"Напиши промпт на английском для DALL-E 3 (photorealistic, highly detailed, vertical format for Instagram stories, bright daylight). Картинка: Красивое ресторанное блюдо, обильно украшенное свежей микрозеленью. Контекст: {post_text[:200]}"
        )
        image1_url = await ai.generate_image(image1_prompt, size="1024x1792")
        
        report = (
            f"💬 <b>Отзывы о нас</b>\n"
            f"📅 {now.strftime('%d.%m.%Y')} | {weather}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"{post_text}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🎨 <i>Content Bot — дневной формат</i>"
        )
        
        if image1_url and os.path.isfile(image1_url):
            from aiogram.types import FSInputFile
            await _bot.send_photo(
                admin_id, 
                photo=FSInputFile(image1_url), 
                caption=report[:1024], 
                parse_mode="HTML"
            )
            if len(report) > 1024:
                await _bot.send_message(admin_id, report[1024:], parse_mode="HTML")
                
            from shared.instagram import post_story_with_text
            success = await post_story_with_text(image1_url, "Нам доверяют", post_text)
            if success:
                await _bot.send_message(admin_id, "✅ <i>Дневной сторис опубликован в Instagram!</i>", parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, report, parse_mode="HTML")
            
    except Exception as e:
        logging.error(f"afternoon_post error: {e}", exc_info=True)


# ── Регистрация задач ────────────────────────────────────────────────────
async def weekly_grid_post():
    """Раз в неделю (Сб 12:00): курируемый ФЛАГМАНСКИЙ пост в СЕТКУ (feed) с полной подписью."""
    try:
        import os
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()
        pillar = get_weekly_grid_pillar()
        brief = build_brief(pillar, "еженедельный флагманский пост в ленту")

        # Язык поста — строго RU или UZ по рубрике/ситуации (никогда не английский)
        from shared.content_plan import pick_language, LANG_INSTRUCTION
        lang = pick_language(pillar)
        lang_name = LANG_INSTRUCTION[lang]

        post_text = await ai.chat_completion(
            "Ты главный SMM-редактор бренда Microgreen Uzbekistan. Пиши сильный, ценный пост "
            "для ленты Instagram — с пользой/историей и чётким призывом к действию." + BRAND_TEXT_STYLE + CONTENT_POLICY + "\n\n" + brief,
            f"Создай еженедельный флагманский пост в ленту по рубрике «{pillar['name']}». "
            f"⚠️ ЯЗЫК: пиши ПОЛНОСТЬЮ на {lang_name} языке. Категорически НЕ на английском. "
            f"4-7 абзацев, живо, с эмодзи, в конце — призыв к действию и контакты."
        )
        # Подпись для ленты: срезаем AI-хэштеги (модель их коверкала) и ставим фиксированный
        # брендовый набор детерминированно — только в ленте подпись реально индексируется.
        import re as _re
        from shared.brand import BRAND_HASHTAGS
        body = _re.sub(r"#\S+", "", post_text).rstrip()
        feed_caption = f"{body}\n\n{BRAND_HASHTAGS}"

        # Чистое премиальное фото под тему (текст — в подписи поста, не на картинке)
        image_prompt = (
            f"Photorealistic premium square 1:1 Instagram feed photo for a microgreens brand. "
            f"Fresh microgreens, salads and beautiful plating, natural soft light, clean aesthetic composition, "
            f"theme: {pillar['name']}. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
        )
        image_url = await ai.generate_image(image_prompt, size="1024x1024")  # 1:1 — безопасно для ленты

        if image_url and os.path.isfile(image_url):
            from aiogram.types import FSInputFile
            # В ленту подпись идёт отдельно (feed поддерживает caption) — показываем её как подпись к фото,
            # чтобы можно было проверить текст и язык. Отдельного текстового сообщения после фото нет.
            await _bot.send_photo(admin_id, photo=FSInputFile(image_url), caption=feed_caption[:1024], parse_mode="HTML")
            from shared.instagram import post_to_instagram
            ok = await post_to_instagram(image_url, feed_caption, post_type='feed')
            if ok:
                _mark_published("grid", image=image_url, caption=post_text, title=pillar["name"])
                await _bot.send_message(admin_id, "✅ <i>Пост недели опубликован в ленту Instagram</i>", parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, "⚠️ Не удалось сгенерировать фото поста недели.", parse_mode="HTML")
    except Exception as e:
        logging.error(f"weekly_grid_post error: {e}", exc_info=True)


async def daily_site_recipe():
    """Забрать «рецепт дня» с сайта (единый AI-источник) и прислать админу.

    Витрина генерирует один рецепт дня на AI. content_bot подтягивает его, чтобы
    соцсети и сайт показывали ОДИН и тот же рецепт — контент и витрина связаны.
    """
    try:
        import os
        import aiohttp
        api = os.getenv("STOREFRONT_API_URL", "http://web:3000/api").rstrip("/")
        async with aiohttp.ClientSession() as s:
            async with s.get(
                f"{api}/content/recipe-of-day",
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    logging.warning("daily_site_recipe: HTTP %s", resp.status)
                    return
                data = await resp.json()
        caption = (data.get("captionRu") or "").strip()
        if not caption:
            return
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        if admin_id and _bot:
            await _bot.send_message(
                admin_id,
                f"🍽 <b>Рецепт дня с сайта</b> (готов к публикации):\n\n{caption[:3500]}",
                parse_mode="HTML",
            )
    except Exception as e:
        logging.error("daily_site_recipe error: %s", e)


# ── Reels: главный двигатель органического охвата ────────────────────────────
# Reel собираем из info-кадра (лайфхак/факт/рецепт): та же генерация {headline, points}
# + фото → render_story_text (пункты на кадре) → Ken Burns (ffmpeg). Reels идут в
# рекомендации НЕ-подписчикам, поэтому 3×/неделю — это макс. охват.
REEL_INFO_FORMATS = ["tip", "fact", "mini_recipe"]


async def reel_post():
    """Reel из info-контента: лайфхак/факт/рецепт — пункты на кадре + плавный zoom."""
    try:
        import os, json
        from shared.content_plan import (
            MORNING_FORMATS, get_daily_tip_theme, get_daily_fact_theme,
        )
        from shared.video_utils import make_reel, ffmpeg_available
        from shared.brand import render_story_text, BRAND, BRAND_HASHTAGS
        from uuid import uuid4

        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()

        if not ffmpeg_available():
            await _bot.send_message(admin_id, "⚠️ Reel не собран: ffmpeg недоступен в окружении.", parse_mode="HTML")
            return

        # Ротация info-формата по дню (лайфхак / факт / мини-рецепт)
        key = REEL_INFO_FORMATS[now.timetuple().tm_yday % len(REEL_INFO_FORMATS)]
        fmt = next(f for f in MORNING_FORMATS if f["key"] == key)
        # Тема из актуальной повестки — только для нужного плейсхолдера (не оба)
        ctx = await get_daily_context()
        angle = fmt["angle"]
        if "{fact}" in angle:
            angle = angle.replace("{fact}", await build_topical_angle(
                "fact", ctx, fallback=get_daily_fact_theme(now.date())))
        if "{tip}" in angle:
            angle = angle.replace("{tip}", await build_topical_angle(
                "tip", ctx, fallback=get_daily_tip_theme(now.date())))

        raw = await ai.chat_completion(
            "Sen Microgreen Uzbekistan SMM-menejeri. Faqat VALID JSON qaytar." + CONTENT_POLICY,
            f"Vazifa: {angle}\n"
            f'JSON: {{"headline":"...","points":["...","...","..."]}}\n'
            f"headline ≤5 so'z; points — 2-3 ANIQ nuqta (harorat/muddat/usul), har biri ≤7 so'z. "
            f"UMUMIY gaplar QAT'IY TAQIQ. FAQAT Uzbek Latin, emoji va tinish belgilarisiz.",
            temperature=0.7,
        )
        try:
            data = json.loads(raw.strip().strip('`').replace('json\n', '', 1))
        except Exception:
            data = {}
        headline = str(data.get("headline") or "").strip() or "Mikrozelen foydasi"
        points = [str(x).strip() for x in (data.get("points") or []) if str(x).strip()][:3]

        image_prompt = (
            f"Photorealistic vertical 9:16 photo for Instagram reel. {fmt['photo']}. "
            f"Aesthetic, premium, natural light. Keep a clean empty area for a text overlay. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
        )
        image_url = await ai.generate_image(image_prompt, size="1024x1792")
        if not (image_url and os.path.isfile(image_url)):
            await _bot.send_message(admin_id, "⚠️ Reel: не удалось сгенерировать фон.", parse_mode="HTML")
            return

        frame = f"reel_{uuid4().hex[:8]}.jpg"
        render_story_text(
            image_url, frame,
            headline=headline, mention=BRAND["instagram"], cta=fmt["cta"],
            badge=fmt["badge"], layout=fmt["layout"], note=fmt["note"],
            points=points or None, section=fmt.get("section", ""),
        )
        reel = make_reel(frame, out_path=f"reel_{uuid4().hex[:8]}.mp4", duration=8.0)
        if not reel:
            await _bot.send_message(admin_id, "⚠️ Reel: сборка видео не удалась (ffmpeg).", parse_mode="HTML")
            return

        pts_txt = "\n".join(f"• {p}" for p in points) if points else ""
        caption = (f"{headline}\n\n{pts_txt}\n\n"
                   f"📞 {BRAND['phone']} · Buyurtma berish\n\n{BRAND_HASHTAGS}").strip()

        from aiogram.types import FSInputFile
        await _bot.send_video(admin_id, video=FSInputFile(reel),
                              caption=f"🎬 <b>Reel: {fmt['ru']}</b>", parse_mode="HTML")
        from shared.instagram import post_reel
        ok = await post_reel(reel, caption, share_to_feed=True)
        if ok:
            _mark_published("reel", image=frame, caption=caption, title=headline)
            await _bot.send_message(admin_id, "✅ <i>Reel опубликован в Instagram</i>", parse_mode="HTML")
    except Exception as e:
        logging.error(f"reel_post error: {e}", exc_info=True)

async def publish_restaurant_of_week():
    """Публикация рубрики 'Ресторан недели' и запуск события MAGAZINE_PUBLISHED."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.event_bus import event_bus
        admin_id = settings.admin_telegram_ids[0]
        
        async with get_session_ctx() as session:
            res = await session.execute(text(
                "SELECT name, city, cuisine, dishes, microgreens FROM restaurants "
                "WHERE tier = 'premium' ORDER BY RANDOM() LIMIT 1"
            ))
            row = res.fetchone()
            
        if not row:
            return
            
        name, city, cuisine, dishes, microgreens = row
        cuisine_str = ", ".join(cuisine) if isinstance(cuisine, list) else str(cuisine)
        dishes_str = ", ".join(dishes) if isinstance(dishes, list) else str(dishes)
        mg_str = ", ".join(microgreens) if isinstance(microgreens, list) else str(microgreens)
        
        post_text = (
            f"🍽 <b>Ресторан недели: {name} ({city.title()})</b>\n\n"
            f"Кухня: {cuisine_str}\n"
            f"Знаковые блюда: {dishes_str}\n"
            f"Рекомендуемая микрозелень: {mg_str}\n\n"
            f"<i>Читайте полный обзор в новом выпуске FRESH WEEKLY:</i>\n"
            f"👉 microgreenuzbekistan.com/magazine\n"
        )
        
        if _bot:
            await _bot.send_message(admin_id, f"📰 <b>Опубликовано в канал:</b>\n\n{post_text}", parse_mode="HTML")
            
        # Уведомляем Sales Bot, что вышел журнал с упоминанием ресторана!
        await event_bus.publish("MAGAZINE_PUBLISHED", {
            "rubric": "restaurant_of_week",
            "restaurant_name": name,
            "city": city,
            "microgreens_recommended": mg_str
        }, "content_bot")
        
    except Exception as e:
        logging.error(f"publish_restaurant_of_week error: {e}", exc_info=True)



scheduler.add_cron(name="daily_site_recipe", func=daily_site_recipe, hour=9, minute=30)
scheduler.add_cron(name="daily_content_ideas", func=daily_content_ideas, hour=8, minute=0)
scheduler.add_cron(name="weekly_grid_post", func=weekly_grid_post, hour=12, minute=0, day_of_week=5)
scheduler.add_cron(name="product_description_audit", func=product_description_audit, hour=11, minute=0, day_of_week=0)
scheduler.add_cron(name="weekly_content_plan", func=weekly_content_plan, hour=20, minute=0, day_of_week=6)
scheduler.add_interval(seconds=60, name="morning_post_dynamic_check", func=morning_post_dynamic_check)
# afternoon_post (дневной сторис-отзыв) отключён по решению — функция оставлена, но не в расписании
scheduler.add_cron(name="evening_post", func=evening_post, hour=18, minute=0)
# Reels — 3×/неделю (Пн/Ср/Пт, 19:00): главный двигатель органического охвата
scheduler.add_cron(name="reel_post_mon", func=reel_post, hour=19, minute=0, day_of_week=0)
scheduler.add_cron(name="reel_post_wed", func=reel_post, hour=19, minute=0, day_of_week=2)
scheduler.add_cron(name="reel_post_fri", func=reel_post, hour=19, minute=0, day_of_week=4)
# Рубрики журнала
scheduler.add_cron(name="publish_restaurant_of_week", func=publish_restaurant_of_week, hour=11, minute=0, day_of_week=0)


# ═══════════════════════════════════════════════════════════════════════════
# BOT BUS HANDLERS — задачи от Степана
# ═══════════════════════════════════════════════════════════════════════════

async def bus_publish_story(params: dict) -> dict:
    """Генерирует картинку по теме и публикует в Instagram Stories."""
    topic = params.get("topic", "микрозелень")
    admin_id = settings.admin_telegram_ids[0]
    ai = AIEngine()
    
    # Генерируем текст поста
    post_text = await ai.chat_completion(
        "Ты SMM-менеджер Microgreen Uzbekistan." + BRAND_TEXT_STYLE + CONTENT_POLICY,
        f"Напиши короткий, цепляющий текст для Instagram Stories на тему: {topic}. "
        "Максимум 3-4 предложения, добавь эмодзи. На русском языке."
    )
    
    # Генерируем короткий заголовок для картинки
    headline = await ai.chat_completion(
        "Ты копирайтер.",
        f"Придумай ОДИН короткий, броский заголовок (максимум 2-4 слова) на ТОМ ЖЕ ЯЗЫКЕ, что и тема (узбекский или русский). Пиши ТОЛЬКО сам заголовок без кавычек:\nТема: {topic}"
    )
    
    # Строгий шаблон DALL-E промпта без вызова AI
    image_prompt = (
        f"A beautiful vertical (9:16) Instagram Stories image. Topic: {topic}. "
        f"Style: modern, vibrant, appetizing, professional food photography. "
        f"The image MUST contain the bold typography text \"{headline}\" placed elegantly. "
        f"DO NOT TRANSLATE THE TEXT. USE THE EXACT CYRILLIC/LATIN CHARACTERS: \"{headline}\". "
        f"Absolutely no other text or English words on the image."
    )
    
    image_url = await ai.generate_image(image_prompt, size="1024x1792")
    
    if image_url:
        # Отправляем в Telegram
        from aiogram.types import FSInputFile
        photo_file = FSInputFile(image_url) if os.path.isfile(image_url) else image_url
        await _bot.send_photo(
            admin_id, photo=photo_file,
            caption=f"📸 <b>Сторис по запросу:</b> {topic}\n\n{post_text}",
            parse_mode="HTML"
        )
        
        # Публикуем в Instagram
        from shared.instagram import post_story_with_text
        public_url = getattr(ai, "_last_image_url", image_url) or image_url
        success = await post_story_with_text(public_url, headline, post_text)
        status = "опубликован в Instagram Stories" if success else "отправлен только в Telegram"
        return {"status": "ok", "message": f"Сторис '{topic}' — {status}"}
    
    return {"status": "error", "message": "Не удалось сгенерировать изображение"}


async def bus_generate_meme(params: dict) -> dict:
    """Генерирует актуальный мем и публикует в Instagram."""
    topic = params.get("topic", "микрозелень")
    admin_id = settings.admin_telegram_ids[0]
    ai = AIEngine()
    
    context = await fetch_uzbek_trends()
    
    meme_idea = await ai.chat_completion(
        "Ты топовый мемолог Узбекистана. Аудитория: молодёжь 18-35, женщины, ЗОЖники.",
        f"Тема: {topic}\n\nАКТУАЛЬНЫЙ КОНТЕКСТ:\n{context}\n\n"
        f"Создай вирусный мем связанный с темой '{topic}' и актуальными трендами. "
        f"Юмор для узбекской аудитории. На русском. Опиши сцену и пунчлайн."
    )
    
    headline = await ai.chat_completion(
        "Ты редактор мемов.",
        f"Выдели ОДНУ смешную фразу (до 5 слов) на РУССКОМ. Без кавычек:\n{meme_idea}"
    )
    
    image_prompt = await ai.chat_completion(
        "Ты создатель мемов.",
        f"Промпт на английском для DALL-E 3 (funny meme, vertical for Instagram Stories). "
        f"Вписать текст: \"{headline}\" (bold white text, black outline, meme font). Ситуация: {meme_idea[:300]}"
    )
    image_url = await ai.generate_image(image_prompt, size="1024x1792")
    
    if image_url:
        from aiogram.types import FSInputFile
        photo_file = FSInputFile(image_url) if os.path.isfile(image_url) else image_url
        await _bot.send_photo(admin_id, photo=photo_file, caption=f"😂 <b>Мем по запросу:</b> {topic}\n\n{meme_idea}", parse_mode="HTML")
        
        from shared.instagram import post_story_with_text
        success = await post_story_with_text(image_url, headline, meme_idea)
        status = "опубликован в Instagram Stories" if success else "только в Telegram"
        return {"status": "ok", "message": f"Мем '{topic}' — {status}"}
    
    return {"status": "error", "message": "Не удалось сгенерировать мем"}


async def bus_get_status(params: dict) -> dict:
    """Реальный статус публикаций контента на сегодня (для Степана)."""
    return {"status": "ok", "message": _content_status_message()}


async def bus_product_description(params: dict) -> dict:
    """
    Описание нового товара для карточки в магазине — работа контент-отдела.

    Руководитель даёт название, цену и фото; текст (ru + uz) пишем мы, в
    фирменном тоне бренда. Вызывается Степаном при заведении товара.
    """
    import json

    name = str(params.get("name") or "").strip()
    category = str(params.get("category") or "microgreens")
    price = params.get("price")
    if not name:
        return {"status": "error", "message": "Не указано название товара."}

    from shared.ai_engine import AIEngine
    from shared.brand import BRAND_TEXT_STYLE

    ai = AIEngine()
    sys_prompt = (
        f"Ты — контент-менеджер Microgreen Uzbekistan. {BRAND_TEXT_STYLE}\n"
        "Пишешь описание товара для карточки интернет-магазина: польза, вкус, "
        "применение на кухне, почему стоит взять. Без выдуманных фактов о составе "
        "и без обещаний лечебного эффекта.\n"
        'Верни ТОЛЬКО JSON: {"ru": "<описание на русском, 2-3 предложения>", '
        '"uz": "<то же на узбекском>"}'
    )
    user_prompt = f"Товар: {name}\nКатегория: {category}\nЦена: {price} сум"

    try:
        raw = await ai.chat_completion(sys_prompt, user_prompt, temperature=0.7, max_tokens=400)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(cleaned)
        return {
            "status": "ok",
            "message": "Описание готово.",
            "data": {"ru": str(data.get("ru", "")).strip(), "uz": str(data.get("uz", "")).strip()},
        }
    except Exception as e:
        logging.error(f"CONTENT_BOT: описание товара не получилось: {e}", exc_info=True)
        return {"status": "error", "message": f"Не смог составить описание: {e}"}


async def bus_get_last_post(params: dict) -> dict:
    """
    Отдать САМ опубликованный контент (картинка + текст), чтобы Степан мог
    ПОКАЗАТЬ его руководителю, а не пересказывать расписание.

    params.day: 'today' (по умолчанию) | 'yesterday' | 'YYYY-MM-DD' | 'last'
    Если за нужный день пусто — честно возвращаем последние публикации.
    """
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
        target = day  # ожидаем YYYY-MM-DD

    posts = get_publications(target) if target else get_last_publications()
    fell_back = False
    if not posts and target:
        # за нужный день ничего — покажем последнее, что реально выходило
        posts = get_last_publications()
        fell_back = True

    if not posts:
        return {
            "status": "ok",
            "data": {"posts": [], "fell_back": False},
            "message": (
                "Пока нет ни одной сохранённой публикации.\n\n"
                + _content_status_message()
            ),
        }

    if fell_back:
        msg = "За сегодня публикаций ещё нет. Вот последнее, что выходило:"
    else:
        msg = f"Публикаций за {target or 'последние дни'}: {len(posts)}"

    return {"status": "ok", "message": msg, "data": {"posts": posts, "fell_back": fell_back}}


# ═══════════════════════════════════════════════════════════════════════════
# EVENTBUS HANDLER
# ═══════════════════════════════════════════════════════════════════════════

async def handle_task_created(payload: dict):
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "content":
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return
    
    bot = Bot(token=settings.content_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        from shared.ai_engine import AIEngine
        ai = AIEngine()
        
        title = str(data.get('title', '')).lower()
        desc = str(data.get('description', '')).lower()
        combined = f"{title} {desc}"

        # ── Инквайри-гард: это ВОПРОС о статусе/расписании, а НЕ задача на публикацию ──
        # (иначе «уточнить статус публикации рецепта» приводил к реальной генерации и постингу)
        inquiry_words = ["уточни", "уточнение", "статус", "status", "во сколько",
                         "расписан", "график", "опубликова ли", "когда опублик", "проверь публикац"]
        if any(w in combined for w in inquiry_words):
            schedule = (
                "🗓 <b>Расписание публикаций контента</b>\n"
                "• Рецепт дня — ежедневно в <b>18:00</b>\n"
                "• Утренний сторис — <b>07:15</b> (лето) / <b>08:15</b> (зима)\n"
                "• Пост недели в ленту — <b>суббота, 12:00</b>\n\n"
                "Всё публикуется <b>автоматически</b> по расписанию — отдельная задача на публикацию не нужна."
            )
            await bot.send_message(chat_id, schedule, parse_mode="HTML")
            return

        # Определяем форматы по ключевым словам
        is_story = any(word in title or word in desc for word in ["сторис", "stories", "инстаграм", "instagram", "выложи", "опубликуй", "мем", "рецепт", "опрос", "poll", "викторина", "отзыв"])
        is_poll = any(word in title or word in desc for word in ["опрос", "poll", "викторина", "голосование"])
        needs_photo = is_story or any(word in title or word in desc for word in ["фото", "картинк", "изображен", "image", "picture"])
        
        from shared.prompts import TEAM_CONTEXT
        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Главный Редактор (Chief Editor) и Brand Manager. Твоя задача — создавать премиальный контент (Tone of Voice: профессиональный, экологичный, ЗОЖ).{CONTENT_POLICY}"
        user_prompt = f"Руководитель поручил задачу:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\nРазработай готовый контент (текст поста, мема, рецепта или отзыва)."
        
        if is_poll:
            user_prompt += "\nВНИМАНИЕ: Так как запрошен ОПРОС, верни В КОНЦЕ текста валидный JSON блок (внутри ```json ```) формата: {\"question\": \"...\", \"options\": [\"вариант1\", \"вариант2\"]}"
            
        logging.info("CONTENT_BOT Generating AI answer...")
        answer = await ai.chat_completion(sys_prompt, user_prompt)
        
        # Парсим JSON опроса если он есть
        poll_data = None
        clean_answer = answer
        if is_poll and "```json" in answer:
            import json
            try:
                parts = answer.split("```json")
                clean_answer = parts[0].strip()
                json_str = parts[1].split("```")[0].strip()
                poll_data = json.loads(json_str)
            except Exception as e:
                logging.error(f"Error parsing poll JSON: {e}")
        
        image_url = None
        if needs_photo:
            logging.info("CONTENT_BOT Generating DALL-E image...")
            headline = await ai.chat_completion(
                "Ты крутой копирайтер.",
                f"Придумай ОДИН короткий, броский заголовок (максимум 2-4 слова) на ТОМ ЖЕ ЯЗЫКЕ, что и текст (узбекский или русский). Пиши ТОЛЬКО сам заголовок без кавычек:\n{clean_answer[:500]}"
            )
            # Избавляемся от второго вызова ИИ для промпта, формируем его по строгому шаблону
            dalle_prompt = (
                f"A vibrant, highly detailed vertical (9:16) Instagram Stories image. "
                f"Scene context: {clean_answer[:200]}. "
                f"The image MUST contain the bold typography text \"{headline}\" placed elegantly. "
                f"DO NOT TRANSLATE THE TEXT. USE THE EXACT CYRILLIC/LATIN CHARACTERS: \"{headline}\". "
                f"Absolutely no other text or English words on the image."
            )
            image_url = await ai.generate_image(dalle_prompt, size="1024x1792")
        
        logging.info(f"CONTENT_BOT sending message to {chat_id}")
        
        # 1. Отправляем фото/текст в Telegram
        if image_url:
            from aiogram.types import FSInputFile
            media = FSInputFile(image_url) if os.path.isfile(image_url) else image_url
            await bot.send_photo(chat_id, photo=media, caption=f"📝 <b>Контент готов:</b>\n\n{clean_answer[:900]}", parse_mode="HTML")
            if len(clean_answer) > 900:
                await bot.send_message(chat_id, f"...продолжение:\n\n{clean_answer[900:]}", parse_mode="HTML")
        else:
            from shared.task_ui import get_task_keyboard
            await bot.send_message(chat_id, f"📝 <b>Контент готов:</b>\n\n{clean_answer}", parse_mode="HTML", reply_markup=get_task_keyboard(task_id))
            
        # 2. Отправляем опрос в Telegram
        if poll_data and isinstance(poll_data, dict) and "question" in poll_data and "options" in poll_data:
            await bot.send_poll(chat_id, question=poll_data["question"], options=poll_data["options"])
            
        # 3. Публикуем в Instagram Stories
        if is_story and image_url:
            from shared.instagram import post_story_with_text
            public_url = getattr(ai, "_last_image_url", image_url) or image_url
            success = await post_story_with_text(public_url, headline, clean_answer)
            if success:
                await bot.send_message(chat_id, "✅ <i>Контент успешно опубликован в Instagram Stories!</i>", parse_mode="HTML")
            else:
                await bot.send_message(chat_id, "⚠️ <i>Не удалось опубликовать в Instagram. Ошибка интеграции.</i>", parse_mode="HTML")

        logging.info("CONTENT_BOT successfully handled task.")
            
    except Exception as e:
        logging.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

# ═══════════════════════════════════════════════════════════════════════════
# ТЕСТОВЫЕ КОМАНДЫ (только Telegram, без публикации в Instagram)
# ═══════════════════════════════════════════════════════════════════════════
test_router = Router()


def _is_admin(message: Message) -> bool:
    return bool(message.from_user) and message.from_user.id in settings.admin_telegram_ids


@test_router.message(Command("testday"))
async def cmd_test_day(message: Message):
    """Прогнать ВЕСЬ дневной контент — отправить только в Telegram, в Instagram НЕ публиковать."""
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    await message.answer(
        "🧪 <b>Тестовый прогон контента на день</b>\n"
        "Всё уйдёт <b>только в Telegram</b>, в Instagram НЕ публикуется.\n"
        "Генерация займёт пару минут…"
    )
    set_dry_run(True)
    steps = [
        ("① Утренний сторис", morning_post),
        ("② Вечерний сторис-рецепт", evening_post),
        ("③ Пост недели в ленту", weekly_grid_post),
    ]
    try:
        for label, func in steps:
            await message.answer(f"⏳ {label}…")
            try:
                await func()
            except Exception as e:  # noqa: BLE001
                await message.answer(f"⚠️ {label}: ошибка — {e}")
        await message.answer("✅ Готово. Всё отправлено только в Telegram (Instagram не тронут).")
    finally:
        set_dry_run(False)


@test_router.message(Command("teststory"))
async def cmd_test_story(message: Message):
    """Прогнать один утренний сторис (только Telegram)."""
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    await message.answer("🧪 Тест одного сторис (только Telegram)…")
    set_dry_run(True)
    try:
        await morning_post()
        await message.answer("✅ Готово (в Instagram не публиковалось).")
    finally:
        set_dry_run(False)


@test_router.message(Command("testgrid"))
async def cmd_test_grid(message: Message):
    """Прогнать недельный пост в ленту (только Telegram)."""
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    await message.answer("🧪 Тест поста недели в ленту (только Telegram)…")
    set_dry_run(True)
    try:
        await weekly_grid_post()
        await message.answer("✅ Готово (в Instagram не публиковалось).")
    finally:
        set_dry_run(False)


@test_router.message(Command("testreel"))
async def cmd_test_reel(message: Message):
    """Собрать Reel и отправить видео только в Telegram (в Instagram НЕ публиковать)."""
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    from shared.video_utils import ffmpeg_available
    if not ffmpeg_available():
        await message.answer("⚠️ ffmpeg недоступен — Reel собрать нельзя (нужен ffmpeg в образе).")
        return
    await message.answer("🧪 Собираю Reel (видео уйдёт только в Telegram)…")
    set_dry_run(True)
    try:
        await reel_post()
        await message.answer("✅ Готово (в Instagram не публиковалось).")
    finally:
        set_dry_run(False)



async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call
    await _shared_roll_call("content_bot", payload)


async def main():
    if not settings.content_bot_token:
        logger.error(f"FATAL: CONTENT_BOT_TOKEN is missing!")
        import sys
        sys.exit(1)

    global _bot
    await init_db()
    bot = Bot(token=settings.content_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    _bot = bot
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.task_ui import task_ui_router
    dp.include_router(task_ui_router)
    
    dp.include_router(test_router)  # тестовые команды — первыми, чтобы не перехватил catch-all
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(bot_info.username, ai_fallback, wake_words=["отдел контент", "контент", "content", "посты", "сторис"])
    dp.include_router(group_router)

    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8089)

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    asyncio.create_task(bus_listen("content_bot", {
        "publish_story": bus_publish_story,
        "publish_post": bus_publish_story,  # same handler, posts to Stories
        "generate_meme": bus_generate_meme,
        "get_status": bus_get_status,
        "get_last_post": bus_get_last_post,  # отдать САМ пост (картинка + текст)
        "product_description": bus_product_description,  # текст карточки нового товара
    }))

    # ── Запуск планировщика и heartbeat ──
    await scheduler.start()
    asyncio.create_task(start_heartbeat("content_bot"))

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())



