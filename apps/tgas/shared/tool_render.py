"""
🧾 ПОКАЗ РЕЗУЛЬТАТА ИНСТРУМЕНТА — без модели
=============================================
Результат инструмента показывается руководителю ДОСЛОВНО. Модель его не
пересказывает и не комментирует.

ЗАЧЕМ ЭТОТ МОДУЛЬ СУЩЕСТВУЕТ

Сначала результаты инструментов вообще не доходили до чата: разбор у Стёпана
печатал только ключ `message`, а у CRM-инструментов его нет — они отдают
`summary` или голые поля. Бот ставил 👍 и молчал.

Починка «отдать результат модели, пусть сформулирует» разменяла молчание на
худшее — на неверный ответ. Прайс-лист `[baby-leaf]` (100 г, 35 000 сум) модель
назвала «прайс-листом на микрозелень»: цены настоящие, категория чужая, а
микрозелень стоит 15 000–20 000 за ЛОТОК. Вдобавок системный промпт несёт
`BRAND_TEXT_STYLE` — рекламный тон и хэштег в конце, — и внутренний прайс вышел
похожим на пост в Instagram.

Через тот путь шли 54 инструмента из 69, включая `get_pnl`, `get_debts`,
`get_sales_today` и `top_products`. Цифра, прошедшая через пересказ, — это уже
не цифра из базы.

Принцип здесь тот же, что у отчёта о продаже и показа опубликованного поста:
факт печатается как есть, комментарий модели поверх факта запрещён.

КАК ЭТО УСТРОЕНО

`render(name, result)` пробует по порядку:
  1. `Tool.render` — собственный формат инструмента (объявляется при регистрации,
     ровно как `confirm`);
  2. готовый человеческий текст в результате (`message`, `error`, `summary`);
  3. общий разбор словаря — скаляры и списки, ничего не теряя.

Пустую строку не возвращает НИКОГДА: пустой ответ неотличим от «бот не понял».
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

#: Служебные ключи: они объясняют результат машине, а не человеку.
_TECHNICAL = {
    "ok",
    "found",
    "status",
    "source",
    "note",
    "evidence",
    "human_task",
    "autonomous",
    "sent_for_approval",
    "skipped",
    "needs",
    "data",
    "pending",
    # Подсказка модели, что делать дальше («вызови ещё раз с force_new»).
    # Человеку она не адресована и в чате выглядит как приказ на непонятном
    # языке — ровно так руководитель и увидел «повтори с force_new».
    "hint",
    "matched_field",
    "score",
}

#: Сколько элементов списка показываем, прежде чем свернуть остаток в «и ещё N».
_MAX_ITEMS = 10

#: Человеческие подписи к частым ключам. Ключи инструментов — английские (код
#: на английском по конституции проекта), а читает их русскоязычный
#: руководитель: «revenue_text» в чате объясняет не больше, чем `[baby-leaf]`
#: в заголовке прайса. Чего в словаре нет — печатается ключом как есть: лучше
#: непривычное слово, чем потерянная строка.
_LABELS = {
    "count": "всего",
    "orders": "заказов",
    "orders_count": "заказов",
    "revenue": "выручка",
    "revenue_text": "выручка",
    "paid_orders": "оплачено заказов",
    "paid_revenue_text": "оплачено на",
    "average_check_text": "средний чек",
    "cancelled_orders": "отменено",
    "units": "единиц",
    "total": "итого",
    "total_text": "итого",
    "total_amount": "сумма",
    "total_spent": "куплено на",
    "total_spent_text": "куплено на",
    "income": "доход",
    "expense": "расход",
    "profit": "прибыль",
    "date": "дата",
    "month": "месяц",
    "name": "название",
    "phone": "телефон",
    "status": "статус",
    "payment_status": "оплата",
    "order_number": "заказ",
    "customer_id": "клиент №",
    "customer_name": "клиент",
    "created": "создан",
    "by_customer": "по клиентам",
    "products": "товары",
    "customers": "клиенты",
    "candidates": "варианты",
    "items": "позиции",
    "stock": "остаток",
    "price_text": "цена",
    "unit": "единица",
}


def _label(key: str) -> str:
    return _LABELS.get(key, key)


def _is_scalar(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool)) or value is None


def _scalar(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "да" if value else "нет"
    if isinstance(value, float) and value.is_integer():
        return f"{int(value)}"
    return str(value)


def _item(entry: Any) -> str:
    """Элемент списка одной строкой: только значения, без служебных ключей."""
    if _is_scalar(entry):
        return _scalar(entry)
    if isinstance(entry, dict):
        parts = [
            _scalar(v)
            for k, v in entry.items()
            if _is_scalar(v) and k not in _TECHNICAL and k != "id" and v not in (None, "")
        ]
        return " · ".join(parts) if parts else str(entry)[:200]
    return str(entry)[:200]


def _generic(result: Dict[str, Any]) -> str:
    """Разбор произвольного словаря: скаляры строками, списки — перечнем.

    Ничего не выбрасываем, кроме служебных ключей: результат инструмента —
    это то, ради чего его звали, и решать за руководителя, какая цифра ему
    сейчас интересна, здесь нельзя.
    """
    lines: List[str] = []
    for key, value in result.items():
        if key in _TECHNICAL:
            continue
        if _is_scalar(value):
            if value in (None, ""):
                continue
            lines.append(f"{_label(key)}: {_scalar(value)}")
        elif isinstance(value, list):
            if not value:
                lines.append(f"{_label(key)}: пусто")
                continue
            lines.append(f"{_label(key)} ({len(value)}):")
            for entry in value[:_MAX_ITEMS]:
                lines.append(f"  • {_item(entry)}")
            if len(value) > _MAX_ITEMS:
                lines.append(f"  … и ещё {len(value) - _MAX_ITEMS}")
        elif isinstance(value, dict):
            inner = _item(value)
            if inner:
                lines.append(f"{_label(key)}: {inner}")
    return "\n".join(lines)


def render(name: str, result: Any) -> str:
    """Показать результат инструмента человеку. Никогда не пусто."""
    if result is None:
        return f"{name}: инструмент ничего не вернул."
    if not isinstance(result, dict):
        return str(result)[:3000]

    from shared import tools as tool_registry

    tool = tool_registry.by_name(name)
    if tool is not None and tool.render is not None:
        try:
            own = tool.render(result)
            if own and str(own).strip():
                return str(own).strip()
        except Exception:  # формат не должен ронять ответ
            logger.warning("TOOL_RENDER: свой формат «%s» не отработал", name)

    for key, prefix in (("message", ""), ("error", "⚠️ ")):
        value = result.get(key)
        if value and str(value).strip():
            return prefix + str(value).strip()

    summary = result.get("summary")
    rest = _generic({k: v for k, v in result.items() if k != "summary"})
    if summary and str(summary).strip():
        return (str(summary).strip() + ("\n\n" + rest if rest else "")).strip()

    return rest or f"{name}: выполнено, данных нет."


# ── Форматы отдельных инструментов ──────────────────────────────────────
#
# Объявляются при регистрации (`Tool(render=...)`), как и `confirm`. Здесь —
# только те, к которым руководитель обращается каждый день; остальным хватает
# общего разбора выше.


def price_list(result: Dict[str, Any]) -> str:
    """Прайс печатаем ровно так, как его собрал каталог, — это источник цен."""
    return str(result.get("price_list") or "").strip()


def customers(result: Dict[str, Any]) -> str:
    """Найденные карточки клиентов."""
    if not result.get("found"):
        return str(result.get("summary") or "Клиента в CRM нет.")
    lines = [f"👥 Нашёл: {result.get('count', 0)}"]
    for c in result.get("customers", []):
        mark = "🏢" if c.get("type") == "b2b" else "👤"
        lines.append(
            f"{mark} {c.get('name')} · {c.get('phone')} · заказов "
            f"{c.get('orders_count', 0)} на {c.get('total_spent_text', '—')}"
        )
    return "\n".join(lines)


def customer_confirm(result: Dict[str, Any]) -> str:
    """Итог заведения клиента: карточка, отказ или вопрос о тёзке.

    Вопрос печатается списком с телефонами: имя без номера ничего не решает —
    именно по номеру руководитель и отличает «тот самый ресторан» от
    однофамильца. Слова `force_new` здесь нет и быть не может: это инструкция
    модели, а читает текст человек.
    """
    if result.get("needs") == "confirmation":
        return "🤔 " + str(result.get("error") or "Похожий клиент уже есть.")

    summary = result.get("summary")
    if summary and str(summary).strip():
        return str(summary).strip()
    error = result.get("error")
    return f"⚠️ {error}" if error else "Клиент не заведён — данных нет."


def customer_orders(result: Dict[str, Any]) -> str:
    """История заказов клиента: что брал и на сколько."""
    if not result.get("found"):
        return str(result.get("summary") or "Заказов не нашёл.")
    c = result.get("customer", {})
    lines = [
        f"👤 {c.get('name')} · {c.get('phone')} · всего заказов "
        f"{c.get('orders_count', 0)} на {c.get('total_spent_text', '—')}",
        "",
    ]
    orders = result.get("orders", [])
    if not orders:
        lines.append("Заказов в CRM пока нет.")
    for o in orders:
        lines.append(
            f"📦 {o.get('order_number')} · {o.get('date') or '—'} · "
            f"{o.get('total_text')} · {o.get('status')}/{o.get('payment_status')}"
        )
        for item in o.get("items", []):
            lines.append(f"   — {item}")
    return "\n".join(lines)
