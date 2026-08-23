"""У каждой кнопки должен быть обработчик.

ЗАЧЕМ ЭТОТ ТЕСТ

Кнопка с `callback_data`, к которой не написан обработчик, не падает и не
логируется. Telegram просто крутит спиннер, пока не истечёт время, и клиент
видит, что нажатие ничего не сделало. Со стороны кода всё «работает».

На момент написания так молчали четыре кнопки, и среди них — ГЛАВНАЯ кнопка
своего экрана:

  * `reorder:confirm:<id>` — «Повторить этот заказ»;
  * `sub:interval:WEEKLY|BIWEEKLY|MONTHLY` — все три кнопки подписки;
  * `shop:product:<id>` из избранного и поиска — обработчик был, но ждал
    четыре части и падал с IndexError на трёх, то есть тоже молчал.

Тест читает исходники текстом: поднимать aiogram и Telegram ради сверки имён
не нужно, а сверить — нужно. Тот же приём, что в `test_api_contract.py`.
"""

import re
from pathlib import Path

BOT = Path(__file__).resolve().parent.parent
HANDLERS = sorted((BOT / "handlers").glob("*.py")) + sorted((BOT / "keyboards").glob("*.py"))

# `callback_data="cart:view"` или `callback_data=f"shop:grid:{cat}:{page}"`
PRODUCED = re.compile(r"""callback_data\s*=\s*f?["']([^"']+)["']""")

# Фильтры обработчиков: `F.data == "x"`, `F.data.startswith("x")`,
# `F.data.in_({"a", "b"})`.
EQUALS = re.compile(r"""F\.data\s*==\s*["']([^"']+)["']""")
STARTS = re.compile(r"""F\.data\.startswith\(\s*["']([^"']+)["']""")
IN_SET = re.compile(r"""F\.data\.in_\(\s*[\{\(\[]([^\}\)\]]+)[\}\)\]]""")

# Кнопки, которые намеренно ничего не делают.
IGNORED = {"noop"}


def _sources() -> dict[Path, str]:
    return {path: path.read_text(encoding="utf-8") for path in HANDLERS}


def _produced() -> dict[str, Path]:
    """Все `callback_data`, которые порождают клавиатуры: значение → файл."""
    out: dict[str, Path] = {}
    for path, source in _sources().items():
        for raw in PRODUCED.findall(source):
            # У f-строки берём постоянный префикс до первой подстановки:
            # именно по нему обработчик и фильтрует.
            prefix = raw.split("{", 1)[0]
            if prefix and prefix not in IGNORED:
                out.setdefault(prefix, path)
    return out


def _handled() -> tuple[set[str], list[str]]:
    """Точные значения и префиксы, на которые обработчик подписан."""
    exact: set[str] = set()
    prefixes: list[str] = []
    for source in _sources().values():
        exact.update(EQUALS.findall(source))
        prefixes.extend(STARTS.findall(source))
        for group in IN_SET.findall(source):
            exact.update(re.findall(r"""["']([^"']+)["']""", group))
    return exact, prefixes


def test_каждая_кнопка_имеет_обработчик():
    produced = _produced()
    exact, prefixes = _handled()

    orphans = []
    for value, path in sorted(produced.items()):
        if value in exact:
            continue
        if any(value.startswith(prefix) for prefix in prefixes):
            continue
        # Обработчик мог быть подписан на более длинный префикс: кнопка
        # «cart:add:» и фильтр «cart:add:» — это совпадение, а кнопка
        # «cart:» и фильтр «cart:add:» — нет.
        if any(prefix.startswith(value) and value.endswith(":") for prefix in prefixes):
            continue
        orphans.append(f"{value}  ({path.name})")

    assert not orphans, (
        "кнопки без обработчика — нажатие крутит спиннер и не делает ничего:\n  "
        + "\n  ".join(orphans)
    )


def test_сторож_узнаёт_мёртвую_кнопку():
    """Без этой проверки предыдущий тест был бы зелёным и на пустом списке."""
    exact, prefixes = _handled()
    invented = "reorder:vydumannaya-knopka"

    assert invented not in exact
    assert not any(invented.startswith(prefix) for prefix in prefixes)


def test_у_каждого_обработчика_есть_кнопка():
    """
    Обратная сторона: обработчик, к которому не ведёт ни одна кнопка, —
    мёртвый код. Так в боте жили `menu:catalog`, `checkout:cancel` и дубли
    `my_orders` / `bonuses` с другим текстом и другой клавиатурой.

    Проверка мягкая — только сообщает список, потому что часть обработчиков
    вызывается по команде или из другого модуля.
    """
    produced = set(_produced())
    exact, _prefixes = _handled()

    unreachable = sorted(
        value for value in exact
        if value not in produced and not any(p.startswith(value) for p in produced)
    )
    # Осталось ровно `noop` — кнопка-заглушка (номер страницы, номер позиции
    # в корзине): её нажимают, и по замыслу не происходит ничего. Порог был
    # восемь, пока в боте жили `menu:catalog`, `checkout:cancel` и близнецы
    # `my_orders` / `bonuses`. Их убрали — значит и порог опускаем: иначе
    # мёртвый код тихо отрастёт обратно до восьми.
    assert unreachable == ["noop"], (
        "обработчики без кнопок — это мёртвый код:\n  " + "\n  ".join(unreachable)
    )
