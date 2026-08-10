"""scripts/check_imports.py — сверка имён, импортируемых из своих модулей.

Запуск:  python scripts/check_imports.py      (из apps/tgas)

ЗАЧЕМ ЭТОТ СКРИПТ СУЩЕСТВУЕТ

10.08.2026 владелец получил в чат «cannot import name 'ai_engine' from
'shared.ai_engine'». За этой строкой стоял не сбой контент-бота, а мёртвый
слой: `shared/feedback_loop.py` импортировал `ai_engine`, которого в
`shared/ai_engine.py` никогда не было — там только класс `AIEngine`. Любой
`from shared.feedback_loop import feedback_loop` падал, а это одиннадцать
ботов и исполнитель задач. Значит, за всё время существования петли обучения
не записалось ни одного замера, не сделалось ни одного вывода и ни одна
директива не дошла до промпта отдела.

Почему это не поймала ни одна из существующих сверок:

  · `ruff --select F` работает пофайлово. Неиспользуемое имя (F401) и
    необъявленное имя (F821) он находит, но НЕ проверяет, что импортируемое
    имя существует в чужом модуле — для этого нужно разрешать импорты.
  · Тесты почти везде глотают исключение (`except Exception: pass` вокруг
    вызовов обучения), поэтому зелёный прогон ничего не доказывал.
  · Импорт настоящих модулей здесь невозможен: `mg_ai` ставится только внутри
    контейнера, а половина модулей на импорте лезет в базу.

Поэтому проверка статическая: `ast` разбирает каждый файл, находит
`from <свой.модуль> import <имя>` и сверяет имя со списком того, что этот
модуль объявляет на верхнем уровне.

ЧТО СЧИТАЕТСЯ ОБЪЯВЛЕННЫМ

Функции, классы, присваивания на верхнем уровне, `import`/`from ... import`
(реэкспорт — обычная практика, см. `shared/utils.py` внизу файла) и всё
перечисленное в `__all__`. Модуль-пакет (`shared.tools`) отдаёт ещё и имена
своих подмодулей: `from shared.tools import common` — законный импорт.

ЧЕГО ПРОВЕРКА НЕ ВИДИТ

Имена, которые модуль создаёт динамически (`globals()[...] = ...`) и
условные объявления внутри `if`/`try` на верхнем уровне — последние
засчитываются, потому что синтаксически это те же присваивания.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path
from typing import Dict, Set

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parent.parent  # apps/tgas

# Пакеты, которые принадлежат нам и лежат рядом. Чужие (aiogram, sqlalchemy)
# не проверяем: их устанавливает pip, и разбирать их исходники здесь незачем.
OWN_PACKAGES = ("shared", "bots", "web_office", "scripts")

SKIP_DIRS = {"__pycache__", "venv", ".venv", "node_modules", ".git", "bus_tasks"}

problems: list[str] = []
_exports_cache: Dict[str, Set[str] | None] = {}


def _iter_sources():
    for path in sorted(ROOT.rglob("*.py")):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        yield path


def _module_path(module: str) -> Path | None:
    """Файл модуля `a.b.c` — либо `a/b/c.py`, либо `a/b/c/__init__.py`."""
    rel = Path(*module.split("."))
    for candidate in (ROOT / rel.with_suffix(".py"), ROOT / rel / "__init__.py"):
        if candidate.is_file():
            return candidate
    return None


def _exports(module: str) -> Set[str] | None:
    """Имена, доступные через `from module import ...`. None — модуля нет."""
    if module in _exports_cache:
        return _exports_cache[module]

    path = _module_path(module)
    if path is None:
        _exports_cache[module] = None
        return None

    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except (OSError, SyntaxError) as exc:
        problems.append(f"{module}: не разбирается — {exc}")
        _exports_cache[module] = set()
        return set()

    names: Set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.add(target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.asname or alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                names.add(alias.asname or alias.name)
        elif isinstance(node, (ast.If, ast.Try)):
            # Условные объявления на верхнем уровне: `try: import X except: X = None`.
            for inner in ast.walk(node):
                if isinstance(inner, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    names.add(inner.name)
                elif isinstance(inner, ast.Assign):
                    for target in inner.targets:
                        if isinstance(target, ast.Name):
                            names.add(target.id)
                elif isinstance(inner, ast.Import):
                    for alias in inner.names:
                        names.add(alias.asname or alias.name.split(".")[0])
                elif isinstance(inner, ast.ImportFrom):
                    for alias in inner.names:
                        names.add(alias.asname or alias.name)

    # `__all__` — обещание модуля; если имя там есть, считаем объявленным.
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "__all__" for t in node.targets
        ):
            if isinstance(node.value, (ast.List, ast.Tuple)):
                for item in node.value.elts:
                    if isinstance(item, ast.Constant) and isinstance(item.value, str):
                        names.add(item.value)

    # Пакет отдаёт имена своих подмодулей: `from shared.tools import common`.
    if path.name == "__init__.py":
        for sibling in path.parent.iterdir():
            if sibling.suffix == ".py" and sibling.stem != "__init__":
                names.add(sibling.stem)
            elif sibling.is_dir() and (sibling / "__init__.py").is_file():
                names.add(sibling.name)

    _exports_cache[module] = names
    return names


def check_from_imports() -> None:
    """`from свой.модуль import имя` — имя обязано в этом модуле существовать."""
    checked = 0
    for path in _iter_sources():
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (OSError, SyntaxError):
            continue  # синтаксис — забота ruff и py_compile

        rel = path.relative_to(ROOT).as_posix()
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom):
                continue
            # Относительные импорты (level > 0) не разрешаем: в этом проекте
            # их единицы, а правило «модуль пишется полным путём» и так есть.
            if node.level or not node.module:
                continue
            if node.module.split(".")[0] not in OWN_PACKAGES:
                continue

            exports = _exports(node.module)
            if exports is None:
                problems.append(
                    f"{rel}:{node.lineno} — модуля «{node.module}» не существует"
                )
                continue

            for alias in node.names:
                if alias.name == "*":
                    continue
                checked += 1
                if alias.name not in exports:
                    problems.append(
                        f"{rel}:{node.lineno} — «{node.module}» не объявляет "
                        f"«{alias.name}» (импорт упадёт при первом же вызове)"
                    )

    print(f"  ok  проверено импортируемых имён: {checked}")


def main() -> int:
    print("Сверка импортов между своими модулями\n")
    check_from_imports()
    print(f"  ok  модулей в кэше: {len(_exports_cache)}")

    if problems:
        print(f"\n✗ найдено ({len(problems)}):")
        for problem in dict.fromkeys(problems):
            print(f"  · {problem}")
        return 1

    print("\n✓ все импортируемые имена существуют")
    return 0


if __name__ == "__main__":
    sys.exit(main())
