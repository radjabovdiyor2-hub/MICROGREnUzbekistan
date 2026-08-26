"""
Касание клиента не бывает ничьим и не бывает чужим.

ЧТО БЫЛО

Заявки, жалобы и B2B-лиды писались в `interactions` так:

    VALUES ((SELECT id FROM customers WHERE telegram_id = :tid), ...)

и у этого две тихие развязки. Человек пишет ВПЕРВЫЕ — подзапрос отдаёт
NULL, и обращение остаётся без владельца: в карточке клиента его нет, в
ленте офиса имя пустое, работать по нему некому. Карточку ВЫЧИСТИЛИ
(мягкое удаление) — подзапрос отдаёт её id, и обращение уезжает в
невидимую карточку, что ещё хуже: строка есть, а показать её нельзя.

В HR было третье, самое дорогое:

    VALUES (COALESCE((SELECT id FROM customers WHERE telegram_id = :tid), 1), ...)

Заявка соискателя и заявление на отпуск приклеивались к клиенту с id=1,
кем бы тот ни оказался. Живая карточка чужого заведения копила чужие
кадровые документы, и заметить это можно было только глазами.

КАК ПРАВИЛЬНО

  • владелец есть → взять его через `customer_repo.upsert` — единственного
    писателя `customers`: он заводит новую карточку и воскрешает удалённую;
  • владельца нет по смыслу (соискатель — не клиент) → честный NULL,
    колонка `customer_id` для этого и nullable.

Проверка статическая: смотрит исходники, инфраструктура не нужна.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

TGAS = Path(__file__).resolve().parent.parent

WHERE = ("shared", "bots", "web_office")

INSERT = re.compile(r"INSERT\s+INTO\s+interactions\b", re.I)

# `(SELECT id FROM customers ...)` внутри INSERT — та самая подстановка.
SUBQUERY = re.compile(r"SELECT\s+id\s+FROM\s+customers\b", re.I)

# `COALESCE(..., 1)` — «не нашли, запишем на первого попавшегося».
FALLBACK = re.compile(r"COALESCE\s*\(\s*\(\s*SELECT[^)]*customers[^)]*\)\s*,\s*\d+", re.I)


def _sources() -> list[Path]:
    out: list[Path] = []
    for entry in WHERE:
        out.extend(
            p for p in (TGAS / entry).rglob("*.py") if "__pycache__" not in p.parts
        )
    assert out, "обход исходников сорвался — проверка ничего не значит"
    return out


def _sql_chunks(path: Path) -> list[tuple[str, int]]:
    """Собранные строковые выражения файла: (текст, строка)."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out: list[tuple[str, int]] = []
    taken: set[int] = set()

    def flatten(node: ast.AST) -> str | None:
        if isinstance(node, ast.Constant):
            return node.value if isinstance(node.value, str) else None
        if isinstance(node, ast.JoinedStr):
            return "".join(flatten(v) or "?" for v in node.values)
        if isinstance(node, ast.FormattedValue):
            return flatten(node.value)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            left, right = flatten(node.left), flatten(node.right)
            if left is None and right is None:
                return None
            return (left or "") + (right or "")
        return None

    for node in ast.walk(tree):
        if id(node) in taken:
            continue
        text = flatten(node)
        if text is None:
            continue
        out.append((text, node.lineno))
        for inner in ast.walk(node):
            taken.add(id(inner))
    return out


def _offending(pattern: re.Pattern[str]) -> list[str]:
    found: list[str] = []
    for path in _sources():
        for text, line in _sql_chunks(path):
            if INSERT.search(text) and pattern.search(text):
                found.append(f"{path.relative_to(TGAS)}:{line}")
    return found


def test_interaction_owner_is_resolved_not_guessed_by_subquery():
    """Владельца касания берут у `customer_repo`, а не подзапросом в INSERT."""
    offenders = _offending(SUBQUERY)
    assert not offenders, (
        "INSERT в `interactions` достаёт владельца подзапросом по `customers`: "
        + ", ".join(offenders)
        + ". Незнакомый человек даст NULL, вычищенная карточка — невидимого "
        "владельца. Возьмите id через `customer_repo.upsert` (он же воскресит "
        "удалённую карточку) либо запишите NULL, если владельца нет по смыслу."
    )


def test_interaction_never_falls_back_to_a_random_customer():
    """`COALESCE(..., 1)` приклеивает чужие документы к живой карточке."""
    offenders = _offending(FALLBACK)
    assert not offenders, (
        "INSERT в `interactions` подставляет чужой id при ненайденном клиенте: "
        + ", ".join(offenders)
        + ". Так кадровые заявки оседали на клиенте с id=1. Владельца нет — "
        "пишите NULL, колонка nullable именно для этого."
    )
