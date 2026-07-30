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
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import aiohttp

logger = logging.getLogger(__name__)

UZ_TZ = timezone(timedelta(hours=5))  # Узбекистан (UTC+5) — для датирования новостей и слота


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


def _parse_rss_items(xml: str) -> list[tuple[str, datetime | None]]:
    """Из RSS/Atom вытаскивает (заголовок, дата) по блокам <item>/<entry>."""
    out: list[tuple[str, datetime | None]] = []
    blocks = re.findall(r"<item[ >].*?</item>", xml, re.S | re.I)
    if not blocks:
        blocks = re.findall(r"<entry[ >].*?</entry>", xml, re.S | re.I)
    for b in blocks:
        tm = re.search(r"<title>\s*(?:<!\[CDATA\[(.*?)\]\]>|(.*?))\s*</title>", b, re.S | re.I)
        if not tm:
            continue
        title = (tm.group(1) or tm.group(2) or "").strip()
        if not title:
            continue
        dm = (re.search(r"<pubDate>(.*?)</pubDate>", b, re.S | re.I)
              or re.search(r"<updated>(.*?)</updated>", b, re.S | re.I)
              or re.search(r"<dc:date>(.*?)</dc:date>", b, re.S | re.I))
        dt = None
        if dm:
            raw = dm.group(1).strip()
            try:
                dt = parsedate_to_datetime(raw)
            except Exception:
                try:
                    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                except Exception:
                    dt = None
        out.append((title, dt))
    return out


async def fetch_news_digest(per_feed: int = 12) -> dict:
    """
    Датированный дайджест новостей Узбекистана из RSS, разложенный по корзинам
    today / yesterday / week (по локальной дате UZB). Заголовки без даты — в 'week'
    (как «ранее»). Недоступные фиды тихо пропускаются.
    """
    items: list[tuple[str, datetime | None]] = []
    try:
        async with aiohttp.ClientSession() as session:
            for feed_url in RSS_FEEDS:
                try:
                    async with session.get(
                        feed_url, timeout=aiohttp.ClientTimeout(total=5)
                    ) as resp:
                        if resp.status != 200:
                            continue
                        items.extend(_parse_rss_items(await resp.text())[:per_feed])
                except Exception:
                    continue
    except Exception as e:  # noqa: BLE001
        logger.error(f"News fetch error: {e}")

    today = datetime.now(UZ_TZ).date()
    yday = today - timedelta(days=1)
    buckets: dict[str, list[str]] = {"today": [], "yesterday": [], "week": []}
    seen: set[str] = set()
    for title, dt in items:
        if title in seen:
            continue
        seen.add(title)
        d = None
        if dt is not None:
            try:
                d = dt.astimezone(UZ_TZ).date()
            except Exception:
                d = dt.date()
        if d == today:
            buckets["today"].append(title)
        elif d == yday:
            buckets["yesterday"].append(title)
        else:
            buckets["week"].append(title)
    return {k: v[:10] for k, v in buckets.items()}


def format_news_windows(digest: dict) -> str:
    """Человекочитаемый блок окон новостей (сегодня/вчера/ранее) для промпта ИИ."""
    parts = []
    for key, label in (("today", "СЕГОДНЯ"), ("yesterday", "ВЧЕРА"), ("week", "РАНЕЕ (за неделю)")):
        rows = digest.get(key) or []
        if rows:
            parts.append(f"{label}:\n" + "\n".join(f"• {t}" for t in rows))
    return "\n\n".join(parts) if parts else "• Новости временно недоступны"


async def fetch_local_news(per_feed: int = 5, total: int = 12) -> str:
    """Плоский дайджест заголовков (обратная совместимость). Поверх fetch_news_digest."""
    digest = await fetch_news_digest()
    flat = (digest.get("today") or []) + (digest.get("yesterday") or []) + (digest.get("week") or [])
    if not flat:
        return "• Новости временно недоступны"
    return "\n".join(f"• {h}" for h in flat[:total])


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
        "для молодёжи и женщин; кулинарные/ЗОЖ тренды. Дай краткую сводку в 5-7 предложений.",
        effort="medium",
    )
    return f"Погода: {weather}\nНовости:\n{news}\nТренды:\n{trends}"


# Кэш повестки на календарный день (один сбор данных на весь content_bot-процесс).
_DAY_CACHE: dict[str, dict] = {}


def _slot() -> str:
    """Слот суток по UZB: 'am' до 14:00, дальше 'pm'. Утро и вечер кэшируются раздельно —
    вечером новостей накапливается больше, чем утром."""
    return "am" if datetime.now(UZ_TZ).hour < 14 else "pm"


async def get_daily_context(force: bool = False) -> dict:
    """
    Актуальный контекст (кэш на день+слот): погода + ДАТИРОВАННЫЕ окна новостей
    (сегодня/вчера/за неделю) + Google Trends + сезон/повод. БЕЗ отдельного AI-вызова —
    «сравнить и выбрать тему» делает build_topical_angle по этим сырым данным (экономия квоты).
    Утро и вечер фетчатся раздельно (ключ содержит слот).
    """
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
        "news": digest,                 # сырые корзины today/yesterday/week
        "news_windows": windows,        # человекочитаемый блок для промпта
        "news_digest": windows,         # совместимость (раньше — плоская строка)
        "google_trends": gtr,
        "season": so["season"],
        "occasion": so["occasion"],
        "summary": "",                  # отдельной AI-сводки больше нет
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
        slot = ctx.get("slot") or ""
        slot_hint = ("утро — бодрый тон" if slot == "am"
                     else "вечер — уют/ужин" if slot == "pm" else "")
        windows = ctx.get("news_windows") or ctx.get("news_digest") or "—"
        angle = await ai.chat_completion(
            "Ты контент-стратег Microgreen Uzbekistan." + CONTENT_POLICY,
            f"Актуальная повестка Узбекистана" + (f" ({slot_hint})" if slot_hint else "") + ":\n"
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
            f"русском (это инструкция для генератора поста, а не сам пост), 1 предложение без кавычек."
        )
        angle = (angle or "").strip().strip('"').strip()
        if _is_ai_fallback(angle):   # AI недоступен — берём прежнюю тему из списка
            return fallback
        return angle or fallback
    except Exception as e:  # noqa: BLE001
        logger.error(f"build_topical_angle error: {e}")
        return fallback
