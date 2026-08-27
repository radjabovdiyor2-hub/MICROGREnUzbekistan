"""
Несостоявшаяся запись не молчит.

ЗАЧЕМ ЭТОТ ТЕСТ

Боты подняты с `logging.basicConfig(level=logging.INFO)`. Значит
`logger.debug(...)` в лог НЕ ПОПАДАЕТ — это не «тихий доклад», это
молчание, только выглядящее как доклад.

Семь мест писали в базу и сообщали о неудаче именно так. Самое дорогое —
учёт расхода на модель: расход виден владельцу только по таблице
`ai_usage`, и по ней же считается дневной и месячный бюджет. Не записали
расход — ограничитель не сработает никогда, потому что потрачено «ноль».
Рядом: незарегистрированная задача расписания (в админке её просто нет),
незаписанный факт запуска (задача выглядит ни разу не запускавшейся, то
есть сломанной) и потерянный замер самообучения.

ЧТО ИМЕННО ПРОВЕРЯЕТСЯ

`try`, внутри которого есть INSERT / UPDATE / DELETE или `commit()`, не
может иметь обработчик, который сообщает о неудаче ТОЛЬКО через `debug`.
Годится любое из: `warning`, `error`, `exception`, `critical`, `raise`
или возврат признака неудачи вызывающему.

Тест статический: смотрит исходники, база не нужна.
"""

from __future__ import annotations

import ast
from pathlib import Path

TGAS = Path(__file__).resolve().parent.parent

WHERE = ("shared", "bots", "web_office")

#: Что считается записью в базу.
WRITE_SQL = ("INSERT ", "UPDATE ", "DELETE FROM")

#: Уровни, которые при `level=INFO` реально попадают в лог.
LOUD = {"warning", "error", "exception", "critical"}


def _sources() -> list[Path]:
    out: list[Path] = []
    for entry in WHERE:
        out.extend(
            p for p in (TGAS / entry).rglob("*.py") if "__pycache__" not in p.parts
        )
    assert out, "обход исходников сорвался — проверка ничего не значит"
    return out


def _is_write(body: list[ast.stmt]) -> bool:
    module = ast.Module(body=body, type_ignores=[])
    for node in ast.walk(module):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            upper = node.value.upper()
            if any(sql in upper for sql in WRITE_SQL):
                return True
        if isinstance(node, ast.Attribute) and node.attr == "commit":
            return True
    return False


def _reports(handler: ast.ExceptHandler) -> bool:
    """Сообщает ли обработчик о неудаче так, чтобы это было видно."""
    for stmt in handler.body:
        for node in ast.walk(stmt):
            if isinstance(node, ast.Raise):
                return True
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in LOUD
            ):
                return True
            # Возврат признака неудачи вызывающему — тоже доклад: инструмент
            # отдаёт `{"status": "error"}`, и модель это видит.
            if isinstance(node, ast.Return) and node.value is not None:
                return True
    return False


def test_failed_write_is_never_reported_only_by_debug() -> None:
    offenders: list[str] = []

    for path in _sources():
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Try) or not _is_write(node.body):
                continue
            for handler in node.handlers:
                if not _reports(handler):
                    offenders.append(
                        f"{path.relative_to(TGAS)}:{handler.lineno}"
                    )

    assert not offenders, (
        "запись в базу может не состояться, и об этом никто не узнает:\n  "
        + "\n  ".join(offenders)
        + "\n\nБоты подняты с level=INFO — `logger.debug` в лог не попадает. "
        "Возьмите `warning`/`error`, поднимите исключение или верните "
        "вызывающему признак неудачи."
    )
