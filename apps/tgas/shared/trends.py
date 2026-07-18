"""
trends — «мозг повестки»: собирает актуальный контекст Узбекистана (новости, тренды,
сезон/праздники, погода) и превращает его в тему дня для контента о микрозелени.

Зачем: раньше темы лайфхаков/фактов/рецептов брались из захардкоженных списков
(shared/content_plan.py). Теперь тема рождается из того, что сейчас «на слуху», но —
строго в рамках CONTENT_POLICY (только микрозелень/здоровье/еда, без политики/крипты и т.п.).

Источники (только разрешённые — БЕЗ скрейпинга Telegram/Instagram, это против ToS):
  • RSS-новости Узбекистана (gazeta/kun/daryo/qalampir/podrobno/uza/xabar),
  • Google Trends по региону UZ (pytrends, неофициальный — с graceful fallback),
  • сезон/праздники Узбекистана (из даты),
  • погода Самарканда (Open-Meteo).

get_daily_context() кэшируется на календарный день, поэтому утренний/вечерний/reel-посты
разделяют один сбор данных. При недоступности источников — частичный контекст, а вызывающий
код падает обратно на прежние списки тем.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime

import aiohttp

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Базовые источники (перенесены из content_bot/main.py, расширены)
# ═══════════════════════════════════════════════════════════════════════════

async def fetch_weather_samarkand() -> str:
    """Текущая погода в Самарканде через Open-Meteo (без ключа)."""
    try:
        url = ("https://api.open-meteo.com/v1/forecast"
               "?latitude=39.627&longitude=66.974&current_weather=true")
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as response:
                if response.status == 200:
                    data = await response.json()
                    temp = data["current_weather"]["temperature"]
                    return f"Температура: {temp}°C"
    except Exception as e:  # noqa: BLE001
        logger.error(f"Weather fetch error: {e}")
    return "Неизвестно"


# Разрешённые RSS-источники Узбекистана. Парсер общий (по <title>), ест любой RSS/Atom;
# недоступные фиды молча пропускаются.
RSS_FEEDS = [
    "https://www.gazeta.uz/ru/rss/",
    "https://kun.uz/ru/rss",
    "https://daryo.uz/ru/rss",
    "https://qalampir.uz/ru/rss",
    "https://podrobno.uz/rss/",
    "https://uza.uz/ru/rss",
    "https://xabar.uz/rss",
]


async def fetch_local_news(per_feed: int = 5, total: int = 12) -> str:
    """Дайджест свежих заголовков новостей Узбекистана (RSS). Возвращает список пунктами."""
    headlines: list[str] = []
    try:
        async with aiohttp.ClientSession() as session:
            for feed_url in RSS_FEEDS:
                try:
                    async with session.get(
                        feed_url, timeout=aiohttp.ClientTimeout(total=5)
                    ) as resp:
                        if resp.status != 200:
                            continue
                        text = await resp.text()
                        titles = re.findall(r"<title><!\[CDATA\[(.*?)\]\]></title>", text)
                        if not titles:
                            titles = re.findall(r"<title>(.*?)</title>", text)
                        # пропускаем название канала (первый title), берём per_feed
                        headlines.extend(t.strip() for t in titles[1:1 + per_feed] if t.strip())
                except Exception:
                    continue
    except Exception as e:  # noqa: BLE001
        logger.error(f"News fetch error: {e}")

    if not headlines:
        return "• Новости временно недоступны"
    # дедуп с сохранением порядка
    seen, uniq = set(), []
    for h in headlines:
        if h not in seen:
            seen.add(h)
            uniq.append(h)
    return "\n".join(f"• {h}" for h in uniq[:total])


async def fetch_google_trends(geo: str = "UZ", limit: int = 8) -> list[str]:
    """
    Трендовые запросы по региону (Google Trends через неофициальный pytrends).
    Любая ошибка/отсутствие пакета → [] (никогда не роняет генерацию поста).
    """
    try:
        import asyncio
        from pytrends.request import TrendReq
    except Exception:
        return []

    def _sync() -> list[str]:
        try:
            py = TrendReq(hl="ru-RU", tz=300)
            try:
                df = py.trending_searches(pn="uzbekistan")
                vals = [str(x).strip() for x in df[0].tolist()]
            except Exception:
                # fallback: realtime/related часто недоступны для UZ — тогда пусто
                vals = []
            return [v for v in vals if v][:limit]
        except Exception:
            return []

    try:
        return await asyncio.to_thread(_sync)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"google trends error: {e}")
        return []


# ═══════════════════════════════════════════════════════════════════════════
# Сезон и праздники Узбекистана (из даты, без внешних вызовов)
# ═══════════════════════════════════════════════════════════════════════════

_SEASON = {12: "зима", 1: "зима", 2: "зима", 3: "весна", 4: "весна", 5: "весна",
           6: "лето", 7: "лето", 8: "лето", 9: "осень", 10: "осень", 11: "осень"}

# Приблизительные даты Рамазана/Хайита (лунный календарь) — обновлять по годам.
_RAMADAN = {
    2026: ((2, 18), (3, 20)),
    2027: ((2, 8), (3, 9)),
    2028: ((1, 28), (2, 26)),
}


def get_uz_season_occasion(d: date | None = None) -> dict:
    """Сезон + повод дня для Узбекистана (праздники, сезонные периоды)."""
    d = d or date.today()
    m, day = d.month, d.day
    season = _SEASON.get(m, "")
    occ: list[str] = []

    fixed = {
        (1, 1): "Новый год",
        (3, 8): "8 марта — Международный женский день",
        (9, 1): "1 сентября — День независимости и начало учебного года",
        (10, 1): "1 октября — День учителя и наставника",
        (12, 8): "8 декабря — День Конституции",
    }
    for (mm, dd), name in fixed.items():
        if m == mm and abs(day - dd) <= 2:
            occ.append(name)

    if m == 3 and 15 <= day <= 24:
        occ.append("Навруз — весенний праздник обновления")
    if m in (6, 7, 8):
        occ.append("сезон жары")
    if m in (9, 10):
        occ.append("сезон урожая")
    if m in (5, 6):
        occ.append("сезон экзаменов")
    if (m == 8 and day >= 20) or (m == 9 and day <= 10):
        occ.append("подготовка к школе")

    ram = _RAMADAN.get(d.year)
    if ram:
        (sm, sd), (em, ed) = ram
        try:
            if date(d.year, sm, sd) <= d <= date(d.year, em, ed):
                occ.append("месяц Рамазан (ифтар и сухур)")
        except ValueError:
            pass

    return {"season": season, "occasion": ", ".join(occ)}


# ═══════════════════════════════════════════════════════════════════════════
# Агрегатор повестки + тема дня
# ═══════════════════════════════════════════════════════════════════════════

async def fetch_uzbek_trends() -> str:
    """
    Сводка повестки для мемов/контента: новости + погода + AI-анализ трендов.
    Совместимо с прежним вызовом из bus_generate_meme (возвращает строку).
    """
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
        "для молодёжи и женщин; кулинарные/ЗОЖ тренды. Дай краткую сводку в 5-7 предложений."
    )
    return f"Погода: {weather}\nНовости:\n{news}\nТренды:\n{trends}"


# Кэш повестки на календарный день (один сбор данных на весь content_bot-процесс).
_DAY_CACHE: dict[str, dict] = {}


async def get_daily_context(force: bool = False) -> dict:
    """
    Актуальный контекст дня (кэш на день): погода + дайджест новостей + Google Trends +
    сезон/повод + краткая AI-сводка повестки. При сбое источников — частичный контекст
    (сезон/погода есть всегда), чтобы вызывающий код мог упасть на fallback-темы.
    """
    key = date.today().isoformat()
    if not force and key in _DAY_CACHE:
        return _DAY_CACHE[key]

    weather = await fetch_weather_samarkand()
    news = await fetch_local_news()
    gtr = await fetch_google_trends()
    so = get_uz_season_occasion()

    summary = ""
    try:
        from shared.ai_engine import AIEngine
        ai = AIEngine()
        summary = await ai.chat_completion(
            "Ты аналитик повестки Узбекистана для бренда о микрозелени и здоровом питании.",
            f"Сегодня {datetime.now().strftime('%d.%m.%Y, %A')}. Сезон: {so['season']}. "
            f"Повод: {so['occasion'] or '—'}. Погода в Самарканде: {weather}.\n"
            f"Новости Узбекистана:\n{news}\n"
            f"Google Trends (UZ): {', '.join(gtr) or '—'}\n\n"
            "Дай КРАТКУЮ сводку (3-5 предложений): что сейчас на слуху и волнует людей в "
            "Узбекистане и что можно НАТИВНО связать с микрозеленью/здоровым питанием/свежей "
            "зеленью/домашней кухней. Не касайся политики, крипты, транспорта. На русском."
        )
    except Exception as e:  # noqa: BLE001
        logger.error(f"get_daily_context AI summary error: {e}")

    if _is_ai_fallback(summary):   # AI недоступен (квота/сбой) — сводки нет, не тащим извинение
        summary = ""

    ctx = {
        "date": key,
        "weather": weather,
        "news_digest": news,
        "google_trends": gtr,
        "season": so["season"],
        "occasion": so["occasion"],
        "summary": (summary or "").strip(),
    }
    _DAY_CACHE[key] = ctx
    return ctx


def _is_ai_fallback(text: str) -> bool:
    """
    AIEngine при ошибке (напр. 429/исчерпана квота OpenAI) возвращает ФИКСИРОВАННУЮ
    заглушку-извинение, а не пустоту. Считаем такой ответ провалом генерации.
    """
    if not text or not text.strip():
        return True
    low = text.lower()
    return (
        "не могу ответить" in low
        or "javob bera olmayman" in low
        or ("менеджер" in low and "+998" in text)
    )


def _has_agenda(ctx: dict) -> bool:
    """Есть ли в контексте пригодная повестка (иначе — fallback на списки тем)."""
    if not ctx:
        return False
    news = ctx.get("news_digest") or ""
    if "недоступны" in news:
        news = ""
    return bool(ctx.get("summary") or ctx.get("occasion") or news or ctx.get("google_trends"))


async def build_topical_angle(kind: str, ctx: dict, fallback: str = "") -> str:
    """
    Из контекста повестки делает ОДНУ короткую безопасную тему-инструкцию (angle) для
    генератора: kind ∈ {tip, fact, recipe}. Тема нативно связывает повестку/сезон/погоду
    с микрозеленью, СТРОГО в рамках CONTENT_POLICY. При пустой повестке → fallback.
    """
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
        angle = await ai.chat_completion(
            "Ты контент-стратег Microgreen Uzbekistan." + CONTENT_POLICY,
            f"Актуальная повестка Узбекистана сегодня:\n"
            f"Сезон: {ctx.get('season')}. Повод: {ctx.get('occasion') or '—'}. "
            f"Погода: {ctx.get('weather')}.\n"
            f"Сводка: {ctx.get('summary') or '—'}\n"
            f"Тренды: {', '.join(ctx.get('google_trends') or []) or '—'}\n\n"
            f"Сформулируй ОДНУ короткую тему — {kind_hint}, — которая НАТИВНО связывает "
            f"актуальную повестку/сезон/погоду с микрозеленью. СТРОГО: только "
            f"микрозелень/здоровье/еда; игнорируй политику/крипту/транспорт; не выдумывай "
            f"фактов. Ответь ОДНОЙ фразой-темой на русском (это инструкция для генератора "
            f"поста, а не сам пост), 1 предложение без кавычек."
        )
        angle = (angle or "").strip().strip('"').strip()
        if _is_ai_fallback(angle):   # AI недоступен — берём прежнюю тему из списка
            return fallback
        return angle or fallback
    except Exception as e:  # noqa: BLE001
        logger.error(f"build_topical_angle error: {e}")
        return fallback
