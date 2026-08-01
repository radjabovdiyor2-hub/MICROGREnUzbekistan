import re
from typing import Dict, List, Optional
from shared.utils import format_price

DEDUPE_WINDOW_MINUTES = 15
FUZZY_THRESHOLD = 0.45

def normalize_phone(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) < 7:
        return None
    if len(digits) == 9:
        digits = "998" + digits
    return "+" + digits

def _to_float(value: dict) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^\d.,]", "", str(value)).replace(",", ".")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None

def _clarify_message(ambiguous: List[Dict[str]], missing: List[Dict[str]]) -> str:
    parts = []
    for amb in ambiguous:
        parts.append(f"Какую «{amb['query']}» продали? Выберите ниже 👇")
    for miss in missing:
        if not miss.get("name"):
            parts.append("Что именно продали? Назовите товар.")
        elif miss.get("unit_price"):
            parts.append(
                f"Товара «{miss['name']}» нет в каталоге. "
                f"Добавить в магазин и CRM по {format_price(miss['unit_price'])}?"
            )
        else:
            parts.append(
                f"Товара «{miss['name']}» нет в каталоге. "
                f"Назовите цену — заведу его в магазин и CRM."
            )
    head = "Продажу пока не записал.\n\n" if len(parts) > 1 else ""
    return head + "\n\n".join(parts)

def format_sale_report(result: Dict[str]) -> str:
    if result.get("status") != "ok":
        return result.get("message", "Не удалось зарегистрировать продажу.")

    d = result.get("data", {})
    lines = [
        "✅ <b>Продажа зарегистрирована</b>",
        "",
        f"📦 Заказ: <b>{d['order_number']}</b>",
        f"🏢 Клиент: {d['customer_name']}"
        + (" (новая карточка в CRM)" if d.get("customer_created") else " (в CRM)"),
    ]
    if d.get("phone"):
        lines.append(f"📞 Телефон: {d['phone']}")
    lines.append("")
    for item in d.get("items", []):
        lines.append(
            f"🌱 {item['name']} × {item['quantity']:g} × {format_price(item['unit_price'])} "
            f"= {format_price(item['total_price'])}"
        )
    lines.append("")
    lines.append(f"💰 Итого: <b>{format_price(d['total_amount'])}</b>")
    lines.append(
        "💳 Оплата: "
        + ("получена" if d.get("payment_status") == "paid" else "ожидается")
    )
    lines.append("")
    lines.append("Финансы учли доход, аналитика — метрику, PM видит заказ.")
    return "\n".join(lines)
