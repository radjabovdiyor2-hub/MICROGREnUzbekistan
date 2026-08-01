import logging
import re
import aiohttp
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from shared.trends.core import UZ_TZ

logger = logging.getLogger(__name__)

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
        dm = (
            re.search(r"<pubDate>(.*?)</pubDate>", b, re.S | re.I)
            or re.search(r"<updated>(.*?)</updated>", b, re.S | re.I)
            or re.search(r"<dc:date>(.*?)</dc:date>", b, re.S | re.I)
        )
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
    items: list[tuple[str, datetime | None]] = []
    try:
        async with aiohttp.ClientSession() as session:
            for feed_url in RSS_FEEDS:
                try:
                    async with session.get(feed_url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                        if resp.status != 200:
                            continue
                        items.extend(_parse_rss_items(await resp.text())[:per_feed])
                except Exception:
                    continue
    except Exception as e:
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
    parts = []
    for key, label in (
        ("today", "СЕГОДНЯ"),
        ("yesterday", "ВЧЕРА"),
        ("week", "РАНЕЕ (за неделю)"),
    ):
        rows = digest.get(key) or []
        if rows:
            parts.append(f"{label}:\n" + "\n".join(f"• {t}" for t in rows))
    return "\n\n".join(parts) if parts else "• Новости временно недоступны"

async def fetch_local_news(per_feed: int = 5, total: int = 12) -> str:
    digest = await fetch_news_digest()
    flat = (
        (digest.get("today") or [])
        + (digest.get("yesterday") or [])
        + (digest.get("week") or [])
    )
    if not flat:
        return "• Новости временно недоступны"
    return "\n".join(f"• {h}" for h in flat[:total])
