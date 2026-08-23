"""Словарь бота: у каждого ключа два языка, и ни один не потерян.

Бот числился двуязычным, будучи переведённым на один экран. Эти проверки
закрепляют обратное — и ловят самый вероятный способ снова его расстроить:
добавить ключ, переведя только одну сторону.
"""

import re

from shared.i18n import DEFAULT_LANG, LANGS, STRINGS, normalize, t


def test_у_каждого_ключа_обе_стороны():
    broken = [key for key, pair in STRINGS.items() if len(pair) != 2]
    assert not broken, f"ключи не с парой значений: {broken}"


def test_ни_одна_строка_не_пуста():
    empty = [
        key for key, pair in STRINGS.items()
        if not pair[0].strip() or not pair[1].strip()
    ]
    assert not empty, f"пустой перевод: {empty}"


def test_узбекский_не_копия_русского():
    """
    Копия русского в узбекской колонке — то же самое, что отсутствие
    перевода, только незаметнее: тест на пустоту её пропустит.

    Исключения перечислены явно: у части строк перевод и не нужен —
    например, «🌐 Til / Язык» уже двуязычна по сути.
    """
    SAME_BY_DESIGN = {"btn.language", "shop.page"}

    copies = [
        key for key, (uz, ru) in STRINGS.items()
        if uz == ru and key not in SAME_BY_DESIGN
    ]
    assert not copies, f"узбекский совпадает с русским: {copies}"


def test_подстановки_совпадают_в_обоих_языках():
    """
    `{price}` в русской строке и `{sum}` в узбекской — это KeyError в
    рантайме на живом клиенте. Формат проверяется здесь, а не там.
    """
    placeholder = re.compile(r"\{(\w+)\}")
    mismatched = [
        key for key, (uz, ru) in STRINGS.items()
        if set(placeholder.findall(uz)) != set(placeholder.findall(ru))
    ]
    assert not mismatched, f"разные подстановки в языках: {mismatched}"


def test_подстановка_работает():
    assert "1 500" in t("cart.total", "ru", sum="1 500")
    assert "1 500" in t("cart.total", "uz", sum="1 500")


def test_неизвестный_ключ_не_роняет_бота():
    # Непереведённая кнопка — беда; упавший на ней бот — беда крупнее.
    assert t("нет.такого.ключа", "ru") == "нет.такого.ключа"


def test_неизвестный_язык_сводится_к_умолчанию():
    assert normalize("de") == DEFAULT_LANG
    assert normalize(None) == DEFAULT_LANG
    assert normalize("") == DEFAULT_LANG
    # Telegram присылает и такое: «ru-RU», «uz-Latn».
    assert normalize("ru-RU") == "ru"
    assert normalize("uz-Latn") == "uz"


def test_оба_языка_объявлены():
    assert set(LANGS) == {"uz", "ru"}
    assert DEFAULT_LANG in LANGS


def test_каждый_использованный_ключ_есть_в_словаре():
    """
    `t("btn.hoem", lang)` не падает — функция вернёт сам ключ, и на кнопке
    появится «btn.hoem». Опечатка доедет до клиента и будет выглядеть как
    непереведённая кнопка, а не как ошибка.

    Разбираем исходники как AST, а не регуляркой: так `t(...)` внутри
    комментария или строки не считается вызовом.
    """
    import ast
    from pathlib import Path

    bot = Path(__file__).resolve().parent.parent
    missing = []
    for path in sorted((bot / "handlers").glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)):
                continue
            if node.func.id != "t" or not node.args:
                continue
            first = node.args[0]
            if isinstance(first, ast.Constant) and first.value not in STRINGS:
                missing.append(f"{path.name}: {first.value}")

    assert not missing, "ключи, которых нет в словаре:\n  " + "\n  ".join(missing)
