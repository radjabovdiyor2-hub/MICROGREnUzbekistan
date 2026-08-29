"""
Кнопка меню бота: у каждого своя дверь, и она ведёт на существующий экран.

Кнопки «Открыть в админке» живут в конкретном сообщении и уезжают вверх за
день переписки. Кнопка меню стоит рядом с полем ввода всегда — и до сих пор
её не было ни у одного бота офиса.

Здесь два предмета проверки: состав (кнопка есть у всех, кто умеет писать в
Telegram, и только у них) и адрес (раздел существует в реестре вкладок
витрины). Второе особенно тихо ломается: опечатка в имени вкладки открывает
админку не там, и заметить это можно только руками.
"""

from __future__ import annotations

import re
from pathlib import Path

from shared import bot_registry, menu_button

ROOT = Path(__file__).resolve().parent.parent

#: Единственный реестр экранов админки — он же в TypeScript.
ADMIN_TABS_TSX = ROOT.parent / "web" / "src" / "app" / "admin" / "adminTabs.tsx"


def admin_tab_ids() -> set[str]:
    if not ADMIN_TABS_TSX.exists():
        return set()
    return set(
        re.findall(r"\{\s*id:\s*'([a-z_]+)'", ADMIN_TABS_TSX.read_text(encoding="utf-8"))
    )


def telegram_bots() -> set[str]:
    """Боты с интерфейсом: остальным кнопку ставить не в чем."""
    return {b.name for b in bot_registry.BOTS if b.telegram}


def test_every_telegram_bot_has_its_own_door():
    """У каждого бота с интерфейсом есть раздел админки."""
    missing = telegram_bots() - set(menu_button.BOT_TABS)
    assert missing == set(), (
        "у этих ботов нет раздела в menu_button.BOT_TABS — кнопка меню не "
        f"поставится: {', '.join(sorted(missing))}"
    )


def test_no_door_for_headless_bots():
    """Ботам без Telegram кнопку ставить нечем — их в таблице быть не должно."""
    headless = {b.name for b in bot_registry.BOTS if not b.telegram}
    extra = headless & set(menu_button.BOT_TABS)
    assert extra == set(), (
        f"у этих ботов нет Telegram-интерфейса: {', '.join(sorted(extra))}"
    )


def test_doors_lead_to_existing_screens():
    """Раздел каждого бота существует в adminTabs.tsx."""
    known = admin_tab_ids()
    assert known, f"не читается реестр вкладок ({ADMIN_TABS_TSX})"

    broken = {name: tab for name, tab in menu_button.BOT_TABS.items() if tab not in known}
    assert broken == {}, (
        "кнопка меню откроет админку не там: "
        + ", ".join(f"{n} → {t}" for n, t in sorted(broken.items()))
    )


def test_guard_can_go_red():
    """Сторож обязан уметь краснеть — иначе он ничего не проверяет."""
    known = admin_tab_ids()
    assert "orders" in known
    assert "nesushestvuyushaya" not in known


def test_doors_are_distinct_enough():
    """Двери не сведены в одну общую: иначе кнопка теряет смысл.

    Если все восемь ботов ведут в одно место, человек снова ищет нужный
    экран глазами — ровно то, ради устранения чего кнопка и заводилась.

    СЧИТАЕТСЯ НАЗНАЧЕНИЕ ЦЕЛИКОМ, А НЕ ОДНА ВКЛАДКА. Десять экранов
    отделов свернулись в один с переключателем: три бота ведут теперь на
    вкладку `departments`, но каждый — на свой отдел. По вкладке это
    выглядит как «все в одно место», по адресу — нет. Меряя только
    вкладку, сторож краснел бы на верной правке и молчал бы, если бы
    отделы у этих трёх однажды совпали.
    """
    doors = [
        (tab, menu_button.BOT_DEPARTMENTS.get(bot))
        for bot, tab in menu_button.BOT_TABS.items()
    ]
    assert len(set(doors)) >= len(doors) - 1, "почти все боты ведут в одно место"


def test_department_hint_only_where_screen_takes_it():
    """Подсказка отдела бессмысленна на вкладке, которая её не читает."""
    for bot, dept in menu_button.BOT_DEPARTMENTS.items():
        assert menu_button.BOT_TABS.get(bot) == "departments", (
            f"{bot}: отдел «{dept}» указан, а вкладка не «departments»"
        )


def test_tab_of_returns_none_for_unknown():
    assert menu_button.tab_of("no_such_bot") is None
    assert menu_button.tab_of("finance_bot") == "finance"
