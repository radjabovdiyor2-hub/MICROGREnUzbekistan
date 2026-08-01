from datetime import datetime, timedelta, timezone

UZ_TZ = timezone(timedelta(hours=5))
_DAY_CACHE: dict[str, dict] = {}

def _slot() -> str:
    return "am" if datetime.now(UZ_TZ).hour < 14 else "pm"

def _is_ai_fallback(text: str) -> bool:
    if not text or not text.strip():
        return True
    low = text.lower()
    return (
        "не могу ответить" in low
        or "javob bera olmayman" in low
        or ("менеджер" in low and "+998" in text)
    )

def _has_agenda(ctx: dict) -> bool:
    if not ctx:
        return False
    news = ctx.get("news_digest") or ""
    if "недоступны" in news:
        news = ""
    return bool(
        ctx.get("summary") or ctx.get("occasion") or news or ctx.get("google_trends")
    )
