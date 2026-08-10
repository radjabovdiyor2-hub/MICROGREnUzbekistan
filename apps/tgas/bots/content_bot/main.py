import asyncio
import logging



import os
from datetime import date, datetime, timedelta, timezone

from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import Message

from bots.content_bot.handlers import all_routers


from shared.ai_engine import AIEngine
from shared.brand import BRAND_TEXT_STYLE
from shared.prompts import TEAM_CONTEXT, role_prompt
from shared import catalog_repo
from shared.config import settings
from shared.content_archive import (
    get_last_publications_async as get_last_publications,
    get_publications_async as get_publications,
    mark_published as _mark_published,
    status_message_async as _content_status_message,
    tz_now as _tz_now,
)
from shared.content_plan import (
    build_brief,
    build_recipe_brief,
    get_daily_fact_theme,
    get_daily_morning_format,
    get_weekly_grid_pillar,
)
from shared.database import init_db
from shared.event_bus import event_bus
from shared.group_orchestrator import create_group_router
from shared.health import start_heartbeat
from shared.scheduler import BotScheduler
from shared.trends import (
    build_topical_angle,
    fetch_uzbek_trends,
    fetch_weather_samarkand,
    get_daily_context,
)
from shared.utils import simulate_typing

logger = logging.getLogger(__name__)


async def get_dynamic_content_policy() -> str:
    # Импорт внутри try, а не над ним: директива обучения — украшение поста,
    # и её недоступность не повод отменять публикацию. Именно эта строка,
    # стоявшая снаружи, 10.08.2026 превратила поломку feedback_loop в отказ
    # публикации — единственное место, где мёртвая петля обучения себя выдала.
    try:
        from shared.feedback_loop import feedback_loop

        active = await feedback_loop.get_active_behavior("content_bot", "weekly_reach")
        directives = [str(v) for v in active.values() if isinstance(v, str)]
        if directives:
            directive_text = " ".join(directives)
            return f"\n\n[ДИРЕКТИВА ИИ-АНАЛИТИКА: {directive_text}]\n"
    except Exception:
        pass
    return ""
logging.basicConfig(level=logging.INFO)

# ── Глобальные ссылки для задач ──────────────────────────────────────────
_bot: Bot = None
scheduler = BotScheduler("content_bot")

# Регистрация фоновых задач — отключено: ежедневный спам в лс админа
# scheduler.add_cron(hour=8, minute=0, name="daily_ideas", func=daily_content_ideas)
# scheduler.add_cron(hour=11, minute=0, day_of_week=0, name="audit", func=product_description_audit)
# scheduler.add_cron(hour=20, minute=0, day_of_week=6, name="weekly_plan", func=weekly_content_plan)
# scheduler.add_cron(hour=9, minute=0, name="morning_post", func=morning_post)
# scheduler.add_cron(hour=12, minute=0, name="auto_publish", func=auto_publish_to_channel)

# ── Журнал публикаций (общий volume bus_tasks — виден и Степану через bot_bus) ──
# Пишем не только факт «опубликовано в 07:16», но и САМ контент (картинка + текст):
# иначе показать руководителю реальный пост нечем — temp_story.jpg перезатирается
async def ai_fallback(msg: Message):
    ai = AIEngine()
    await simulate_typing(msg, delay=2)

    r = await ai.chat_completion(
        f"{TEAM_CONTEXT}\n\nТы контент-менеджер Microgreen Uzbekistan. Помогай пользователю.",
        msg.text,
    )
    await msg.answer(r)


async def _post_to_channel(image_path, caption) -> bool:
    try:
        channel_id = settings.telegram_channel_id
        if not channel_id or not _bot:
            return False
        if image_path:
            from aiogram.types import FSInputFile

            await _bot.send_photo(
                channel_id,
                FSInputFile(image_path),
                caption=caption[:1024],
                parse_mode="HTML",
            )
        else:
            await _bot.send_message(channel_id, caption[:4000], parse_mode="HTML")
        return True
    except Exception as e:
        logging.error(f"_post_to_channel error: {e}")
        return False


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
        await _bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logging.error(f"daily_content_ideas error: {e}", exc_info=True)


async def product_description_audit():
    """Понедельник 11:00: проверка продуктов без описания."""
    try:

        admin_id = settings.admin_telegram_ids[0]
        # Каталог читаем через единую дверь: свой SQL к товарам разошёлся бы
        # со схемой витрины ровно так, как это уже случалось.
        products = [
            (item["id"], item["name_ru"] or item["name"])
            for item in await catalog_repo.list_active()
            if not (item["description_ru"] or "").strip()
        ]

        if not products:
            await _bot.send_message(
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

        await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logging.error(f"product_description_audit error: {e}", exc_info=True)


async def auto_publish_to_channel():
    """Ежедневно в 12:00: публикация в официальный Telegram-канал."""
    try:
        channel_id = settings.telegram_channel_id
        if not channel_id:
            logging.warning("telegram_channel_id не настроен, пропускаем автопостинг.")
            return

        ai = AIEngine()
        from shared.content_plan import get_daily_pillar

        pillar = get_daily_pillar()

        prompt = (
            f"Напиши пост для нашего официального Telegram-канала.\n"
            f"Тематика: {pillar['name']}. Угол подачи: {pillar['angle']}.\n"
            f"Пиши живо, интересно, добавь релевантные эмодзи. "
            f"В конце добавь наши контакты: @microgreen_uz и хэштеги {pillar['tags']}."
        )

        post_text = await ai.chat_completion(
            role_prompt("Ты SMM-менеджер Microgreen Uzbekistan. Пиши красиво и профессионально."),
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
            await _bot.send_photo(
                channel_id, photo=photo, caption=post_text, parse_mode="HTML"
            )
        else:
            await _bot.send_message(channel_id, post_text, parse_mode="HTML")

        logging.info("auto_publish_to_channel: пост успешно отправлен в канал.")
    except Exception as e:
        logging.error(f"auto_publish_to_channel error: {e}", exc_info=True)


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

        products = [
            item["name"] for item in (await catalog_repo.list_active())[:10]
        ]

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
        # Telegram limit
        if len(report) > 4000:
            await _bot.send_message(
                admin_id,
                report[:4000] + "\n\n<i>...продолжение↓</i>",
                parse_mode="HTML",
            )
            await _bot.send_message(admin_id, report[4000:], parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logging.error(f"weekly_content_plan error: {e}", exc_info=True)


async def morning_post(d: date | None = None):
    """Ежедневно утром: утренний сторис. Каждый день — ДРУГОЙ формат (факт / вопрос /
    выбор / лайфхак / мини-рецепт / цитата / промо): разное фото, разный макет оверлея
    и свой триггер вовлечения — чтобы сторис не выглядел одинаково и лучше заходил в охват."""
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        target_date = d or now.date()
        day_name = target_date.strftime("%A")
        weather = await fetch_weather_samarkand()

        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()

        # Формат дня определяет угол подачи, фото, макет, CTA и триггер вовлечения
        fmt = get_daily_morning_format(target_date)
        from shared.content_plan import get_daily_tip_theme

        fact_theme = get_daily_fact_theme(target_date)  # fallback-семя из списка
        tip_theme = get_daily_tip_theme(target_date)  # fallback-семя из списка
        from shared.content_plan import get_daily_pillar

        pillar = get_daily_pillar(target_date)

        # Тема дня из актуальной повестки (новости/тренды/сезон/погода), с fallback на списки
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
        is_info = fmt.get("kind") == "info"  # info → список пунктов на картинке
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
            + (await get_dynamic_content_policy())
            + "\n\n"
            + build_brief(pillar, "утренний сторис", d=target_date),
            prompt,
            temperature=0.9,
        )

        async def _gen_headline() -> str:
            return await ai.chat_completion(
                role_prompt("Sen kreativ kopirayter. Grammatik to'g'ri, tabiiy o'zbek tilida yoz, so'zlarni buzma."
                + (await get_dynamic_content_policy())),
                f"Shu post uchun qisqa, jozibali SARLAVHA (hook) o'ylab top — FAQAT Uzbek Latin, ko'pi bilan 5 so'z, "
                f"emoji va tinish belgilarisiz. Faqat sarlavhani yoz:\n{post_text[:500]}",
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
                "Faqat VALID JSON qaytar, markdownsiz." + (await get_dynamic_content_policy()),
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
                points = (
                    None  # деградация: без списка (render покажет только заголовок)
                )
        elif fmt["key"] == "this_or_that":
            headline = await _gen_headline()
            raw_opts = await ai.chat_completion(
                role_prompt("Sen kopirayter. Uzbek Latin, grammatik to'g'ri." + (await get_dynamic_content_policy())),
                f"Ikkita QISQA tanlov variantini taklif qil, har biri 1-3 so'z, ular orasiga '|' qo'y, "
                f"emoji va tinish belgilarisiz. FAQAT ikkita variant:\n{post_text[:300]}",
            )
            parts = [
                p.strip() for p in raw_opts.replace("\n", "|").split("|") if p.strip()
            ]
            options = parts[:2] if len(parts) >= 2 else ["1-variant", "2-variant"]
        else:
            # Вовлекающие форматы (вопрос/цитата) — заголовок + одна фраза пользы
            headline = await _gen_headline()
            benefit = await ai.chat_completion(
                role_prompt("Sen kopirayter. Grammatik to'g'ri, tabiiy o'zbek tilida yoz."
                + (await get_dynamic_content_policy())),
                f"Bitta ANIQ foyda/qiziqarli iborani yoz — Uzbek Latin, ko'pi bilan 6 so'z, "
                f"emoji va tinish belgilarisiz. MUHIM: bu sarlavhadan FARQ qilsin. Sarlavha: «{headline[:60]}». "
                f"Faqat iborani yoz:\n{post_text[:400]}",
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

            await _bot.send_photo(
                admin_id,
                photo=FSInputFile(final_img),
                caption=f"☀️ <b>{fmt['ru']}</b>",
                parse_mode="HTML",
            )
            from shared.instagram import post_to_instagram

            success = await post_to_instagram(final_img, "", post_type="story")
            channel_caption = f"<b>{headline}</b>\n\n{post_text}\n\n{fmt['cta']}\nmicrogreenuzbekistan.com"
            await _post_to_channel(final_img, channel_caption)
            if success:
                await _mark_published(
                    "morning", image=final_img, caption=post_text, title=headline
                )
                await _bot.send_message(
                    admin_id,
                    "✅ <i>Опубликовано в Instagram Stories</i>",
                    parse_mode="HTML",
                )
        else:
            channel_caption = f"<b>{headline}</b>\n\n{post_text}\n\n{fmt['cta']}\nmicrogreenuzbekistan.com"
            await _post_to_channel(None, channel_caption)
            await _bot.send_message(
                admin_id,
                "⚠️ Не удалось сгенерировать изображение утреннего сторис.",
                parse_mode="HTML",
            )

    except Exception as e:
        logging.error(f"morning_post error: {e}", exc_info=True)


_last_morning_date = None  # защита от двойного утреннего поста в одну и ту же минуту


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


async def evening_post(d: date | None = None):
    """Ежедневно в 18:00: вечерний пост с уникальным блюдом."""
    try:
        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        target_date = d or now.date()
        target_date.timetuple().tm_yday
        target_date.strftime("%A")
        weather = await fetch_weather_samarkand()

        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()

        import os
        import json

        # Разнообразие: каждый день другая кухня мира + формат блюда + «герой»-зелень
        brief = build_recipe_brief(target_date)
        lang_uz = brief["lang"] == "uz"
        lang_name = (
            "узбекском языке (латиница, O'zbek tili)" if lang_uz else "русском языке"
        )
        # Сезон/повод дня — чистая математика по дате (без AI-вызова), чтобы блюдо попадало
        # в момент (жара, Рамазан, школа…)
        from shared.trends import get_uz_season_occasion

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
            + (await get_dynamic_content_policy()),
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

        # Фото ДОЛЖНО соответствовать рецепту → промпт строим детерминированно из блюда и ингредиентов
        # (без второго вызова AI, чтобы фото не «уплывало» от рецепта). Текст впечатаем сами (в бренде).
        from shared.content_plan import get_daily_image_style

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

        # Подробный рецепт (шаги) — в ПОДПИСИ (caption), не на картинке
        steps_txt = "\n".join(f"{n}. {s}" for n, s in enumerate(steps, 1)) or "—"
        caption = (
            f"🍽 <b>{title}</b>\n\n"
            f"👨‍🍳 <b>Tayyorlash:</b>\n{steps_txt}\n"
            + (f"\n🔑 <i>Sirimiz:</i> {secret}\n" if secret else "")
            # Телефон из настроек: подпись уходит в канал и в Instagram,
            # менять его правкой кода в каждом посте — тот же путь к заглушке.
            + f"\n📞 {settings.company_phone} · Buyurtma berish\n#MicrogreenUzbekistan"
        )

        channel_caption = f"{caption}\n\nmicrogreenuzbekistan.com"

        if image_url and os.path.isfile(image_url):
            from shared.brand import render_recipe_card
            from uuid import uuid4

            story_img = f"recipe_{uuid4().hex[:8]}.jpg"
            # На картинке — только название + ингредиенты + CTA (шаги в подпись)
            ok = render_recipe_card(
                image_url, story_img, title, ingredients, cta="Buyurtma berish"
            )
            final_img = story_img if ok else image_url

            from aiogram.types import FSInputFile

            await _bot.send_photo(
                admin_id,
                photo=FSInputFile(final_img),
                caption=caption[:1024],
                parse_mode="HTML",
            )
            from shared.instagram import post_to_instagram

            success = await post_to_instagram(final_img, "", post_type="story")
            await _post_to_channel(final_img, channel_caption)
            if success:
                await _mark_published(
                    "recipe", image=final_img, caption=caption, title=title
                )
                await _bot.send_message(
                    admin_id,
                    "✅ <i>Рецепт опубликован в Instagram Stories</i>",
                    parse_mode="HTML",
                )
        else:
            await _post_to_channel(None, channel_caption)
            await _bot.send_message(
                admin_id, "⚠️ Не удалось сгенерировать фото рецепта.", parse_mode="HTML"
            )

    except Exception as e:
        logging.error(f"evening_post error: {e}", exc_info=True)


# ── Регистрация задач ────────────────────────────────────────────────────
async def weekly_grid_post(d: date | None = None):
    """Раз в неделю (Сб 12:00): курируемый ФЛАГМАНСКИЙ пост в СЕТКУ (feed) с полной подписью."""
    try:
        import os

        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        target_date = d or now.date()
        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()
        pillar = get_weekly_grid_pillar(target_date)
        brief = build_brief(
            pillar, "еженедельный флагманский пост в ленту", d=target_date
        )

        # Язык поста — строго RU или UZ по рубрике/ситуации (никогда не английский)
        from shared.content_plan import pick_language, LANG_INSTRUCTION

        lang = pick_language(pillar, d=target_date)
        lang_name = LANG_INSTRUCTION[lang]

        post_text = await ai.chat_completion(
            "Ты главный SMM-редактор бренда Microgreen Uzbekistan. Пиши сильный, ценный пост "
            "для ленты Instagram — с пользой/историей и чётким призывом к действию."
            + BRAND_TEXT_STYLE
            + (await get_dynamic_content_policy())
            + "\n\n"
            + brief,
            f"Создай еженедельный флагманский пост в ленту по рубрике «{pillar['name']}». "
            f"⚠️ ЯЗЫК: пиши ПОЛНОСТЬЮ на {lang_name} языке. Категорически НЕ на английском. "
            f"4-7 абзацев, живо, с эмодзи, в конце — призыв к действию и контакты.",
        )
        # Подпись для ленты: срезаем AI-хэштеги (модель их коверкала) и ставим фиксированный
        # брендовый набор детерминированно — только в ленте подпись реально индексируется.
        import re as _re
        from shared.brand import BRAND_HASHTAGS

        body = _re.sub(r"#\S+", "", post_text).rstrip()
        feed_caption = f"{body}\n\n{BRAND_HASHTAGS}"

        # Чистое премиальное фото под тему (текст — в подписи поста, не на картинке)
        from shared.content_plan import get_daily_image_style

        image_prompt = (
            f"Photorealistic premium square 1:1 Instagram feed photo for a microgreens brand. "
            f"Fresh microgreens, salads and beautiful plating, natural soft light, clean aesthetic composition, "
            f"theme: {pillar['name']}. "
            f"Photography style: {get_daily_image_style(target_date)}. "
            f"CRITICAL: absolutely NO text, NO letters, NO words on the image."
        )
        image_url = await ai.generate_image(
            image_prompt, size="1024x1024"
        )  # 1:1 — безопасно для ленты

        if image_url and os.path.isfile(image_url):
            from aiogram.types import FSInputFile

            # В ленту подпись идёт отдельно (feed поддерживает caption) — показываем её как подпись к фото,
            # чтобы можно было проверить текст и язык. Отдельного текстового сообщения после фото нет.
            await _bot.send_photo(
                admin_id,
                photo=FSInputFile(image_url),
                caption=feed_caption[:1024],
                parse_mode="HTML",
            )
            from shared.instagram import post_to_instagram

            ok = await post_to_instagram(image_url, feed_caption, post_type="feed")
            await _post_to_channel(image_url, feed_caption)
            if ok:
                await _mark_published(
                    "grid", image=image_url, caption=post_text, title=pillar["name"]
                )
                await _bot.send_message(
                    admin_id,
                    "✅ <i>Пост недели опубликован в ленту Instagram</i>",
                    parse_mode="HTML",
                )
        else:
            await _post_to_channel(None, feed_caption)
            await _bot.send_message(
                admin_id,
                "⚠️ Не удалось сгенерировать фото поста недели.",
                parse_mode="HTML",
            )
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
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
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
        import os
        import json
        from shared.content_plan import (
            MORNING_FORMATS,
            get_daily_tip_theme,
            get_daily_fact_theme,
        )
        from shared.video_utils import make_reel, ffmpeg_available
        from shared.brand import render_story_text, BRAND, BRAND_HASHTAGS
        from uuid import uuid4

        tz = timezone(timedelta(hours=5))
        now = datetime.now(tz)
        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()

        if not ffmpeg_available():
            await _bot.send_message(
                admin_id,
                "⚠️ Reel не собран: ffmpeg недоступен в окружении.",
                parse_mode="HTML",
            )
            return

        # Динамический выбор формата на основе показателей зашедшего контента (петля обратной связи)
        from shared.content_archive import get_format_performance_weights_async
        import random

        weights = await get_format_performance_weights_async(REEL_INFO_FORMATS)
        key = random.choices(list(weights.keys()), weights=list(weights.values()), k=1)[
            0
        ]
        fmt = next(f for f in MORNING_FORMATS if f["key"] == key)
        # Тема из актуальной повестки — только для нужного плейсхолдера (не оба)
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
            + (await get_dynamic_content_policy()),
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
            await _bot.send_message(
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
            await _bot.send_message(
                admin_id, "⚠️ Reel: сборка видео не удалась (ffmpeg).", parse_mode="HTML"
            )
            return

        pts_txt = "\n".join(f"• {p}" for p in points) if points else ""
        caption = (
            f"{headline}\n\n{pts_txt}\n\n"
            f"📞 {BRAND['phone']} · Buyurtma berish\n\n{BRAND_HASHTAGS}"
        ).strip()

        from aiogram.types import FSInputFile

        await _bot.send_video(
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
            await _bot.send_message(
                admin_id, "✅ <i>Reel опубликован в Instagram</i>", parse_mode="HTML"
            )
    except Exception as e:
        logging.error(f"reel_post error: {e}", exc_info=True)


async def publish_restaurant_of_week():
    """Публикация рубрики 'Ресторан недели' и запуск события MAGAZINE_PUBLISHED."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.event_bus import event_bus

        admin_id = settings.admin_telegram_ids[0]

        # Рестораны берём из базы витрины: там их заводит админка журнала.
        # На проде у этой таблицы есть двойник в CRM-базе с точно такой же
        # схемой, и обычная сессия попадала в него — рубрика уходила в
        # Instagram по старым сид-записям, а партнёров из админки не видела.
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    # LOWER — не украшение: в базе лежит tier='PREMIUM', а сравнение
                    # строк в Postgres регистрозависимое, поэтому 'premium' не
                    # находил ничего и рубрика не выходила ни разу. Та же история,
                    # что с department без .lower() (см. CLAUDE.md).
                    "SELECT name, city, cuisine, dishes, microgreens FROM restaurants "
                    "WHERE LOWER(tier) = 'premium' ORDER BY RANDOM() LIMIT 1"
                )
            )
            row = res.fetchone()

        if not row:
            # Публиковать нечего — но молчать нельзя, иначе рубрика тихо
            # пропадает из ленты и никто не узнает почему.
            logging.warning(
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

        if _bot:
            # Раньше здесь стояло «📰 Опубликовано в канал» — неправдой это было
            # дважды: сама функция в канал не пишет, а подписчик, который пишет,
            # публиковал совсем другой текст (см. ниже).
            await _bot.send_message(
                admin_id,
                f"📰 <b>Рубрика «Ресторан недели» готова:</b>\n\n{post_text}",
                parse_mode="HTML",
            )

        # `text` — готовый текст рубрики. Без него подписчик в marketing_bot
        # собирал пост из ключей issue_id/title/url, которых тут нет, и каждый
        # понедельник в публичный канал уходило «FRESH WEEKLY №?! В этом
        # выпуске: Новый выпуск». Издатель и подписчик обязаны сходиться
        # по ключам — это проверяет scripts/check_event_contracts.py.
        await event_bus.publish(
            "MAGAZINE_PUBLISHED",
            {
                "rubric": "restaurant_of_week",
                "text": post_text,
                "restaurant_name": name,
                "city": city,
                "microgreens_recommended": mg_str,
            },
            "content_bot",
        )

    except Exception as e:
        logging.error(f"publish_restaurant_of_week error: {e}", exc_info=True)


async def check_and_refresh_token_job():
    """Еженедельная задача по проверке и обновлению токена Instagram."""
    try:
        # Имя функции — `auto_refresh_token`. Здесь годами стояло
        # `auto_check_and_refresh_token`, которого в модуле нет: еженедельная
        # задача падала на импорте, ловилась внешним except и слала владельцу
        # «не удалось обновить токен». То есть обновление не отработало НИ
        # РАЗУ, а долгоживущий токен Instagram истекает за 60 дней — публикации
        # умирали, и токен каждый раз чинили руками. Нашла сверка
        # scripts/check_imports.py.
        from shared.token_refresh import auto_refresh_token

        # Воркер пытается обновить токен при возрасте более 50 дней
        await auto_refresh_token()
    except Exception as e:
        logger.error(f"Ошибка при автоматическом обновлении токена Instagram: {e}")
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if admin_id and _bot:
            await _bot.send_message(
                admin_id,
                f"⚠️ <b>Критическая ошибка:</b> Не удалось автоматически обновить Instagram Access Token.\n"
                f"Детали ошибки: <code>{e}</code>\n"
                f"Потребуется ручной перезапуск обмена токенов.",
                parse_mode="HTML",
            )


async def weekly_reach_report():
    """Еженедельный отчёт по ОХВАТУ админу в Telegram: reach% по постам/сторис + вердикт
    о здоровье аудитории. Данные уже собирает shared.instagram_analytics — здесь сводка.
    Главный индикатор: охват <10% базы ≈ подписчики неактивны/накручены (контентом не лечится)."""
    try:
        from shared.instagram_analytics import (
            build_reach_report,
            sync_publication_metrics,
        )

        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not (admin_id and _bot):
            return
        await sync_publication_metrics()
        rep = await build_reach_report()
        if not rep.get("configured"):
            await _bot.send_message(
                admin_id,
                "📊 Reach-отчёт: Instagram Graph API не настроен (нет токена/доступа).",
                parse_mode="HTML",
            )
            return
        await _bot.send_message(admin_id, rep["summary"], parse_mode="HTML")
    except Exception as e:
        logging.error(f"weekly_reach_report error: {e}", exc_info=True)


# daily_site_recipe, daily_content_ideas, product_description_audit, weekly_content_plan —
# отключены: спам в личку админу, не несёт ценности.
scheduler.add_cron(
    name="weekly_grid_post", func=weekly_grid_post, hour=12, minute=0, day_of_week=5
)
scheduler.add_interval(
    seconds=60, name="morning_post_dynamic_check", func=morning_post_dynamic_check
)
scheduler.add_cron(name="evening_post", func=evening_post, hour=18, minute=0)
scheduler.add_cron(
    name="instagram_token_refresh",
    func=check_and_refresh_token_job,
    hour=10,
    minute=0,
    day_of_week=0,
)
# Еженедельный отчёт по охвату (пн 10:00): смотрим reach% и здоровье аудитории.
scheduler.add_cron(
    name="weekly_reach_report",
    func=weekly_reach_report,
    hour=10,
    minute=0,
    day_of_week=0,
)


async def daily_magazine_rubric():
    """Ежедневная нарезка журнала в Telegram-канал."""
    try:
        from shared.event_bus import event_bus

        admin_id = settings.admin_telegram_ids[0]

        post_text = (
            "📰 <b>Рубрика дня из FRESH WEEKLY</b>\n\n"
            "✨ Факт дня: Пибимпаб с микрозеленью — это не только вкусно, но и полезно для пищеварения!\n"
            "Добавьте ростки дайкона для пикантности.\n\n"
            "👉 Читайте полную статью: <a href='https://microgreenuzbekistan.com/magazine'>FRESH WEEKLY #2</a>"
        )

        if _bot:
            await _bot.send_message(admin_id, post_text, parse_mode="HTML")

        await event_bus.publish(
            "MAGAZINE_PUBLISHED",
            {"rubric": "daily_highlight", "issue_id": 2},
            "content_bot",
        )

    except Exception as e:
        logging.error(f"daily_magazine_rubric error: {e}", exc_info=True)


# daily_magazine_rubric отключён: слал в ЛИЧКУ админу захардкоженный факт (всегда выпуск №2),
# не реальная публикация в канал → мусорный повтор. Функция оставлена, но не в расписании.
# scheduler.add_cron(name="daily_magazine_rubric", func=daily_magazine_rubric, hour=16, minute=0)
# Reels отключены по решению — видео плохо генерится ИИ. Функция reel_post оставлена, но не в расписании.
# scheduler.add_cron(name="reel_post_mon", func=reel_post, hour=19, minute=0, day_of_week=0)
# scheduler.add_cron(name="reel_post_wed", func=reel_post, hour=19, minute=0, day_of_week=2)
# scheduler.add_cron(name="reel_post_fri", func=reel_post, hour=19, minute=0, day_of_week=4)
# Рубрики журнала
scheduler.add_cron(
    name="publish_restaurant_of_week",
    func=publish_restaurant_of_week,
    hour=11,
    minute=0,
    day_of_week=0,
)


# ═══════════════════════════════════════════════════════════════════════════
# BOT BUS HANDLERS — задачи от Степана
# ═══════════════════════════════════════════════════════════════════════════


async def bus_sync_publication_metrics(params: dict) -> dict:
    """Подтянуть лайки/охваты из Instagram Graph API по требованию из админки.

    Раньше метрики обновлялись только в еженедельном reach-отчёте
    (понедельник 10:00), и посмотреть свежие цифры в середине недели было
    нельзя.
    """
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
    """Публикует сторис в Instagram: готовый текст либо сгенерированный по теме.

    `text` — уже утверждённый текст. Он публикуется ДОСЛОВНО, без повторной
    генерации: карточка подтверждения показывает владельцу именно его, и
    расхождение между одобренным и опубликованным недопустимо. Раньше
    инструмент присылал `text`, а капабилити читала `topic`, поэтому тема
    всегда сваливалась в литерал «микрозелень», бот сочинял текст заново —
    и в Instagram уходило не то, что одобрил владелец.
    """
    ready_text = str(params.get("text") or "").strip()
    topic = params.get("topic") or ready_text[:80] or "микрозелень"
    admin_id = settings.admin_telegram_ids[0]
    ai = AIEngine()

    if ready_text:
        post_text = ready_text
    else:
        post_text = await ai.chat_completion(
            "Ты SMM-менеджер Microgreen Uzbekistan." + BRAND_TEXT_STYLE + (await get_dynamic_content_policy()),
            f"Напиши короткий, цепляющий текст для Instagram Stories на тему: {topic}. "
            "Максимум 3-4 предложения, добавь эмодзи. На русском языке.",
        )

    # Генерируем короткий заголовок для картинки
    headline = await ai.chat_completion(
        role_prompt("Ты копирайтер."),
        f"Придумай ОДИН короткий, броский заголовок (максимум 2-4 слова) на ТОМ ЖЕ ЯЗЫКЕ, что и тема (узбекский или русский). Пиши ТОЛЬКО сам заголовок без кавычек:\nТема: {topic}",
    )

    # Строгий шаблон DALL-E промпта без вызова AI
    image_prompt = (
        f"A beautiful vertical (9:16) Instagram Stories image. Topic: {topic}. "
        f"Style: modern, vibrant, appetizing, professional food photography. "
        f'The image MUST contain the bold typography text "{headline}" placed elegantly. '
        f'DO NOT TRANSLATE THE TEXT. USE THE EXACT CYRILLIC/LATIN CHARACTERS: "{headline}". '
        f"Absolutely no other text or English words on the image."
    )

    image_url = await ai.generate_image(image_prompt, size="1024x1792")

    if image_url:
        # Отправляем в Telegram
        from aiogram.types import FSInputFile

        photo_file = FSInputFile(image_url) if os.path.isfile(image_url) else image_url
        await _bot.send_photo(
            admin_id,
            photo=photo_file,
            caption=f"📸 <b>Сторис по запросу:</b> {topic}\n\n{post_text}",
            parse_mode="HTML",
        )

        # Публикуем в Instagram
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
    """Генерирует актуальный мем и публикует в Instagram."""
    topic = params.get("topic", "микрозелень")
    admin_id = settings.admin_telegram_ids[0]
    ai = AIEngine()

    context = await fetch_uzbek_trends()

    meme_idea = await ai.chat_completion(
        role_prompt("Ты топовый мемолог Узбекистана. Аудитория: молодёжь 18-35, женщины, ЗОЖники."),
        f"Тема: {topic}\n\nАКТУАЛЬНЫЙ КОНТЕКСТ:\n{context}\n\n"
        f"Создай вирусный мем связанный с темой '{topic}' и актуальными трендами. "
        f"Юмор для узбекской аудитории. На русском. Опиши сцену и пунчлайн.",
    )

    headline = await ai.chat_completion(
        role_prompt("Ты редактор мемов."),
        f"Выдели ОДНУ смешную фразу (до 5 слов) на РУССКОМ. Без кавычек:\n{meme_idea}",
    )

    image_prompt = await ai.chat_completion(
        role_prompt("Ты создатель мемов."),
        f"Промпт на английском для DALL-E 3 (funny meme, vertical for Instagram Stories). "
        f'Вписать текст: "{headline}" (bold white text, black outline, meme font). Ситуация: {meme_idea[:300]}',
    )
    image_url = await ai.generate_image(image_prompt, size="1024x1792")

    if image_url:
        from aiogram.types import FSInputFile

        photo_file = FSInputFile(image_url) if os.path.isfile(image_url) else image_url
        await _bot.send_photo(
            admin_id,
            photo=photo_file,
            caption=f"😂 <b>Мем по запросу:</b> {topic}\n\n{meme_idea}",
            parse_mode="HTML",
        )

        from shared.instagram import post_story_with_text

        success = await post_story_with_text(image_url, headline, meme_idea)
        status = "опубликован в Instagram Stories" if success else "только в Telegram"
        return {"status": "ok", "message": f"Мем '{topic}' — {status}"}

    return {"status": "error", "message": "Не удалось сгенерировать мем"}


async def bus_get_status(params: dict) -> dict:
    """Реальный статус публикаций контента на сегодня (для Степана)."""
    return {"status": "ok", "message": await _content_status_message()}


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

    posts = await get_publications(target) if target else await get_last_publications()
    fell_back = False
    if not posts and target:
        # за нужный день ничего — покажем последнее, что реально выходило
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


# ═══════════════════════════════════════════════════════════════════════════
# EVENTBUS HANDLER
# ═══════════════════════════════════════════════════════════════════════════


async def handle_task_created(payload: dict):
    """Задача отделу контента — через общий исполнитель, как у всех отделов.

    Раньше здесь был собственный обработчик: формат публикации выбирался
    сопоставлением ключевых слов («сторис», «опрос», «фото»), затем шёл один
    вызов модели. Каталога он не видел вовсе, поэтому задача «сделай пост с
    ценами» отвечалась выдуманными цифрами — при том, что инструмент
    build_price_list_post существует именно для этого. Задача при этом не
    закрывалась и TASK_COMPLETED не публиковала.

    Всё, что раньше выбиралось ветками `if`, теперь инструменты отдела:
    get_content_schedule (вопрос о расписании), create_poll, publish_story,
    build_price_list_post, generate_image.
    """
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "content":
        return

    bot = Bot(
        token=settings.content_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.prompts import TEAM_CONTEXT
        from shared.task_executor import execute_bot_task

        role = (
            f"{TEAM_CONTEXT}\n\nТы — Главный Редактор (Chief Editor) и Brand Manager. "
            f"Твоя задача — создавать премиальный контент "
            f"(Tone of Voice: профессиональный, экологичный, ЗОЖ)."
        )
        logging.info("CONTENT_BOT passing task to TaskExecutor...")
        await execute_bot_task(
            bot=bot,
            bot_name="content_bot",
            department="content",
            task_data=data,
            team_context=role,
            policy=await get_dynamic_content_policy(),
        )
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
    return (
        bool(message.from_user) and message.from_user.id in settings.admin_telegram_ids
    )


@test_router.message(Command("testday"))
async def cmd_test_day(message: Message):
    """Прогнать ВЕСЬ дневной контент со случайным смещением (только Telegram)."""
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    import random
    from datetime import date, timedelta

    random_days = random.randint(0, 365)
    test_date = date.today() + timedelta(days=random_days)

    await message.answer(
        f"🧪 <b>Тестовый прогон на день со случайным смещением ({test_date.strftime('%d.%m.%Y')})</b>\n"
        "Всё уйдёт <b>только в Telegram</b>, в Instagram НЕ публикуется.\n"
        "Генерация займёт пару минут…"
    )
    set_dry_run(True)
    try:
        await message.answer("⏳ ① Утренний сторис…")
        await morning_post(d=test_date)
        await message.answer("⏳ ② Вечерний сторис-рецепт…")
        await evening_post(d=test_date)
        await message.answer("⏳ ③ Пост недели в ленту…")
        await weekly_grid_post(d=test_date)
        await message.answer(
            "✅ Готово. Всё отправлено только в Telegram (Instagram не тронут)."
        )
    finally:
        set_dry_run(False)


@test_router.message(Command("teststory"))
async def cmd_test_story(message: Message):
    """Прогнать один утренний сторис со случайным смещением (только Telegram)."""
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    import random
    from datetime import date, timedelta

    random_days = random.randint(0, 365)
    test_date = date.today() + timedelta(days=random_days)

    from shared.content_plan import get_daily_morning_format

    fmt = get_daily_morning_format(test_date)

    await message.answer(
        f"🧪 Тест сторис со случайным смещением ({test_date.strftime('%d.%m.%Y')}, формат: {fmt['ru']})…"
    )
    set_dry_run(True)
    try:
        await morning_post(d=test_date)
        await message.answer("✅ Готово (в Instagram не публиковалось).")
    finally:
        set_dry_run(False)


@test_router.message(Command("testevening"))
async def cmd_test_evening(message: Message):
    """Прогнать один вечерний сторис-рецепт со случайным смещением (только Telegram)."""
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    import random
    from datetime import date, timedelta

    random_days = random.randint(0, 365)
    test_date = date.today() + timedelta(days=random_days)

    from shared.content_plan import build_recipe_brief

    brief = build_recipe_brief(test_date)

    await message.answer(
        f"🧪 Тест вечернего сторис-рецепта со случайным смещением ({test_date.strftime('%d.%m.%Y')})\n"
        f"Кухня: {brief['cuisine']}, Формат: {brief['format']}, Зелень: {brief['hero']}…"
    )
    set_dry_run(True)
    try:
        await evening_post(d=test_date)
        await message.answer("✅ Готово (в Instagram не публиковалось).")
    finally:
        set_dry_run(False)


@test_router.message(Command("testgrid"))
async def cmd_test_grid(message: Message):
    """Прогнать недельный пост в ленту со случайным смещением (только Telegram)."""
    if not _is_admin(message):
        return
    from shared.instagram import set_dry_run
    import random
    from datetime import date, timedelta

    random_days = random.randint(0, 365)
    test_date = date.today() + timedelta(days=random_days)

    from shared.content_plan import get_weekly_grid_pillar

    pillar = get_weekly_grid_pillar(test_date)

    await message.answer(
        f"🧪 Тест поста недели со случайным смещением ({test_date.strftime('%d.%m.%Y')}, рубрика: {pillar['name']})…"
    )
    set_dry_run(True)
    try:
        await weekly_grid_post(d=test_date)
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
        await message.answer(
            "⚠️ ffmpeg недоступен — Reel собрать нельзя (нужен ffmpeg в образе)."
        )
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
        logger.error("FATAL: CONTENT_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    global _bot
    await init_db()
    bot = Bot(
        token=settings.content_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    _bot = bot
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.approvals import approvals_router
    from shared.task_ui import task_ui_router

    dp.include_router(task_ui_router)
    # Кнопки ✅/❌ под рискованными действиями отдела. Без этого роутера
    # карточка подтверждения показывается, а нажатие ничего не делает.
    dp.include_router(approvals_router)

    dp.include_router(
        test_router
    )  # тестовые команды — первыми, чтобы не перехватил catch-all
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        ai_fallback,
        wake_words=["отдел контент", "контент", "content", "посты", "сторис"],
    )
    dp.include_router(group_router)

    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8089)

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    from shared.event_bus import BotBusActions

    asyncio.create_task(
        bus_listen(
            "content_bot",
            {
                "publish_story": bus_publish_story,
                "publish_post": bus_publish_story,  # same handler, posts to Stories
                "generate_meme": bus_generate_meme,
                "get_status": bus_get_status,
                "get_last_post": bus_get_last_post,  # отдать САМ пост (картинка + текст)
                # Кнопка «Синк метрик Instagram» в веб-админке.
                "sync_publication_metrics": bus_sync_publication_metrics,
                "product_description": bus_product_description,  # текст карточки нового товара
                BotBusActions.DRAFT_MAGAZINE: _draft_magazine,
            },
        )
    )

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


async def _draft_magazine(params: dict) -> dict:
    """Генерация текстового и визуального контента выпуска журнала."""
    try:
        from shared.ai_engine import AIEngine

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

        # Получаем JSON от AI
        import json
        import re

        # Здесь НЕ подмешиваем TEAM_CONTEXT намеренно: ответ разбирается как JSON
        # (ниже regex по {...}), а командный контекст с указаниями по тону и
        # формату провоцирует модель добавить прозу вокруг структуры.
        response = await ai.chat_completion(
            system_prompt=(
                "Ты главный редактор журнала о микрозелени Microgreen Uzbekistan. "
                "Отвечай ТОЛЬКО валидным JSON, без markdown и пояснений. "
                "Не выдумывай фактов и цифр: если данных нет — оставляй поле пустым."
            ),
            user_message=prompt,
        )

        # Парсинг JSON из ответа
        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        if json_match:
            issue_data = json.loads(json_match.group(0))
        else:
            issue_data = {
                "title": "Fresh Weekly: Новый выпуск",
                "content": [{"title": "Обзор", "text": response}],
                "highlights": ["Свежие новости фермы"],
            }

        # Генерация обложки
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


if __name__ == "__main__":
    asyncio.run(main())
