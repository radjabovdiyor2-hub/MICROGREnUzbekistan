import logging
import aiohttp

logger = logging.getLogger(__name__)

async def fetch_weather_samarkand() -> str:
    try:
        url = (
            "https://api.open-meteo.com/v1/forecast"
            "?latitude=39.627&longitude=66.974&current_weather=true"
        )
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as response:
                if response.status == 200:
                    data = await response.json()
                    temp = data["current_weather"]["temperature"]
                    return f"Температура: {temp}°C"
    except Exception as e:
        logger.error(f"Weather fetch error: {e}")
    return "Неизвестно"

async def fetch_google_trends(geo: str = "UZ", limit: int = 8) -> list[str]:
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
                vals = []
            return [v for v in vals if v][:limit]
        except Exception:
            return []

    try:
        return await asyncio.to_thread(_sync)
    except Exception as e:
        logger.warning(f"google trends error: {e}")
        return []
