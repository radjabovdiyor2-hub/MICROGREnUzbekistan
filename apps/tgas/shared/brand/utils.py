from shared.brand.core import BRAND_IMAGE_STYLE

def brand_image_prompt(prompt: str) -> str:
    if not prompt:
        return BRAND_IMAGE_STYLE
    return f"{prompt}{BRAND_IMAGE_STYLE}"


def _load_font(size: int):
    from PIL import ImageFont

    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _wrap(draw, text: str, font, max_w: int) -> list[str]:
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
    if not s:
        return ""
    import re

    s = re.sub(
        "[\U0001f000-\U0001faff\U00002600-\U000027bf\U00002b00-\U00002bff"
        "\U0001f1e6-\U0001f1ff️‍❤⁉‼ьъыэЬЪЫЭ]",
        "",
        s,
    )
    return s.strip().strip('"').strip()
