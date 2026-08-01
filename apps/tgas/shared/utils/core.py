from datetime import datetime
from zoneinfo import ZoneInfo

UZ_TIMEZONE = ZoneInfo("Asia/Samarkand")

def get_greeting(language: str = "ru") -> str:
    now = datetime.now(UZ_TIMEZONE)
    hour = now.hour

    greetings = {
        "ru": {
            "night": "🌙 Доброй ночи",
            "morning": "☀️ Доброе утро",
            "afternoon": "🌤 Добрый день",
            "evening": "🌆 Добрый вечер",
        },
        "uz": {
            "night": "🌙 Xayrli tun",
            "morning": "☀️ Xayrli tong",
            "afternoon": "🌤 Xayrli kun",
            "evening": "🌆 Xayrli kech",
        },
    }

    lang_greetings = greetings.get(language, greetings["ru"])

    if 0 <= hour < 6:
        return lang_greetings["night"]
    elif 6 <= hour < 12:
        return lang_greetings["morning"]
    elif 12 <= hour < 18:
        return lang_greetings["afternoon"]
    else:
        return lang_greetings["evening"]
