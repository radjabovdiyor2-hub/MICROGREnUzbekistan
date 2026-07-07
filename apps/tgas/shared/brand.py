"""
🎨 Brand — единый фирменный стиль Microgreen Uzbekistan.
=========================================================
Источник: сайт microgreenuzbekistan.com (Design System v1.0
«Надёжность + Доступность», IKEA-clean × Apple-premium × локальная теплота).

Используется во ВСЕХ генерациях:
- картинки: brand_image_prompt() добавляет фирменную палитру/стиль к промпту,
  overlay_logo() ставит логотип на готовое изображение;
- тексты: BRAND_TEXT_STYLE добавляется к системным промптам.

Логотип и ассеты лежат в shared/brand_assets/ (скопированы из проекта сайта,
чтобы быть доступными внутри Docker-контейнеров).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

BRAND_DIR = Path(__file__).resolve().parent / "brand_assets"
LOGO_PATH = BRAND_DIR / "logo.png"

# ── Фирменные константы (из globals.css сайта) ───────────────────────────
BRAND = {
    "name": "Microgreen Uzbekistan",
    "website": "microgreenuzbekistan.com",
    "primary": "#10B981",       # изумрудно-зелёный
    "accent": "#FFB800",        # тёплый золотой акцент
    "primary_light": "#D1FAE5",
    "fonts": "Inter, Outfit",
    "tagline": "Надёжность + Доступность",
    "hashtag": "#MicrogreenUzbekistan",
    "phone": "+998 94 999 95 99",
    "instagram": "@microgreenuzbekistan",
    "city": "Самарканд",
}

# ── Стиль для генерации ИЗОБРАЖЕНИЙ (добавляется к каждому DALL-E/gpt-image промпту) ──
BRAND_IMAGE_STYLE = (
    " || BRAND STYLE — Microgreen Uzbekistan: clean, premium, natural daylight food & plant "
    "photography; fresh vibrant microgreens, salads and edible greens; color palette dominated by "
    "emerald green (#10B981) with warm golden-yellow accents (#FFB800) and clean white / soft neutral "
    "backgrounds; modern, minimal, appetizing, high-key soft lighting, shallow depth of field; "
    "healthy, fresh, trustworthy mood; NO text overlays unless explicitly requested; keep a clean empty "
    "area in the bottom-right corner for the brand logo; aesthetic: IKEA-clean × Apple-premium × local "
    "Uzbek warmth."
)

# ── Стиль для генерации ТЕКСТОВ (добавляется к системным промптам) ──
BRAND_TEXT_STYLE = (
    "\n\n=== ФИРМЕННЫЙ СТИЛЬ Microgreen Uzbekistan ===\n"
    "Пиши в едином голосе бренда:\n"
    "• Тон: тёплый и дружелюбный, но профессиональный — «надёжность + доступность».\n"
    "• Язык клиента: русский или узбекский (двуязычные подписи допустимы).\n"
    "• Эмодзи — умеренно и по делу (🌱💚✨), без спама.\n"
    "• Упоминай бренд Microgreen Uzbekistan и сайт microgreenuzbekistan.com там, где уместно.\n"
    "• Пост завершай хэштегом #MicrogreenUzbekistan (плюс тематические).\n"
    "• Контакты при призыве к действию: тел. +998 94 999 95 99, Instagram @microgreenuzbekistan, Самарканд.\n"
    "• Ценности: свежесть, польза для здоровья, локальное производство, качество для HoReCa.\n"
)

# ── КОНТЕНТ-ПОЛИТИКА SMM ─────────────────────────────────────────────────────
# Добавляется к системным промптам ГЕНЕРАЦИИ КОНТЕНТА (сторис/посты/рецепты).
# Намеренно ПЕРЕВЕШИВАЕТ общие указания BRAND_TEXT_STYLE (в т.ч. про двуязычие).
CONTENT_POLICY = (
    "\n\n=== КОНТЕНТ-ПОЛИТИКА Microgreen Uzbekistan (СТРОГО — важнее любых указаний выше) ===\n"
    "ТЕМЫ (только это): микрозелень, салаты, здоровое питание, city-farm, гидропоника, "
    "свежая зелень в Самарканде.\n"
    "ЗАПРЕЩЕНО: электромобили, транспорт, крипта, политика, ИИ и любые темы вне микрозелени; "
    "смешивать языки; использовать турецкие слова; много текста на картинке; выдумывать несуществующие факты.\n"
    "ЯЗЫК: ТОЛЬКО Uzbek Latin (o'zbek tili, lotin alifbosi). Не смешивай языки, никаких турецких слов. "
    "Если не уверен в факте или цифре — НЕ выдумывай.\n"
    "СТИЛЬ: чистый премиальный минимализм, зелёно-белая палитра, качественное фото зелени/салата/блюда, "
    "логотип Microgreen Uzbekistan, крупный легко читаемый текст, МИНИМУМ текста на изображении.\n"
    "CTA (призыв к действию): «Buyurtma berish» или «Batafsil».\n"
    "ФОРМАТ СТОРИС: заголовок ≤5 слов + 1 короткая фраза пользы + 1 CTA.\n"
    "ФОРМАТ РЕЦЕПТА: на КАРТИНКЕ только название блюда + 3–5 ингредиентов + короткий CTA; "
    "подробные шаги приготовления — в подписи (caption), НЕ на картинке.\n"
)


def brand_image_prompt(prompt: str) -> str:
    """Добавить фирменный стиль к промпту генерации изображения."""
    if not prompt:
        return BRAND_IMAGE_STYLE
    return f"{prompt}{BRAND_IMAGE_STYLE}"


def _load_font(size: int):
    """Возвращает TTF-шрифт с поддержкой кириллицы (DejaVu в контейнере, Arial на Windows)."""
    from PIL import ImageFont
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Docker (fonts-dejavu-core)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/arialbd.ttf",                          # Windows (тест на хосте)
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:  # noqa: BLE001
            continue
    return ImageFont.load_default()


def _wrap(draw, text: str, font, max_w: int) -> list[str]:
    """Простой перенос текста по словам под ширину max_w."""
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _clean_text(s: str) -> str:
    """Убирает эмодзи и служебные символы, которые шрифт не рисует (иначе «тофу»-квадраты)."""
    if not s:
        return ""
    import re
    s = re.sub(
        "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF"
        "\U0001F1E6-\U0001F1FF️‍❤⁉‼ьъыэЬЪЫЭ]",  # + кириллические артефакты транслитерации
        "", s,
    )
    return s.strip().strip('"').strip()


def render_story_text(
    image_path: str,
    out_path: str,
    headline: str = "",
    hashtags: str = "",
    mention: str = "",
    cta: str = "ПОДРОБНЕЕ →",
    subtitle: str = "",
) -> bool:
    """
    Впечатывает в изображение сторис фирменный текст: заголовок, хэштеги, @упоминание
    и CTA-кнопку (имитация «комплектации», т.к. API сторис не поддерживает подписи/стикеры).
    Пишет результат в out_path. Возвращает True при успехе.
    """
    try:
        from PIL import Image, ImageDraw
    except Exception:  # noqa: BLE001
        return False
    try:
        base = Image.open(image_path).convert("RGBA")
        W, H = base.size

        green = (16, 185, 129, 255)       # #10B981
        green_dark = (5, 102, 74, 255)    # тёмно-зелёный для заголовка
        ink = (28, 40, 36, 255)           # тёплый почти-чёрный для текста
        white = (255, 255, 255, 255)

        # Белая «морозная» панель снизу с мягким градиентом (green-white premium)
        panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        pd = ImageDraw.Draw(panel)
        top = int(H * 0.60)
        for yy in range(top, H):
            t = (yy - top) / max(1, (H - top))
            a = min(int(150 + 95 * t), 246)   # 150 → 246: плавный вход в чистый белый
            pd.line([(0, yy), (W, yy)], fill=(255, 255, 255, a))
        base = Image.alpha_composite(base, panel)
        draw = ImageDraw.Draw(base)

        margin = int(W * 0.07)
        y = int(H * 0.645)

        # Заголовок (тёмно-зелёный, крупный)
        if headline:
            f_head = _load_font(int(W * 0.078))
            for line in _wrap(draw, _clean_text(headline), f_head, W - 2 * margin):
                draw.text((margin, y), line, font=f_head, fill=green_dark)
                y += int(f_head.size * 1.1)
            y += int(H * 0.014)

        # Фраза пользы (тёмная, средняя)
        if subtitle:
            f_sub = _load_font(int(W * 0.043))
            for line in _wrap(draw, _clean_text(subtitle), f_sub, W - 2 * margin):
                draw.text((margin, y), line, font=f_sub, fill=ink)
                y += int(f_sub.size * 1.24)
            y += int(H * 0.016)

        # CTA-кнопка (зелёная плашка, белый текст)
        if cta:
            f_cta = _load_font(int(W * 0.042))
            pad = int(W * 0.035)
            cta_t = _clean_text(cta)
            tw = draw.textlength(cta_t, font=f_cta)
            by = min(y, H - int(f_cta.size) - pad * 2 - int(H * 0.055))
            draw.rounded_rectangle(
                [margin, by, margin + tw + pad * 2, by + f_cta.size + pad],
                radius=int(f_cta.size * 0.6), fill=green,
            )
            draw.text((margin + pad, by + pad * 0.35), cta_t, font=f_cta, fill=white)
            y = by + f_cta.size + pad + int(H * 0.012)

        # @упоминание (зелёным, мелким)
        if mention:
            f_m = _load_font(int(W * 0.028))
            draw.text((margin, min(y, H - int(f_m.size * 1.8))), _clean_text(mention), font=f_m, fill=green)

        base.convert("RGB").save(out_path, "JPEG", quality=92)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("render_story_text: %s", e)
        return False


def render_recipe_card(
    image_path: str,
    out_path: str,
    title: str,
    ingredients: list[str],
    cta: str = "Buyurtma berish",
    mention: str = "@microgreenuzbekistan",
) -> bool:
    """
    Минималистичная КАРТОЧКА РЕЦЕПТА: название блюда + 3–5 ингредиентов + CTA.
    Подробные шаги приготовления НЕ печатаем на картинке — они идут в подпись (caption).
    """
    try:
        from PIL import Image, ImageDraw
    except Exception:  # noqa: BLE001
        return False
    try:
        base = Image.open(image_path).convert("RGBA")
        W, H = base.size
        green = (16, 185, 129, 255)
        green_dark = (5, 102, 74, 255)
        gold = (194, 132, 0, 255)
        ink = (28, 40, 36, 255)
        white = (255, 255, 255, 255)

        # Белая «морозная» панель снизу с мягким градиентом (green-white premium)
        panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        pd = ImageDraw.Draw(panel)
        top = int(H * 0.52)
        for yy in range(top, H):
            t = (yy - top) / max(1, (H - top))
            a = min(int(150 + 95 * t), 247)
            pd.line([(0, yy), (W, yy)], fill=(255, 255, 255, a))
        base = Image.alpha_composite(base, panel)
        draw = ImageDraw.Draw(base)

        m = int(W * 0.07)
        y = top + int(H * 0.035)
        max_w = W - 2 * m

        f_title = _load_font(int(W * 0.06))
        f_head = _load_font(int(W * 0.032))
        f_line = _load_font(int(W * 0.036))

        for line in _wrap(draw, _clean_text(title), f_title, max_w):
            draw.text((m, y), line, font=f_title, fill=green_dark)
            y += int(f_title.size * 1.12)
        y += int(H * 0.016)

        draw.text((m, y), "TARKIBI", font=f_head, fill=gold)
        y += int(f_head.size * 1.7)
        for ing in ingredients[:5]:
            for j, line in enumerate(_wrap(draw, _clean_text(ing), f_line, max_w - int(W * 0.02))):
                prefix = "•  " if j == 0 else "    "
                draw.text((m, y), prefix + line, font=f_line, fill=ink)
                y += int(f_line.size * 1.34)

        # CTA-кнопка (зелёная плашка, белый текст)
        f_cta = _load_font(int(W * 0.042))
        pad = int(W * 0.035)
        cta_t = _clean_text(cta)
        tw = draw.textlength(cta_t, font=f_cta)
        cy = min(y + int(H * 0.012), H - int(f_cta.size) - pad * 2 - int(H * 0.05))
        draw.rounded_rectangle(
            [m, cy, m + tw + pad * 2, cy + f_cta.size + pad],
            radius=int(f_cta.size * 0.6), fill=green,
        )
        draw.text((m + pad, cy + pad * 0.35), cta_t, font=f_cta, fill=white)

        f_m = _load_font(int(W * 0.027))
        draw.text((m, H - int(f_m.size * 1.9)), _clean_text(mention), font=f_m, fill=green)

        base.convert("RGB").save(out_path, "JPEG", quality=92)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("render_recipe_card: %s", e)
        return False


def render_meme_caption(image_path: str, out_path: str, text: str, top: bool = True) -> bool:
    """
    Классическая мем-подпись: крупный жирный белый текст с чёрной обводкой,
    по центру сверху (или снизу). Читаемо — в отличие от текста, который рисует DALL-E.
    """
    try:
        from PIL import Image, ImageDraw
    except Exception:  # noqa: BLE001
        return False
    try:
        base = Image.open(image_path).convert("RGBA")
        W, H = base.size
        draw = ImageDraw.Draw(base)
        f = _load_font(int(W * 0.072))
        lines = _wrap(draw, text.strip().strip('"').upper(), f, W - int(W * 0.08))

        line_h = int(f.size * 1.12)
        total = line_h * len(lines)
        y = int(H * 0.035) if top else H - total - int(H * 0.05)
        stroke = max(2, int(W * 0.004))

        for line in lines:
            tw = draw.textlength(line, font=f)
            x = (W - tw) // 2
            for dx in range(-stroke, stroke + 1, stroke):
                for dy in range(-stroke, stroke + 1, stroke):
                    draw.text((x + dx, y + dy), line, font=f, fill=(0, 0, 0, 255))
            draw.text((x, y), line, font=f, fill=(255, 255, 255, 255))
            y += line_h

        base.convert("RGB").save(out_path, "JPEG", quality=92)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("render_meme_caption: %s", e)
        return False


def overlay_logo(image_path: str, scale: float = 0.14, opacity: float = 0.92) -> bool:
    """
    Наложить логотип бренда на изображение (нижний правый угол).
    Белый фон логотипа делается прозрачным. Перезаписывает файл.
    Возвращает True при успехе, False при любой ошибке (не критично для генерации).
    """
    try:
        from PIL import Image
    except Exception:  # noqa: BLE001
        logger.warning("Pillow недоступен — логотип не наложен.")
        return False

    try:
        if not LOGO_PATH.exists():
            logger.warning("Логотип не найден: %s", LOGO_PATH)
            return False

        base = Image.open(image_path).convert("RGBA")
        logo = Image.open(LOGO_PATH).convert("RGBA")

        # Белый фон логотипа → прозрачность
        px = []
        for r, g, b, a in logo.getdata():
            if r > 236 and g > 236 and b > 236:
                px.append((r, g, b, 0))
            else:
                px.append((r, g, b, int(a * opacity)))
        logo.putdata(px)

        # Масштабируем логотип под ширину картинки
        w = max(1, int(base.width * scale))
        h = max(1, int(logo.height * (w / logo.width)))
        logo = logo.resize((w, h), Image.LANCZOS)

        margin = int(base.width * 0.03)
        pos = (base.width - w - margin, base.height - h - margin)
        base.alpha_composite(logo, pos)

        base.convert("RGB").save(image_path, "JPEG", quality=92)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("Не удалось наложить логотип: %s", e)
        return False
