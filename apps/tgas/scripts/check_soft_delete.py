"""
Удалённый клиент не всплывает в офисе.

ЗАЧЕМ ЭТА ПРОВЕРКА

У `customers` появилось мягкое удаление (`deleted_at`): карточку помечают,
а не стирают — вернуть физически удалённую было нечем, а чистят их пачками.

В вебе фильтр подставляет расширение клиента Prisma, и забыть его нельзя.
В офисе весь доступ — СЫРОЙ SQL: семьдесят мест, и каждое пишется руками.
Забытый фильтр не падает и не логируется — он просто возвращает удалённого
клиента в список, в отчёт или, что хуже всего, в рассылку.

ПОЧЕМУ РАЗБОР СИНТАКСИСА, А НЕ ОКНО ВОКРУГ СТРОКИ

Первая версия искала `deleted_at` в 900 символах вокруг `FROM customers`.
Проверка была зелёной — и оставалась зелёной, когда фильтр убирали из
рассылки маркетинга и из отчёта аналитики: в окно попадало условие
СОСЕДНЕГО запроса, а в этих файлах запросы идут подряд. Сторож, который
не краснеет на подсунутую ошибку, не сторож.

Теперь запрос собирается так же, как его собирает Python: соседние
литералы, `+`, f-строки и ссылки на строковые константы модуля сводятся в
один текст. Условие требуется В ЭТОМ ЖЕ тексте — соседний запрос помочь
уже не может.

ЧТО НЕ ПРОВЕРЯЕТСЯ И ПОЧЕМУ:
  • INSERT/UPDATE/DELETE — они не показывают карточку человеку;
  • строковая константа-обломок (`_FROM = "FROM customers c "`), которую
    собирают в запрос ниже: проверяется собранный запрос, а не обломок;
  • запрос с явным упоминанием `deleted_at` в любом виде — значит, автор
    подумал (в том числе если он СПЕЦИАЛЬНО ищет удалённых).

Запуск: python scripts/check_soft_delete.py
"""

from __future__ import annotations

import ast
import io
import re
import sys
import tokenize
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

TGAS = Path(__file__).resolve().parent.parent

# Где ищем — ВЕСЬ офис.
#
# Сначала под охраной были три пути: единственная дверь к клиентам, канал
# исходящих и инструменты отделов — то, где воскресшая карточка не портит
# цифру, а совершает действие. Остальные семьдесят сырых обращений
# приводились в порядок по одному, и список рос вместе с ними.
#
# Теперь он покрывает `shared`, `bots` и `web_office` целиком: каждое
# чтение `customers` в офисе либо фильтрует удалённых, либо несёт рядом
# пометку с причиной, почему видит их намеренно (дедуп ночного сбора,
# дебиторка, имя у состоявшегося заказа). Новый запрос без того и другого
# краснеет сразу, а не через месяц в рассылке.
SCANNED = [
    "shared",
    "bots",
    "web_office",
]

# `FROM customers` / `JOIN customers c ON ...`
READ = re.compile(r"\b(?:FROM|JOIN)\s+customers\b", re.I)

MARKER = "deleted_at"

# Явный отказ — когда удалённых видеть НУЖНО. Пишется рядом с запросом.
OPT_OUT = "видим-удалённых-намеренно"

# Насколько выше запроса разрешено стоять пометке. Объяснение занимает
# несколько строк, а пишут его над оператором, а не внутри SQL.
LOOKBACK_LINES = 8

# Сколько раз подставляем строковые константы модуля друг в друга.
# `_SELECT` собран из `_FROM` и `_ALIVE` — одного прохода мало.
FOLD_PASSES = 3


def _sources() -> list[Path]:
    out: list[Path] = []
    for entry in SCANNED:
        target = TGAS / entry
        if target.is_dir():
            out.extend(p for p in target.rglob("*.py") if "__pycache__" not in p.parts)
        elif target.is_file():
            out.append(target)
        else:
            # Путь из списка исчез — молча проверять меньше нельзя.
            raise SystemExit(f"✗ в списке охраняемых путей нет файла: {entry}")
    return out


def _flatten(node: ast.AST, consts: dict[str, str]) -> str | None:
    """
    Собрать строковое выражение так, как его собирает Python.

    Возвращает `None`, если это не строка. Нестроковую подстановку в
    f-строке заменяем на `?`: для нас важен каркас SQL, а не значение.
    """
    if isinstance(node, ast.Constant):
        return node.value if isinstance(node.value, str) else None

    if isinstance(node, ast.Name):
        return consts.get(node.id)

    if isinstance(node, ast.JoinedStr):
        parts = []
        for value in node.values:
            piece = _flatten(value, consts)
            parts.append(piece if piece is not None else "?")
        return "".join(parts)

    if isinstance(node, ast.FormattedValue):
        return _flatten(node.value, consts)

    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = _flatten(node.left, consts)
        right = _flatten(node.right, consts)
        if left is None and right is None:
            return None
        return (left or "") + (right or "")

    return None


def _module_consts(tree: ast.Module) -> dict[str, str]:
    """Строковые константы уровня модуля — из них собирают запросы."""
    consts: dict[str, str] = {}
    for _ in range(FOLD_PASSES):
        for stmt in tree.body:
            if not isinstance(stmt, ast.Assign) or len(stmt.targets) != 1:
                continue
            target = stmt.targets[0]
            if not isinstance(target, ast.Name):
                continue
            text = _flatten(stmt.value, consts)
            if text is not None:
                consts[target.id] = text
    return consts


def _comment_lines(source: str) -> dict[int, str]:
    """Номер строки → текст комментария. Пометка живёт в комментарии."""
    out: dict[int, str] = {}
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            if token.type == tokenize.COMMENT:
                out[token.start[0]] = token.string
    except (tokenize.TokenError, IndentationError, SyntaxError):
        # Файл не разбирается — об этом скажет ast, не глотаем молча.
        pass
    return out


def _referenced(tree: ast.Module) -> set[str]:
    """Имена, которые где-то читают: обломок запроса — тот, что читают."""
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}


def _chunks(tree: ast.Module, consts: dict[str, str]) -> list[tuple[str, int, int]]:
    """
    Все собранные строковые выражения файла: (текст, первая строка, последняя).

    Вложенные выражения пропускаем: если `"a" + "b"` уже собрано целиком,
    отдельные `"a"` и `"b"` считать не нужно — иначе один запрос обвинят
    дважды, а половинка обломка окажется без условия.
    """
    out: list[tuple[str, int, int]] = []
    taken: set[int] = set()

    for node in ast.walk(tree):
        if id(node) in taken:
            continue
        if not isinstance(node, (ast.Constant, ast.JoinedStr, ast.BinOp, ast.Name)):
            continue
        text = _flatten(node, consts)
        if text is None:
            continue
        out.append((text, node.lineno, getattr(node, "end_lineno", node.lineno)))
        for inner in ast.walk(node):
            taken.add(id(inner))

    return out


def _is_fragment(line: int, tree: ast.Module, used: set[str]) -> bool:
    """Обломок — константа модуля, которую собирают в запрос ниже."""
    for stmt in tree.body:
        if not isinstance(stmt, ast.Assign) or stmt.lineno != line:
            continue
        target = stmt.targets[0] if len(stmt.targets) == 1 else None
        if isinstance(target, ast.Name) and target.id in used:
            return True
    return False


def _check(path: Path) -> tuple[int, list[str]]:
    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return 0, [f"{path.relative_to(TGAS)}: не разбирается ({exc.msg})"]

    consts = _module_consts(tree)
    comments = _comment_lines(source)
    used = _referenced(tree)

    checked = 0
    offenders: list[str] = []

    for text, start, end in _chunks(tree, consts):
        if not READ.search(text):
            continue
        if _is_fragment(start, tree, used):
            continue
        checked += 1
        if MARKER in text:
            continue
        window = range(max(1, start - LOOKBACK_LINES), end + 1)
        if any(OPT_OUT in comments.get(n, "") for n in window):
            continue
        offenders.append(f"{path.relative_to(TGAS)}:{start}")

    return checked, offenders


def main() -> int:
    offenders: list[str] = []
    checked = 0

    for path in _sources():
        found, bad = _check(path)
        checked += found
        offenders.extend(bad)

    print("Мягкое удаление клиентов\n")
    print(f"  проверено запросов к `customers`: {checked}\n")

    if checked < 40:
        print("✗ обход исходников сорвался — проверка ничего не значит")
        return 1

    if offenders:
        print(f"✗ найдено ({len(offenders)}):")
        for o in offenders:
            print(f"  · {o}")
        print(
            "\nЭто чтение `customers` без условия про `deleted_at`. Удалённая\n"
            "карточка вернётся в список, отчёт или рассылку — молча.\n"
            "Добавьте `AND c.deleted_at IS NULL` либо пометку "
            f"«{OPT_OUT}» с причиной."
        )
        return 1

    print("✓ удалённые клиенты не читаются нигде")
    return 0


if __name__ == "__main__":
    sys.exit(main())
