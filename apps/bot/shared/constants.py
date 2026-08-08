"""
🏷️ Shared Constants — Single Source of Truth

Centralized category labels, emojis, and other shared constants
used across all bot handlers.
"""

# Category labels with emoji — synced with web catalog categories
CATEGORY_LABELS = {
    "MICROGREENS": "🌱 Микрозелень",
    "BABY_LEAF": "🥬 Бейби-лист",
    "SALADS": "🥗 Салаты",
    "FLOWERS": "🌸 Цветы",
    "SEEDS": "🌾 Семена",
    "EQUIPMENT": "⚙️ Оборудование",
    "SETS": "📦 Наборы",
}

# Category tuples (emoji, name) for shop grid view
CATEGORY_TUPLES = {
    key: (label.split(" ", 1)[0], label.split(" ", 1)[1])
    for key, label in CATEGORY_LABELS.items()
}

# Lowercase aliases (used in unified.py callback data)
CATEGORY_LABELS_LOWER = {
    k.lower(): v for k, v in CATEGORY_LABELS.items()
}

# Format price with thousands separator
def format_price(amount: int) -> str:
    """Format number as price: 35000 -> '35 000', 0 -> 'Бесплатно'"""
    if amount == 0:
        return "Бесплатно"
    return f"{amount:,}".replace(",", " ")
