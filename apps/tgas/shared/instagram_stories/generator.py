import logging
import random
from typing import Optional
from shared.ai_engine import AIEngine
from shared.instagram_stories.core import PROMO_THEMES, PRODUCT_CATALOG, STORY_TEXT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

async def _generate_promo_text(ai: AIEngine) -> str:
    theme = random.choice(PROMO_THEMES)
    user_prompt = (
        f"Напиши промо-текст для Instagram Story на тему: '{theme}'.\n\n"
        f"Каталог продукции:\n{PRODUCT_CATALOG}\n\n"
        f"Помни: текст должен быть очень коротким (2-4 строки) и цепляющим."
    )

    text = await ai.chat_completion(
        system_prompt=STORY_TEXT_SYSTEM_PROMPT,
        user_message=user_prompt,
        temperature=0.9,
        max_tokens=200,
    )

    logger.info("Промо-текст сгенерирован (тема: %s): %s", theme, text[:80])
    return text

async def _generate_promo_image(ai: AIEngine) -> Optional[str]:
    themes_visual = [
        "beautiful microgreens arrangement on a wooden cutting board, "
        "professional food photography, vibrant green colors, "
        "soft natural light, restaurant quality presentation",
        "fresh organic microgreens growing in a modern hydroponic tray, "
        "bright studio lighting, clean white background, "
        "vivid green sprouts, commercial food photography",
        "colorful edible flowers and microgreens salad bowl, "
        "top-down view, restaurant plating, fresh and appetizing, "
        "professional food styling, soft bokeh background",
        "home growing kit for microgreens on a kitchen counter, "
        "cozy lifestyle photography, morning sunlight, "
        "modern kitchen, healthy living concept",
        "assortment of microgreens: arugula, basil, sunflower, pea shoots, "
        "neatly arranged in eco containers, farmers market aesthetic, "
        "natural daylight, sharp focus on greens",
    ]

    prompt = random.choice(themes_visual)
    result = await ai.generate_image(prompt, size="1024x1792")

    if result:
        logger.info("Промо-изображение сгенерировано: %s", str(result)[:80])
    else:
        logger.error("Не удалось сгенерировать промо-изображение")

    return result
