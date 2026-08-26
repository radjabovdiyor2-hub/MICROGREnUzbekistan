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

logger = logging.getLogger(__name__)

BRAND_DIR = Path(__file__).resolve().parent / "brand_assets"
LOGO_PATH = BRAND_DIR / "logo.png"

# ── Фирменные константы (из globals.css сайта) ───────────────────────────
BRAND = {
    "name": "Microgreen Uzbekistan",
    "website": "microgreenuzbekistan.com",
    "primary": "#10B981",  # изумрудно-зелёный
    "accent": "#FFB800",  # тёплый золотой акцент
    "primary_light": "#D1FAE5",
    "fonts": "Inter, Outfit",
    "tagline": "Надёжность + Доступность",
    "hashtag": "#MicrogreenUzbekistan",
    "phone": "+998 94 999 95 99",
    "instagram": "@microgreenuzbekistan",
    "city": "Самарканд",
}

# ── Фиксированный набор хэштегов для постов В ЛЕНТУ (feed) ────────────────────
# Детерминированный, курируемый: бренд + гео + ниша + ЗОЖ. Подставляется вместо
# AI-хэштегов (модель их коверкала: #ZO'Z, #tadqiqot). Стори хэштеги не публикуют,
# поэтому это важно только для ленты/reels, где подпись реально индексируется.
# Курируемый набор: бренд + гео (высокий локальный охват) + широкие food-discovery
# теги, которые люди реально листают, + ниша. Без битых/спамных тегов (#ZOJ, #Detoks).
# Instagram-практика 2026: ~8-12 релевантных тегов, микс крупных/средних/локальных.
BRAND_HASHTAGS = (
    "#MicrogreenUzbekistan #Samarqand #Toshkent #Uzbekistan "
    "#Ovqat #Retsept #Mazali #UyOshxonasi #Salat "
    "#SoglomOvqatlanish #Microgreen #Mikrozelen"
)

# ── Стиль для генерации ИЗОБРАЖЕНИЙ (добавляется к каждому DALL-E/gpt-image промпту) ──
BRAND_IMAGE_STYLE = (
    " || BRAND STYLE — Microgreen Uzbekistan: clean, premium, photorealistic natural-daylight food & "
    "lifestyle photography; real appetizing food, hands, kitchen and family-table scenes; brand accent "
    "palette of emerald green (#10B981) with warm golden-yellow (#FFB800) over clean white / soft neutral "
    "backgrounds; fresh greens or microgreens woven in as a SIGNATURE DETAIL where it feels natural — not "
    "forced into every shot; modern, minimal, appetizing, high-key soft lighting, shallow depth of field; "
    "warm, fresh, trustworthy mood; NO text overlays unless explicitly requested; keep a clean empty "
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
    "• ССЫЛКИ: Всегда используй ТОЛЬКО официальную ссылку https://microgreenuzbekistan.com. Категорически запрещено выдумывать несуществующие страницы (например, /shop?category=seeds или другие).\n"
    "• Пост завершай хэштегом #MicrogreenUzbekistan (плюс тематические).\n"
    "• Контакты при призыве к действию: тел. +998 94 999 95 99, Instagram @microgreenuzbekistan, Самарканд.\n"
    "• Ценности: свежесть, польза для здоровья, локальное производство, премиальное качество для ресторанов (HoReCa) и спорта.\n"
)

# ── КОНТЕНТ-ПОЛИТИКА SMM ─────────────────────────────────────────────────────
# Добавляется к системным промптам ГЕНЕРАЦИИ КОНТЕНТА (сторис/посты/рецепты).
# Намеренно ПЕРЕВЕШИВАЕТ общие указания BRAND_TEXT_STYLE (в т.ч. про двуязычие).
CONTENT_POLICY = (
    "\n\n=== КОНТЕНТ-ПОЛИТИКА Microgreen Uzbekistan (важнее общих указаний выше) ===\n"
    "МИССИЯ: быть ИНТЕРЕСНЫМ и «сохраняемым» аккаунтом о ЗОЖ, правильном питании, ресторанном качестве и красоте.\n"
    "ЦЕЛЕВАЯ АУДИТОРИЯ:\n"
    "1. B2B: Рестораны, кафе, шеф-повара (им важен вкус, свежесть, стабильность и wow-подача).\n"
    "2. B2C: Спортзалы, фитнес-аудитория, женщины, следящие за фигурой и здоровьем семьи (им важны витамины, диета, салаты).\n"
    "СТРОГИЙ ЗАПРЕТ: Мы продаем ГОТОВЫЙ премиальный продукт (срез или лотки). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать советы для огородников: про замачивание семян, самостоятельное выращивание на подоконнике, грунт и т.д. НИКАКОГО домашнего фермерства!\n"
    "ОРБИТА ТЕМ: легкие витаминные салаты на ужин, восстановление после тренировок, идеи премиальной подачи блюд для гостей, эстетика еды, поддержание энергии и фигуры, разница в витаминах между взрослой зеленью и микрозеленью.\n"
    "БРЕНД КАК НИТЬ: свежая зелень и микрозелень — ФИРМЕННАЯ деталь, вплетай её ЕСТЕСТВЕННО как акцент, а НЕ делай героем каждого поста. \n"
    "ХУК: первая фраза ДОЛЖНА останавливать скролл (вопрос, неожиданность, боль аудитории).\n"
    "ЦЕЛЬ РЕАКЦИИ: пиши так, чтобы захотелось СОХРАНИТЬ (рецепт/пользу) или ОТПРАВИТЬ другу.\n"
    "ЗАПРЕЩЕНО (жёстко): политика, религия, крипта, конкуренты, выдуманные факты, советы огородникам, выдуманные ссылки.\n"
    "ЯЗЫК: по брифу поста (для сторис и массового контента — Uzbek Latin; для B2B/HoReCa — русский). Не смешивай языки.\n"
    "СТИЛЬ ФОТО: аппетитно и по-настоящему — салаты, спортивные блюда, ресторанная подача, тренировки; фирменная зелёно-золотая палитра.\n"
    "CTA: мягко и по контексту («Saqlang», «Buyurtma berish»).\n"
    "ФОРМАТ СТОРИС: заголовок ≤5 слов + 1 короткая фраза пользы + 1 CTA.\n"
    "ФОРМАТ РЕЦЕПТА: на КАРТИНКЕ только название блюда + 3–5 ингредиентов + короткий CTA; подробные шаги — в тексте.\n"
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
        "C:/Windows/Fonts/arialbd.ttf",  # Windows (тест на хосте)
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
        "[\U0001f000-\U0001faff\U00002600-\U000027bf\U00002b00-\U00002bff"
        "\U0001f1e6-\U0001f1ff️‍❤⁉‼ьъыэЬЪЫЭ]",  # + кириллические артефакты транслитерации
        "",
        s,
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
    *,
    badge: str = "",
    layout: str = "bottom",
    options: list | None = None,
    note: str = "",
    accent: bool = False,
    points: list | None = None,
    section: str = "",
) -> bool:
    """
    Впечатывает в сторис фирменный текст: заголовок, польза, @упоминание и CTA-кнопку
    (имитация «комплектации», т.к. API сторис не поддерживает подписи/стикеры).

    Поддерживает РАЗНЫЕ макеты, чтобы сторис не выглядел одинаково каждый день:
      • layout='bottom' — плашка снизу (по умолчанию; прежнее поведение);
      • layout='top'    — плашка сверху (факт / «а вы знали»);
      • layout='center' — крупный центрированный текст (вопрос / цитата);
      • layout='poll'   — снизу, с двумя вариантами выбора (options) — «this or that».
    badge   — маленький ярлык-пилюля в углу (маркер формата дня);
    note    — короткая строка-триггер вовлечения (Javob yozing / Saqlang…);
    accent  — золотой акцент вместо зелёного (для промо);
    points  — 2-3 КОНКРЕТНЫХ пункта пользы (лайфхак/факт/рецепт) — рисуются списком «•»
              вместо одиночной фразы subtitle, чтобы реальная суть была на картинке;
    section — золотой заголовок над списком пунктов (MASLAHAT / TARKIBI / …).
    Без новых аргументов ведёт себя как раньше (обратная совместимость).
    """
    try:
        from PIL import Image, ImageDraw
    except Exception:  # noqa: BLE001
        return False
    try:
        base = Image.open(image_path).convert("RGBA")
        W, H = base.size

        green = (16, 185, 129, 255)  # #10B981
        green_dark = (5, 102, 74, 255)  # тёмно-зелёный для заголовка
        gold = (255, 184, 0, 255)  # #FFB800 — акцент/промо
        ink = (28, 40, 36, 255)  # тёплый почти-чёрный для текста
        white = (255, 255, 255, 255)
        btn = gold if accent else green
        margin = int(W * 0.07)
        centered = layout == "center"

        # Полупрозрачная панель для читаемости — сверху / по центру / снизу.
        # При наличии списка пунктов панель делаем выше, чтобы всё поместилось.
        has_points = bool(points) and layout != "poll"
        panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        pd = ImageDraw.Draw(panel)
        if layout == "top":
            bot = int(H * (0.62 if has_points else 0.44))
            for yy in range(0, bot):
                t = 1 - yy / max(1, bot)
                a = min(int(60 + 190 * t), 250)
                pd.line([(0, yy), (W, yy)], fill=(255, 255, 255, a))
        elif centered:
            for yy in range(int(H * 0.28), int(H * 0.74)):
                pd.line(
                    [(0, yy), (W, yy)], fill=(10, 30, 22, 150)
                )  # мягкая тёмная вуаль
        else:  # bottom / poll
            top = int(H * (0.46 if has_points else 0.58))
            for yy in range(top, H):
                t = (yy - top) / max(1, (H - top))
                a = min(int(150 + 95 * t), 246)  # плавный вход в чистый белый
                pd.line([(0, yy), (W, yy)], fill=(255, 255, 255, a))
        base = Image.alpha_composite(base, panel)
        draw = ImageDraw.Draw(base)

        # Ярлык-пилюля формата дня (BILARMIDINGIZ? / SAVOL / TANLANG…)
        if badge:
            f_b = _load_font(int(W * 0.032))
            bt = _clean_text(badge).upper()
            if bt:
                pad = int(W * 0.025)
                tw = draw.textlength(bt, font=f_b)
                by0 = int(H * 0.05) if layout == "top" else int(H * 0.06)
                draw.rounded_rectangle(
                    [margin, by0, margin + tw + pad * 2, by0 + f_b.size + pad],
                    radius=int(f_b.size * 0.55),
                    fill=btn,
                )
                draw.text((margin + pad, by0 + pad * 0.35), bt, font=f_b, fill=white)

        def _block(y, lines, font, fill):
            for ln in lines:
                x = ((W - draw.textlength(ln, font=font)) / 2) if centered else margin
                draw.text((x, y), ln, font=font, fill=fill)
                y += int(font.size * 1.14)
            return y

        if layout == "top":
            y = int(H * 0.11)
        elif centered:
            y = int(H * 0.36)
        else:
            y = int(H * (0.50 if has_points else 0.62))

        # Заголовок (крупный; чуть меньше, когда под ним список пунктов)
        if headline:
            hsize = 0.066 if has_points else (0.086 if centered else 0.078)
            f_head = _load_font(int(W * hsize))
            y = _block(
                y,
                _wrap(draw, _clean_text(headline), f_head, W - 2 * margin),
                f_head,
                white if centered else green_dark,
            )
            y += int(H * 0.014)

        # Список КОНКРЕТНЫХ пунктов (лайфхак/факт/рецепт) — реальная суть на картинке.
        # Заменяет одиночную фразу subtitle (паттерн из render_recipe_card).
        if has_points:
            if section:
                f_sec = _load_font(int(W * 0.032))
                draw.text(
                    (margin, y), _clean_text(section).upper(), font=f_sec, fill=gold
                )
                y += int(f_sec.size * 1.7)
            f_pt = _load_font(int(W * 0.041))
            # `points` объявлен необязательным и здесь уже проверен
            # через `has_points`, но проверка стоит выше по коду —
            # берём `or []`, чтобы это читалось на месте.
            for pt in [p for p in (points or []) if str(p).strip()][:3]:
                for j, line in enumerate(
                    _wrap(
                        draw, _clean_text(str(pt)), f_pt, W - 2 * margin - int(W * 0.02)
                    )
                ):
                    prefix = "•  " if j == 0 else "     "
                    draw.text((margin, y), prefix + line, font=f_pt, fill=ink)
                    y += int(f_pt.size * 1.32)
                y += int(H * 0.004)
            y += int(H * 0.012)

        # Одиночная фраза пользы (когда нет списка; не для poll)
        elif subtitle and layout != "poll":
            f_sub = _load_font(int(W * (0.05 if centered else 0.043)))
            y = _block(
                y,
                _wrap(draw, _clean_text(subtitle), f_sub, W - 2 * margin),
                f_sub,
                white if centered else ink,
            )
            y += int(H * 0.016)

        # Два варианта выбора для «this or that»
        if layout == "poll" and options:
            f_o = _load_font(int(W * 0.05))
            pad = int(W * 0.03)
            for i, opt in enumerate(options[:2]):
                ot = _clean_text(str(opt))
                if not ot:
                    continue
                draw.rounded_rectangle(
                    [margin, y, W - margin, y + f_o.size + pad],
                    radius=int(f_o.size * 0.5),
                    fill=(green if i == 0 else gold),
                )
                draw.text((margin + pad, y + pad * 0.3), ot, font=f_o, fill=white)
                y += f_o.size + pad + int(H * 0.012)
            y += int(H * 0.006)

        # CTA-кнопка
        if cta:
            f_cta = _load_font(int(W * 0.042))
            pad = int(W * 0.035)
            cta_t = _clean_text(cta)
            tw = draw.textlength(cta_t, font=f_cta)
            by = min(y, H - int(f_cta.size) - pad * 2 - int(H * 0.075))
            bx = int((W - (tw + pad * 2)) / 2) if centered else margin
            draw.rounded_rectangle(
                [bx, by, bx + tw + pad * 2, by + f_cta.size + pad],
                radius=int(f_cta.size * 0.6),
                fill=btn,
            )
            draw.text((bx + pad, by + pad * 0.35), cta_t, font=f_cta, fill=white)
            y = by + f_cta.size + pad + int(H * 0.010)

        # Триггер вовлечения — то, что поднимает сторис в охвате
        if note:
            f_n = _load_font(int(W * 0.032))
            nt = _clean_text(note)
            if nt:
                x = ((W - draw.textlength(nt, font=f_n)) / 2) if centered else margin
                draw.text(
                    (x, min(y, H - int(f_n.size * 2.4))),
                    nt,
                    font=f_n,
                    fill=white if centered else green_dark,
                )

        # @упоминание — всегда внизу
        if mention:
            f_m = _load_font(int(W * 0.028))
            draw.text(
                (margin, H - int(f_m.size * 2.2)),
                _clean_text(mention),
                font=f_m,
                fill=white if centered else green,
            )

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
            for j, line in enumerate(
                _wrap(draw, _clean_text(ing), f_line, max_w - int(W * 0.02))
            ):
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
            radius=int(f_cta.size * 0.6),
            fill=green,
        )
        draw.text((m + pad, cy + pad * 0.35), cta_t, font=f_cta, fill=white)

        f_m = _load_font(int(W * 0.027))
        draw.text(
            (m, H - int(f_m.size * 1.9)), _clean_text(mention), font=f_m, fill=green
        )

        base.convert("RGB").save(out_path, "JPEG", quality=92)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("render_recipe_card: %s", e)
        return False


def render_meme_caption(
    image_path: str, out_path: str, text: str, top: bool = True
) -> bool:
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
        for r, g, b, a in list(logo.getdata()):
            if r > 236 and g > 236 and b > 236:
                px.append((r, g, b, 0))
            else:
                px.append((r, g, b, int(a * opacity)))
        logo.putdata(px)

        # Масштабируем логотип под ширину картинки
        w = max(1, int(base.width * scale))
        h = max(1, int(logo.height * (w / logo.width)))
        logo = logo.resize((w, h), Image.Resampling.LANCZOS)

        margin = int(base.width * 0.03)
        pos = (base.width - w - margin, base.height - h - margin)
        base.alpha_composite(logo, pos)

        base.convert("RGB").save(image_path, "JPEG", quality=92)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("Не удалось наложить логотип: %s", e)
        return False
