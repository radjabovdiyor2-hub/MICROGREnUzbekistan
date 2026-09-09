"""
Магазин у покупателя один.

ЗАЧЕМ ЭТОТ ТЕСТ

`apps/bot` и `sales_bot` оба вели человека через каталог → корзину → чекаут,
но по разным данным: корзина в `cart_storage` против FSM-состояний, каталог
по HTTP против прямого SQL, покупатель в витринных `users` против CRM
`customers`, доставка из `/api/config` против `settings_store`.

Клиент, писавший одному боту, для второго был новым человеком: другие баллы,
другая история заказов, свой способ посчитать доставку. Две реализации одного
и того же расходились молча — заметить это можно было только по жалобе.

Вторая витрина не «удалена и забыта»: её легко завести заново, дописав один
роутер. Поэтому проверяется не факт удаления файлов, а отсутствие клиентских
сценариев покупки в боте отдела продаж.
"""

from __future__ import annotations

import re
from pathlib import Path

SALES = Path(__file__).resolve().parent.parent / "bots" / "sales_bot"

# Колбэки клиентской покупки. `menu:orders` сюда не входит: показать человеку
# его заказы из CRM — это работа отдела продаж, а не вторая корзина.
SHOPPING_CALLBACKS = re.compile(r"""["'](?:cart:|cat:|order:confirm|pay:)""")


def _sources() -> list[Path]:
    return [p for p in SALES.rglob("*.py") if "__pycache__" not in p.parts]


def test_sales_bot_has_no_customer_cart() -> None:
    offenders: list[str] = []
    for path in _sources():
        text = path.read_text(encoding="utf-8")
        for i, line in enumerate(text.splitlines(), 1):
            stripped = line.strip()
            # Комментарии объясняют, почему витрины здесь нет, — они не код.
            if stripped.startswith("#"):
                continue
            if SHOPPING_CALLBACKS.search(line):
                offenders.append(f"{path.relative_to(SALES.parent.parent)}:{i}")

    assert not offenders, (
        "В боте отдела продаж снова появилась клиентская покупка. Магазин "
        "должен быть один — витринный apps/bot, иначе у клиента опять "
        "разойдутся баллы и история заказов:\n  " + "\n  ".join(offenders)
    )


# Роутеры, которым в боте отдела продаж место. Список ИМЕНОВАННЫЙ, а не
# счётчик: счётчик одинаково падал и на возврате клиентской витрины, и на
# любой честной офисной надстройке, поэтому его чинили, не разбираясь, —
# то есть страж превращался в формальность. Имя заставляет назвать, что
# именно добавили, а безымянный новичок роняет тест ровно так же.
OFFICE_HANDLERS = {
    "start",  # приветствие и лид-захват
    "b2b",  # заявка на сотрудничество
    "ai_chat",  # разговор с менеджером
    "tracking",  # трансляция геопозиции полевого сотрудника
}


def test_sales_bot_routers_are_office_only() -> None:
    source = (SALES / "handlers" / "__init__.py").read_text(encoding="utf-8")
    imported = set(re.findall(r"from bots\.sales_bot\.handlers\.(\w+) import", source))

    assert imported == OFFICE_HANDLERS, (
        "состав роутеров отдела продаж изменился — проверьте, не вернулась ли "
        f"клиентская витрина.\n  лишние: {sorted(imported - OFFICE_HANDLERS)}"
        f"\n  пропали: {sorted(OFFICE_HANDLERS - imported)}"
    )

    from bots.sales_bot.handlers import all_routers

    assert len(all_routers) == len(OFFICE_HANDLERS), (
        "роутер импортирован, но не включён в all_routers (или наоборот) — "
        "тогда его обработчики молча не работают"
    )


def test_shop_button_points_to_the_single_shop() -> None:
    """Тупика быть не должно: покупателю нужен адрес, куда идти."""
    from bots.sales_bot.keyboards.inline import SHOP_URL_FALLBACK, main_menu_kb

    markup = main_menu_kb("ru")
    urls = [b.url for row in markup.inline_keyboard for b in row if b.url]
    assert urls, "кнопка «Заказать» исчезла — клиенту некуда идти за покупкой"
    assert SHOP_URL_FALLBACK in urls
