"""
Числа в документации совпадают с кодом.

ЗАЧЕМ ЭТА ПРОВЕРКА

Документы проекта оперируют точными числами: «71 модель Prisma», «107
route-файлов», «213 компонентов», «29 групп API». Они попали в CLAUDE.md,
API.md, DATABASE.md и в конституцию, и по ним ориентируются — в том числе
правило «перед созданием роута прочитай существующие группы».

К моменту ревизии разошлись ШЕСТЬ из восьми: моделей стало 78, роутов 120,
компонентов 275, shared-модулей офиса 64, строк схемы 2381 вместо 1763. В
списке групп API числился `game`, которого нет, и отсутствовал `events` —
то есть правило «сначала прочитай список» отправляло читать неправду.

Механизм сверки в проекте был, но ручной: конституция сама фиксирует две
прошлые правки этих чисел. Ручная сверка отстаёт всегда — поэтому здесь
она автоматическая.

ПОЧЕМУ ЧИСЛА ВООБЩЕ В ДОКУМЕНТАХ. Их можно было бы убрать, и тогда
проверять стало бы нечего. Но «29 групп» — это не украшение: по нему видно,
что каталог API прочитан целиком, а не «где-то рядом создали ещё один».
Число, которое обязано сходиться, — дешёвый способ заметить дрейф.

Запуск: python scripts/check_docs_numbers.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Консоль Windows по умолчанию не в UTF-8, и вывод с «✓» падает
# UnicodeEncodeError — то есть проверка «ломается» вместо того, чтобы
# сообщить результат. Тот же приём, что в apps/tgas/scripts/check_*.py.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001 — не смогли, значит вывод и так годится
    pass

ROOT = Path(__file__).resolve().parent.parent

DOCS = [
    "CLAUDE.md",
    "API.md",
    "DATABASE.md",
    ".specify/memory/constitution.md",
]


def count_models() -> int:
    schema = (ROOT / "packages/database/prisma/schema.prisma").read_text(encoding="utf-8")
    return len(re.findall(r"^model\s+\w+\s*\{", schema, re.M))


def count_schema_lines() -> int:
    schema = ROOT / "packages/database/prisma/schema.prisma"
    return len(schema.read_text(encoding="utf-8").splitlines())


def count_routes() -> int:
    return len(list((ROOT / "apps/web/src/app/api").rglob("route.ts")))


def api_groups() -> list[str]:
    base = ROOT / "apps/web/src/app/api"
    return sorted(p.name for p in base.iterdir() if p.is_dir())


def count_components() -> int:
    return len(list((ROOT / "apps/web/src/components").rglob("*.tsx")))


def count_shared_modules() -> int:
    return len(list((ROOT / "apps/tgas/shared").glob("*.py")))


def count_bots() -> int:
    base = ROOT / "apps/tgas/bots"
    return len([p for p in base.iterdir() if p.is_dir() and p.name != "__pycache__"])


def count_tools() -> int:
    total = 0
    for path in (ROOT / "apps/tgas/shared/tools").glob("*.py"):
        total += len(re.findall(r"\bTool\(", path.read_text(encoding="utf-8")))
    return total


# Что считаем и как это записано в документах. Ключ — человеческое имя,
# значение — (фактическое число, шаблон поиска в тексте).
#
# Шаблон намеренно широкий: числа пишут по-разному («71 модель», «71
# Prisma-модель», «моделей: 71»), и проверка обязана ловить их все, а не
# одну удобную формулировку.
CHECKS: list[tuple[str, int, str]] = [
    ("моделей Prisma", count_models(), r"(\d+)\s*(?:Prisma-)?модел"),
    ("строк schema.prisma", count_schema_lines(), r"schema\.prisma[^\n]*?(\d{3,5})\s*(?:строк|lines)"),
    ("route-файлов", count_routes(), r"(\d+)\s*route-файл"),
    ("компонентов", count_components(), r"(\d+)\s*компонент"),
    ("shared-модулей офиса", count_shared_modules(), r"(\d+)\s*shared-модул"),
    ("инструментов отделов", count_tools(), r"(\d+)\s*инструмент"),
]


def main() -> int:
    problems: list[str] = []
    notes: list[str] = []

    for doc in DOCS:
        path = ROOT / doc
        if not path.is_file():
            problems.append(f"{doc} — файла нет, а он в списке сверяемых")
            continue
        text = path.read_text(encoding="utf-8")

        for name, actual, pattern in CHECKS:
            for m in re.finditer(pattern, text, re.I):
                claimed = int(m.group(1))
                if claimed != actual:
                    line = text[: m.start()].count("\n") + 1
                    problems.append(
                        f"{doc}:{line} — заявлено {claimed} {name}, фактически {actual}"
                    )

    # Состав групп API: правило «сначала прочитай список» отправляет читать
    # именно его, поэтому лишняя или пропущенная группа хуже неверного числа.
    groups = set(api_groups())
    for doc in DOCS:
        path = ROOT / doc
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        m = re.search(r"Существующие группы:\s*([^.\n]+)", text)
        if not m:
            continue
        claimed = {g.strip().strip("`") for g in m.group(1).split(",") if g.strip()}
        extra = claimed - groups
        missing = groups - claimed
        if extra:
            problems.append(f"{doc} — в списке групп API есть несуществующие: {', '.join(sorted(extra))}")
        if missing:
            problems.append(f"{doc} — в списке групп API не хватает: {', '.join(sorted(missing))}")

    notes.append(f"  ok  моделей {count_models()}, роутов {count_routes()}, групп {len(groups)}")
    notes.append(f"  ok  компонентов {count_components()}, shared офиса {count_shared_modules()}")
    notes.append(f"  ok  ботов {count_bots()}, инструментов {count_tools()}")

    print("Сверка чисел в документации\n")
    for line in notes:
        print(line)

    if problems:
        print(f"\n✗ найдено ({len(problems)}):")
        for p in problems:
            print(f"  · {p}")
        print(
            "\nЧисла в документах — не украшение: по ним ориентируются при правках.\n"
            "Обновите документ или проверьте, что в коде действительно то, что нужно."
        )
        return 1

    print("\n✓ числа в документации совпадают с кодом")
    return 0


if __name__ == "__main__":
    sys.exit(main())
