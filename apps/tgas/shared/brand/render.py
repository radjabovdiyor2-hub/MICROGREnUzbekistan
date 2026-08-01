import logging
from shared.brand.core import LOGO_PATH
from shared.brand.utils import _load_font, _wrap, _clean_text

logger = logging.getLogger(__name__)


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
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return False
    try:
        base = Image.open(image_path).convert("RGBA")
        W, H = base.size

        green = (16, 185, 129, 255)
        green_dark = (5, 102, 74, 255)
        gold = (255, 184, 0, 255)
        ink = (28, 40, 36, 255)
        white = (255, 255, 255, 255)
        btn = gold if accent else green
        margin = int(W * 0.07)
        centered = layout == "center"

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
                pd.line([(0, yy), (W, yy)], fill=(10, 30, 22, 150))
        else:
            top = int(H * (0.46 if has_points else 0.58))
            for yy in range(top, H):
                t = (yy - top) / max(1, (H - top))
                a = min(int(150 + 95 * t), 246)
                pd.line([(0, yy), (W, yy)], fill=(255, 255, 255, a))
        base = Image.alpha_composite(base, panel)
        draw = ImageDraw.Draw(base)

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

        def _block(y: int, lines: list, font, fill) -> dict:
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

        if has_points:
            if section:
                f_sec = _load_font(int(W * 0.032))
                draw.text((margin, y), _clean_text(section).upper(), font=f_sec, fill=gold)
                y += int(f_sec.size * 1.7)
            f_pt = _load_font(int(W * 0.041))
            for pt in [p for p in points if str(p).strip()][:3]:
                for j, line in enumerate(_wrap(draw, _clean_text(str(pt)), f_pt, W - 2 * margin - int(W * 0.02))):
                    prefix = "•  " if j == 0 else "     "
                    draw.text((margin, y), prefix + line, font=f_pt, fill=ink)
                    y += int(f_pt.size * 1.32)
                y += int(H * 0.004)
            y += int(H * 0.012)

        elif subtitle and layout != "poll":
            f_sub = _load_font(int(W * (0.05 if centered else 0.043)))
            y = _block(
                y,
                _wrap(draw, _clean_text(subtitle), f_sub, W - 2 * margin),
                f_sub,
                white if centered else ink,
            )
            y += int(H * 0.016)

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
    except Exception as e:
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
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return False
    try:
        base = Image.open(image_path).convert("RGBA")
        W, H = base.size
        green = (16, 185, 129, 255)
        green_dark = (5, 102, 74, 255)
        gold = (194, 132, 0, 255)
        ink = (28, 40, 36, 255)
        white = (255, 255, 255, 255)

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
        draw.text((m, H - int(f_m.size * 1.9)), _clean_text(mention), font=f_m, fill=green)

        base.convert("RGB").save(out_path, "JPEG", quality=92)
        return True
    except Exception as e:
        logger.warning("render_recipe_card: %s", e)
        return False


def render_meme_caption(
    image_path: str, out_path: str, text: str, top: bool = True
) -> bool:
    try:
        from PIL import Image, ImageDraw
    except Exception:
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
    except Exception as e:
        logger.warning("render_meme_caption: %s", e)
        return False


def overlay_logo(image_path: str, scale: float = 0.14, opacity: float = 0.92) -> bool:
    try:
        from PIL import Image
    except Exception:
        logger.warning("Pillow недоступен — логотип не наложен.")
        return False

    try:
        if not LOGO_PATH.exists():
            logger.warning("Логотип не найден: %s", LOGO_PATH)
            return False

        base = Image.open(image_path).convert("RGBA")
        logo = Image.open(LOGO_PATH).convert("RGBA")

        px = []
        for r, g, b, a in logo.getdata():
            if r > 236 and g > 236 and b > 236:
                px.append((r, g, b, 0))
            else:
                px.append((r, g, b, int(a * opacity)))
        logo.putdata(px)

        w = max(1, int(base.width * scale))
        h = max(1, int(logo.height * (w / logo.width)))
        logo = logo.resize((w, h), Image.LANCZOS)

        margin = int(base.width * 0.03)
        pos = (base.width - w - margin, base.height - h - margin)
        base.alpha_composite(logo, pos)

        base.convert("RGB").save(image_path, "JPEG", quality=92)
        return True
    except Exception as e:
        logger.warning("Не удалось наложить логотип: %s", e)
        return False
