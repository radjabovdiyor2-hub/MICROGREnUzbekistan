from __future__ import annotations
import html as _html

def format_price(amount: float | int) -> str:
    rounded = int(round(amount))
    if rounded < 0:
        formatted = "-" + f"{abs(rounded):,}".replace(",", " ")
    else:
        formatted = f"{rounded:,}".replace(",", " ")
    return f"{formatted} сум"

def escape_md(text: str) -> str:
    special_chars = r"_*[]()~`>#+-=|{}.!"
    escaped = text
    for char in special_chars:
        escaped = escaped.replace(char, f"\\{char}")
    return escaped

def truncate_text(text: str, max_length: int = 200, suffix: str = "...") -> str:
    if len(text) <= max_length:
        return text
    return text[: max_length - len(suffix)].rstrip() + suffix

def collapsible(text: str, threshold: int = 550, header: str = "") -> str:
    if not text:
        return text
    t = text.strip()
    if len(t) <= threshold:
        return f"{header}\n{t}" if header else t
    head = header or "🔽 <i>Подробно — нажмите, чтобы развернуть:</i>"
    return f"{head}\n<blockquote expandable>{_html.escape(t)}</blockquote>"
