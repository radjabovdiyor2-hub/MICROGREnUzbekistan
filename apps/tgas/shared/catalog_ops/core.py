import os
import re
import uuid
from typing import Dict

STOREFRONT_API_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")

ALLOWED_CATEGORY = {
    "microgreens",
    "baby-leaf",
    "salads",
    "flowers",
    "seeds",
    "substrate",
    "equipment",
    "sets",
}
ALLOWED_UNIT = {"kg", "g", "piece", "pack", "set"}

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

CATEGORY_TITLES = {
    "microgreens": "🌱 Микрозелень",
    "baby-leaf": "🍃 Бейби-листья",
    "salads": "🥗 Салаты",
    "flowers": "🌸 Цветы",
    "seeds": "🌾 Семена",
    "substrate": "🧱 Субстрат",
    "equipment": "⚙️ Оборудование",
    "sets": "🎁 Наборы",
}

def slugify(name: str) -> str:
    lowered = str(name).strip().lower()
    latin = "".join(_TRANSLIT.get(ch, ch) for ch in lowered)
    slug = re.sub(r"[^a-z0-9]+", "-", latin).strip("-") or "tovar"
    return f"{slug[:40]}-{uuid.uuid4().hex[:4]}"

def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {BOT_SECRET}"} if BOT_SECRET else {}
