"""
Механизм подтверждения в Telegram — один.

ЗАЧЕМ ЭТОТ ТЕСТ

Их было три, и все делали одно и то же по-разному: заявки инструментов,
`_PENDING` в assistant.py и `PENDING_EXEC` в team_meeting.py. Два из трёх
держали заявки в словаре процесса и теряли их при рестарте — владелец
нажимал кнопку и получал «устарело», а намерение исчезало молча.

Свели к `shared/approvals.py`, и это записано в шапке модуля как правило.
Но правило держалось только на памяти: четвёртая копия завелась в
`content_bot/handlers/autopost.py` и прожила незамеченной — тот же
словарь, та же потеря при выкатке, только теряется ещё и картинка,
сгенерированная платным вызовом модели.

Проверяется не «нет словарей», а конкретное: НИКТО, кроме самого
`approvals`, не рисует кнопки подтверждения со своим `callback_data` и не
ловит их своим обработчиком.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

TGAS = Path(__file__).resolve().parent.parent

#: Единственный владелец подтверждений.
OWNER = TGAS / "shared" / "approvals.py"

#: Префиксы, которые ставит сам `approvals`. Всё остальное — своя копия.
OWN_PREFIXES = ("approve:", "reject:")

#: Слова, по которым кнопка опознаётся как подтверждающая.
CONFIRM_WORDS = re.compile(
    r"одобри|подтверд|опубликовать в|выполнить|запустить план", re.I
)


def _sources() -> list[Path]:
    out: list[Path] = []
    for entry in ("shared", "bots", "web_office"):
        out.extend(
            p
            for p in (TGAS / entry).rglob("*.py")
            if "__pycache__" not in p.parts and p != OWNER
        )
    assert out, "обход исходников сорвался — проверка ничего не значит"
    return out


def _button_texts_with_callback(path: Path) -> list[tuple[int, str]]:
    """Кнопки, у которых есть и текст, и свой `callback_data`."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []

    found: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
        if name != "InlineKeyboardButton":
            continue

        text = ""
        has_own_callback = False
        for kw in node.keywords:
            if kw.arg == "text" and isinstance(kw.value, ast.Constant):
                text = str(kw.value.value)
            if kw.arg == "callback_data":
                value = kw.value
                literal = ""
                if isinstance(value, ast.Constant):
                    literal = str(value.value)
                elif isinstance(value, ast.JoinedStr):
                    literal = "".join(
                        c.value
                        for c in value.values
                        if isinstance(c, ast.Constant) and isinstance(c.value, str)
                    )
                if literal and not literal.startswith(OWN_PREFIXES):
                    has_own_callback = True

        if text and has_own_callback:
            found.append((node.lineno, text))
    return found


def test_no_second_confirmation_mechanism() -> None:
    offenders: list[str] = []

    for path in _sources():
        for line, text in _button_texts_with_callback(path):
            if CONFIRM_WORDS.search(text):
                offenders.append(f"{path.relative_to(TGAS)}:{line} — «{text}»")

    assert not offenders, (
        "кнопка подтверждения со СВОИМ callback_data:\n  "
        + "\n  ".join(offenders)
        + "\n\nМеханизм подтверждения в проекте один — `shared/approvals.py`. "
        "Своя копия держит заявку в памяти процесса и теряет её при выкатке: "
        "владелец нажимает кнопку и получает «устарело». Заведите свой тип "
        "через `approvals.register_handler(kind, fn)`."
    )


def test_approvals_is_still_the_owner() -> None:
    """У единственного механизма на месте и хранилище, и обе кнопки."""
    body = OWNER.read_text(encoding="utf-8")

    # По ГРАНИЦЕ СЛОВА, а не подстрокой: подстрока «owner_approvals»
    # нашлась бы и в «owner_approvals_x», то есть переименование таблицы
    # прошло бы мимо проверки. Так и вышло при первой подставе.
    assert re.search(r"\bowner_approvals\b", body), (
        "заявки перестали храниться в таблице `owner_approvals` — значит, "
        "снова живут в памяти процесса и теряются при выкатке"
    )
    for prefix in OWN_PREFIXES:
        assert prefix in body, f"пропал префикс кнопки «{prefix}»"
    assert "register_handler" in body, "исчез способ завести свой тип заявки"
