import logging
from datetime import datetime
from shared.trends.core import UZ_TZ, _slot, _DAY_CACHE, _has_agenda, _is_ai_fallback
from shared.trends.fetchers import fetch_weather_samarkand, fetch_google_trends
from shared.trends.news import fetch_local_news, fetch_news_digest, format_news_windows
from shared.trends.seasons import get_uz_season_occasion

logger = logging.getLogger(__name__)

async def fetch_uzbek_trends() -> str:
    from shared.ai_engine import AIEngine
    ai = AIEngine()
    news = await fetch_local_news()
    weather = await fetch_weather_samarkand()
    gtr = await fetch_google_trends()
    trends = await ai.chat_completion(
        "Ты аналитик трендов Узбекистана. Ты знаешь всё о жизни молодёжи, женщин, "
        "поваров, фермеров и предпринимателей в Узбекистане.",
        f"Сегодня {datetime.now().strftime('%d.%m.%Y, %A')}. Погода в Самарканде: {weather}.\n\n"
        f"Актуальные новости:\n{news}\n\n"
        f"Google Trends (UZ): {', '.join(gtr) or '—'}\n\n"
        "На основе этого определи: какая тема сейчас горячая; что обсуждают в соцсетях; "
        "сезонные моменты (жара, урожай, отпуска, Рамазан, школа, экзамены); что актуально "
        "для молодёжи и женщин; кулинарные/ЗОЖ тренды. Дай краткую сводку в 5-7 предложений.",
        effort="medium",
    )
    return f"Погода: {weather}\nНовости:\n{news}\nТренды:\n{trends}"

async def get_daily_context(force: bool = False) -> dict:
    slot = _slot()
    key = f"{datetime.now(UZ_TZ).date().isoformat()}:{slot}"
    if not force and key in _DAY_CACHE:
        return _DAY_CACHE[key]

    weather = await fetch_weather_samarkand()
    digest = await fetch_news_digest()
    windows = format_news_windows(digest)
    gtr = await fetch_google_trends()
    so = get_uz_season_occasion()

    ctx = {
        "date": datetime.now(UZ_TZ).date().isoformat(),
        "slot": slot,
        "weather": weather,
        "news": digest,
        "news_windows": windows,
        "news_digest": windows,
        "google_trends": gtr,
        "season": so["season"],
        "occasion": so["occasion"],
        "summary": "",
    }
    _DAY_CACHE[key] = ctx
    return ctx

async def build_topical_angle(kind: str, ctx: dict, fallback: str = "") -> str:
    if not _has_agenda(ctx):
        return fallback

    kind_hint = {
        "tip": "практичный ЛАЙФХАК о микрозелени/зелени (хранение, свежесть, применение)",
        "fact": "интересный ФАКТ о пользе микрозелени/зелени/здорового питания",
        "recipe": "идея БЛЮДА с микрозеленью под сезон/повод/погоду",
    }.get(kind, "тему о микрозелени")

    try:
        from shared.ai_engine import AIEngine
        from shared.brand import CONTENT_POLICY

        ai = AIEngine()
        slot = ctx.get("slot") or ""
        slot_hint = (
            "утро — бодрый тон" if slot == "am" else "вечер — уют/ужин" if slot == "pm" else ""
        )
        windows = ctx.get("news_windows") or ctx.get("news_digest") or "—"
        angle = await ai.chat_completion(
            "Ты контент-стратег Microgreen Uzbekistan." + CONTENT_POLICY,
            "Актуальная повестка Узбекистана"
            + (f" ({slot_hint})" if slot_hint else "")
            + ":\n"
            f"Сезон: {ctx.get('season')}. Повод: {ctx.get('occasion') or '—'}. "
            f"Погода: {ctx.get('weather')}.\n"
            f"Новости по периодам:\n{windows}\n"
            f"Сводка: {ctx.get('summary') or '—'}\n"
            f"Тренды: {', '.join(ctx.get('google_trends') or []) or '—'}\n\n"
            f"СРАВНИ темы-кандидаты из РАЗНЫХ периодов (сегодня/вчера/за неделю) и сезон, "
            f"выбери самую ИНТЕРЕСНУЮ и подходящую бренду (свежесть НЕ приоритет). На её основе "
            f"сформулируй ОДНУ короткую тему — {kind_hint}, — которая НАТИВНО связывает выбранное "
            f"с микрозеленью. СТРОГО: только микрозелень/здоровье/еда; игнорируй "
            f"политику/крипту/транспорт; не выдумывай фактов. Ответь ОДНОЙ фразой-темой на "
            f"русском (это инструкция для генератора поста, а не сам пост), 1 предложение без кавычек.",
        )
        angle = (angle or "").strip().strip('"').strip()
        if _is_ai_fallback(angle):
            return fallback
        return angle or fallback
    except Exception as e:
        logger.error(f"build_topical_angle error: {e}")
        return fallback
