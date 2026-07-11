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
    get_daily_fact_theme, build_recipe_brief,
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

async def fetch_weather_samarkand() -> str:
    """Получает текущую погоду в Самарканде через Open-Meteo API."""
    try:
        url = "https://api.open-meteo.com/v1/forecast?latitude=39.627&longitude=66.974&current_weather=true"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    temp = data['current_weather']['temperature']
                    return f"Температура: {temp}°C"
    except Exception as e:
        logging.error(f"Weather fetch error: {e}")
    return "Неизвестно"

async def fetch_local_news() -> str:
    """Получает актуальные новости Узбекистана через RSS."""
    headlines = []
    rss_feeds = [
        "https://www.gazeta.uz/ru/rss/",
        "https://kun.uz/ru/rss",
        "https://daryo.uz/ru/rss",
    ]
    try:
        async with aiohttp.ClientSession() as session:
            for feed_url in rss_feeds:
                try:
                    async with session.get(feed_url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                        if resp.status == 200:
                            text = await resp.text()
                            # Простой парсинг RSS
                            import re
                            titles = re.findall(r'<title><!\[CDATA\[(.*?)\]\]></title>', text)
                            if not titles:
                                titles = re.findall(r'<title>(.*?)</title>', text)
                            headlines.extend(titles[1:6])  # Пропускаем название канала, берём 5
                except Exception:
                    continue
    except Exception as e:
        logging.error(f"News fetch error: {e}")
    
    if not headlines:
        headlines = ["Новости временно недоступны"]
    
    return "\n".join(f"• {h}" for h in headlines[:8])


async def fetch_uzbek_trends() -> str:
    """Собирает контекст для мема: новости, погоду, тренды Узбекистана."""
    ai = AIEngine()
    
    # Реальные новости
    news = await fetch_local_news()
    weather = await fetch_weather_samarkand()
    
    # AI анализирует тренды
    trends = await ai.chat_completion(
        "Ты аналитик трендов Узбекистана. Ты знаешь всё о жизни молодёжи, женщин, "
        "поваров, фермеров и предпринимателей в Узбекистане.",
        f"Сегодня {datetime.now().strftime('%d.%m.%Y, %A')}. Погода в Самарканде: {weather}.\n\n"
        f"Актуальные новости:\n{news}\n\n"
        "На основе этого определи:\n"
        "1. Какая тема сейчас горячая в Узбекистане?\n"
        "2. Что обсуждают в соцсетях (инста, TikTok)?\n"
        "3. Сезонные моменты (жара, урожай, отпуска, Рамадан, школа, экзамены)\n"
        "4. Что актуально для молодёжи и женщин?\n"
        "5. Кулинарные/ЗОЖ тренды\n\n"
        "Дай краткую сводку в 5-7 предложений."
    )
    
    return f"Погода: {weather}\nНовости:\n{news}\nТренды:\n{trends}"

async def morning_post():
    """Ежедневно в 09:00: утренний мотивационный пост с пользой микрозелени."""
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        day_of_year = now.timetuple().tm_yday
        day_name = now.strftime('%A')
        weather = await fetch_weather_samarkand()

        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()

        fact_theme = get_daily_fact_theme(now.date())
        prompt = (
            f"Создай утренний пост-сторис (доброе утро) для Microgreen Uzbekistan. "
            f"Контекст: день недели {day_name}, погода в Самарканде: {weather}.\n"
            f"Аудитория: домашние хозяйки и шеф-повара (HoReCa). Тон: тёплый, бодрый, полезный.\n"
            f"⭐ ГЛАВНОЕ: включи ОДИН конкретный полезный ФАКТ / практическую пользу по теме: «{fact_theme}». "
            f"1-2 предложения, заметно (💡/🌿). НЕ выдумывай цифры — если не уверен, дай пользу качественно.\n"
            f"Можно упомянуть салаты, витграсс, съедобные цветы. "
            f"С вероятностью 25% органично добавь промокод BODRLIK на скидку 10% (24 соат).\n"
            f"Пост уникальный, без упоминания ИИ. Пиши ТОЛЬКО на Uzbek Latin."
        )
        post_text = await ai.chat_completion(
            "Sen Microgreen Uzbekistan brendining SMM-menejeri va oshpaz-ekspertisan. "
            "Yorqin, foydali, emoji bilan yoz." + BRAND_TEXT_STYLE + CONTENT_POLICY + "\n\n" + build_brief(get_daily_pillar(), "утренний сторис"),
            prompt,
            temperature=0.85,
        )

        headline = await ai.chat_completion(
            "Sen kreativ kopirayter. Grammatik to'g'ri, tabiiy o'zbek tilida yoz, so'zlarni buzma." + CONTENT_POLICY,
            f"Shu post uchun qisqa, jozibali SARLAVHA (hook) o'ylab top — FAQAT Uzbek Latin, ko'pi bilan 5 so'z, "
            f"emoji va tinish belgilarisiz. Faqat sarlavhani yoz:\n{post_text[:500]}"
        )
        benefit = await ai.chat_completion(
            "Sen kopirayter. Grammatik to'g'ri, tabiiy o'zbek tilida yoz." + CONTENT_POLICY,
            f"Bitta ANIQ foyda iborasini yoz (masalan: vitaminlar, immunitet, energiya, hazm) — "
            f"Uzbek Latin, ko'pi bilan 6 so'z, emoji va tinish belgilarisiz. "
            f"MUHIM: bu sarlavhadan FARQ qilsin, uni takrorlama. Sarlavha: «{headline[:60]}». "
            f"Faqat iborani yoz:\n{post_text[:400]}"
        )

        # Чистое фото БЕЗ текста — заголовок/хэштеги/CTA впечатаем сами в бренде (всегда читаемо)
        image_prompt = await ai.chat_completion(
            "Ты дизайнер и фотограф. Ответь ТОЛЬКО англоязычным промптом для генерации фото.",
            f"Photorealistic vertical 9:16 photo for Instagram story, morning lighting, aesthetic layout, "
            f"fresh microgreens and healthy food, clean empty space at the top for a text overlay. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image. Контекст: {post_text[:200]}"
        )
        image_url = await ai.generate_image(image_prompt, size="1024x1792")

        import os
        if image_url and os.path.isfile(image_url):
            # Впечатываем текст в картинку → финальный сторис: заголовок + фраза пользы + CTA (минимум текста)
            from shared.brand import render_story_text, BRAND
            story_img = "temp_story.jpg"
            ok = render_story_text(
                image_url, story_img,
                headline=headline or "", subtitle=benefit or "", hashtags="",
                mention=BRAND["instagram"], cta="Batafsil",
            )
            final_img = story_img if ok else image_url
            from aiogram.types import FSInputFile
            await _bot.send_photo(admin_id, photo=FSInputFile(final_img))
            from shared.instagram import post_to_instagram
            success = await post_to_instagram(final_img, "", post_type="story")
            if success:
                _mark_published("morning", image=final_img, caption=post_text, title=headline)
                await _bot.send_message(admin_id, "✅ <i>Опубликовано в Instagram Stories</i>", parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, "⚠️ Не удалось сгенерировать изображение утреннего сторис.", parse_mode="HTML")

    except Exception as e:
        logging.error(f"morning_post error: {e}", exc_info=True)

async def morning_post_dynamic_check():
    """Ежеминутная проверка: если наступило идеальное время для утреннего поста, запускаем его."""
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
        # Чтобы избежать двойного запуска в ту же минуту, можно было бы добавить флаг,
        # но scheduler с интервалом в 60с гарантирует 1 запуск в эту минуту.
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

        raw = await ai.chat_completion(
            "Ты шеф-повар мирового уровня в Microgreen Uzbekistan и знаешь кухни всех стран. "
            "Верни ТОЛЬКО валидный JSON, без markdown." + BRAND_TEXT_STYLE + CONTENT_POLICY,
            f"Придумай блюдо на ужин с национальным колоритом, НЕ похожее на вчерашние.\n"
            f"Кухня дня: {brief['cuisine']}.\n"
            f"Формат блюда: {brief['format']}.\n"
            f"Главный герой из нашего ассортимента: {brief['hero']} — он ключевой в блюде или подаче.\n"
            f"Погода сегодня: {weather} — подбери лёгкость/сытность под неё.\n"
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
            story_img = "temp_story.jpg"
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
        
        if image1_url:
            from aiogram.types import FSInputFile
            media1 = FSInputFile(image1_url) if image1_url == "temp_img.jpg" else image1_url
            
            await _bot.send_photo(
                admin_id, 
                photo=media1, 
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
            await _bot.send_photo(admin_id, photo=FSInputFile(image_url), caption=post_text[:1024], parse_mode="HTML")
            from shared.instagram import post_to_instagram
            ok = await post_to_instagram(image_url, post_text, post_type='feed')
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


scheduler.add_cron(name="daily_site_recipe", func=daily_site_recipe, hour=9, minute=30)
scheduler.add_cron(name="daily_content_ideas", func=daily_content_ideas, hour=8, minute=0)
scheduler.add_cron(name="weekly_grid_post", func=weekly_grid_post, hour=12, minute=0, day_of_week=5)
scheduler.add_cron(name="product_description_audit", func=product_description_audit, hour=11, minute=0, day_of_week=0)
scheduler.add_cron(name="weekly_content_plan", func=weekly_content_plan, hour=20, minute=0, day_of_week=6)
scheduler.add_interval(seconds=60, name="morning_post_dynamic_check", func=morning_post_dynamic_check)
# afternoon_post (дневной сторис-отзыв) отключён по решению — функция оставлена, но не в расписании
scheduler.add_cron(name="evening_post", func=evening_post, hour=18, minute=0)


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
        photo_file = FSInputFile(image_url) if image_url == "temp_img.jpg" else image_url
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
        photo_file = FSInputFile(image_url) if image_url == "temp_img.jpg" else image_url
        await _bot.send_photo(admin_id, photo=photo_file, caption=f"😂 <b>Мем по запросу:</b> {topic}\n\n{meme_idea}", parse_mode="HTML")
        
        from shared.instagram import post_story_with_text
        success = await post_story_with_text(image_url, headline, meme_idea)
        status = "опубликован в Instagram Stories" if success else "только в Telegram"
        return {"status": "ok", "message": f"Мем '{topic}' — {status}"}
    
    return {"status": "error", "message": "Не удалось сгенерировать мем"}


async def bus_get_status(params: dict) -> dict:
    """Реальный статус публикаций контента на сегодня (для Степана)."""
    return {"status": "ok", "message": _content_status_message()}


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
            media = FSInputFile(image_url) if image_url == "temp_img.jpg" else image_url
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



async def handle_roll_call(payload: dict):
    from shared.config import settings
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode
    chat_id = payload.get("data", {}).get("chat_id")
    if not chat_id:
        return
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"ROLL_CALL received for chat {chat_id}")
    
    bot_name = "content_bot"
    token_attr = f"{bot_name}_token"
    token = getattr(settings, token_attr, None)
    if not token:
        logger.error(f"No token found for {bot_name}")
        return
        
    bot_display_names = {
        "sales_bot": "Отдел Продаж (Sales)",
        "marketing_bot": "Отдел Маркетинга",
        "support_bot": "Отдел Поддержки",
        "hr_bot": "Отдел HR",
        "finance_bot": "Отдел Финансов",
        "analytics_bot": "Отдел Аналитики",
        "content_bot": "Отдел Контента"
    }
    display_name = bot_display_names.get(bot_name, bot_name)

    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        await bot.send_message(chat_id, f"🟢 {display_name} на связи!")
    except Exception as e:
        logger.error(f"Failed to respond to roll_call: {e}")
    finally:
        await bot.session.close()


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



