"""
🏷️ Shared Constants — Single Source of Truth

Centralized category labels, emojis, and other shared constants
used across all bot handlers.
"""

# Категории витрины. Ключ — РЕАЛЬНЫЙ slug из `/api/categories`, а не
# выдуманное UPPER_SNAKE-имя.
#
# Здесь стояло `MICROGREENS`/`BABY_LEAF`/`SALADS`, и эти ключи уходили в
# `?category=` как есть. Витрина фильтрует по slug (`microgreens`, `baby-leaf`,
# `salads`), поэтому на любой запрос приходил пустой список: каждая кнопка
# категории в боте отвечала «Нет товаров». Регистр тут исправить мало —
# `BABY_LEAF` не совпадает с `baby-leaf` и после `.lower()`.
CATEGORY_LABELS = {
    "microgreens": "🌱 Микрозелень",
    "baby-leaf": "🥬 Бейби-лист",
    "salads": "🥗 Салаты",
    "balans": "🥙 BALANS",
    "flowers": "🌸 Цветы",
    "seeds": "🌾 Семена",
    "equipment": "⚙️ Оборудование",
    "sets": "📦 Наборы",
}

# Category tuples (emoji, name) for shop grid view
CATEGORY_TUPLES = {
    key: (label.split(" ", 1)[0], label.split(" ", 1)[1])
    for key, label in CATEGORY_LABELS.items()
}

# Ключи уже в нижнем регистре — псевдоним оставлен, чтобы не править
# вызывающих, которые ищут категорию по слагу из callback_data.
CATEGORY_LABELS_LOWER = dict(CATEGORY_LABELS)


# Format price with thousands separator
def format_price(amount: int) -> str:
    """Format number as price: 35000 -> '35 000', 0 -> 'Бесплатно'"""
    if amount == 0:
        return "Бесплатно"
    return f"{amount:,}".replace(",", " ")
