"""scripts/check_tools.py — сверка инструментов отделов.

Запуск:  python scripts/check_tools.py       (из apps/tgas)

ЗАЧЕМ ЭТОТ СКРИПТ СУЩЕСТВУЕТ

Инструменты — это то, чем отдел ДЕЛАЕТ работу, а не рассказывает о ней. Пока их
не было, бот отвечал текстом: прайс сочинялся моделью, продажа не регистрировалась,
а «передать другому отделу» было полем в JSON, которое терялось по дороге.

Ошибки в этом слое так же незаметны, как и в SQL: бот запускается, отвечает, и
только по результату видно, что инструмента у него не оказалось. Скрипт ловит
четыре случая, каждый из которых означает молча неработающую цепочку:

  · у отдела из реестра ботов нет ни одного инструмента — он снова только текст;
  · два инструмента с одним именем — модель вызовет не тот, что имел в виду автор;
  · рискованный инструмент без карточки подтверждения — запись в данные пройдёт
    без ведома владельца;
  · delegate_to_department умеет отправить в отдел, у которого нет слушателя —
    задача создастся, событие улетит, исполнителя не будет (так терялся
    `operations`).

Инфраструктура не нужна: только импорт реестра, как в check_bot_roster.py.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parent.parent  # apps/tgas
sys.path.insert(0, str(ROOT))

from shared import bot_registry  # noqa: E402
from shared import tools as tool_registry  # noqa: E402
from shared.tools.common import CHIEF_FALLBACK, LISTENED_DEPARTMENTS  # noqa: E402

problems: list[str] = []
notes: list[str] = []


def check_department_coverage() -> None:
    """У каждого отдела с ботом должны быть инструменты."""
    counts = tool_registry.departments_with_tools()
    for bot in bot_registry.BOTS:
        dept = bot.department
        if not dept or dept == "pm":
            continue  # pm видит все; franchise/n8n задач не принимают
        if not counts.get(dept):
            problems.append(
                f"у отдела «{dept}» ({bot.name}) нет ни одного инструмента — "
                f"бот сможет только сгенерировать текст"
            )


def check_unique_names() -> None:
    """Имена уникальны — иначе register() бы упал, но проверим и здесь."""
    seen: dict[str, int] = {}
    for tool in tool_registry.all_tools():
        seen[tool.name] = seen.get(tool.name, 0) + 1
    for name, count in seen.items():
        if count > 1:
            problems.append(f"инструмент «{name}» объявлен {count} раза")


def check_risky_have_confirmation() -> None:
    """У рискованного инструмента должна быть внятная карточка подтверждения."""
    for tool in tool_registry.all_tools():
        if not tool.risky:
            continue
        if tool.confirm is None:
            problems.append(
                f"«{tool.name}» помечен risky, но не описывает, что произойдёт: "
                f"владелец увидит в карточке голый вызов функции"
            )


def check_delegation_targets() -> None:
    """Каждый отдел-получатель делегирования должен кем-то слушаться."""
    known = {b.department for b in bot_registry.BOTS if b.department}
    for dept in sorted(LISTENED_DEPARTMENTS):
        if dept not in known:
            problems.append(
                f"«{dept}» объявлен слушающим в shared/tools/common.py, но "
                f"такого отдела нет в bot_registry — задача уйдёт в никуда"
            )
    if CHIEF_FALLBACK not in known:
        problems.append(
            f"запасной отдел «{CHIEF_FALLBACK}» не найден в bot_registry: "
            f"задачу без исполнителя будет некому принять"
        )

    # Отделы с ботом и слушателем TASK_CREATED, но не попавшие в список.
    listens = _departments_listening_task_created()
    missed = listens - LISTENED_DEPARTMENTS - {CHIEF_FALLBACK}
    if missed:
        problems.append(
            f"отделы {', '.join(sorted(missed))} принимают TASK_CREATED, но не "
            f"объявлены в LISTENED_DEPARTMENTS — делегирование в них уйдёт "
            f"руководителю вместо исполнителя"
        )


def _departments_listening_task_created() -> set[str]:
    """Отделы, чьи боты подписаны на TASK_CREATED (по коду main.py)."""
    found: set[str] = set()
    for bot in bot_registry.BOTS:
        main = ROOT / "bots" / bot.name / "main.py"
        if not main.exists() or not bot.department:
            continue
        body = main.read_text(encoding="utf-8", errors="replace")
        if re.search(r"event_bus\.on\(\s*[\"']TASK_CREATED[\"']", body, re.I):
            found.add(bot.department)
    return found


def check_executor_wired() -> None:
    """Каждый бот с отделом должен звать execute_bot_task или иметь свой обработчик."""
    for bot in bot_registry.BOTS:
        if not bot.department or bot.name == "stepan_bot":
            continue  # у Стёпана собственный обработчик с теми же инструментами
        main = ROOT / "bots" / bot.name / "main.py"
        if not main.exists():
            continue
        body = main.read_text(encoding="utf-8", errors="replace")
        if "execute_bot_task" not in body and "handle_task_created" not in body:
            problems.append(
                f"{bot.name} не подключён ни к TaskExecutor, ни к своему "
                f"обработчику задач — делегированная задача до него не дойдёт"
            )


def check_no_prices_in_prompts() -> None:
    """В промптах не должно быть цен строкой: источник цен — get_price_list."""
    price_re = re.compile(r"\d[\d\s]{3,}\s*(сум|so'm|uzs)", re.I)
    for path in sorted((ROOT / "shared").rglob("*.py")):
        if "__pycache__" in path.as_posix():
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue
        # Докстринги пропускаем: там цены встречаются в примерах
        # (`format_price(50000) -> '50 000 сум'`), и это документация, а не промпт.
        docstrings = {
            id(node.value)
            for node in ast.walk(tree)
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)
        }
        for node in ast.walk(tree):
            if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                continue
            if id(node) in docstrings or len(node.value) < 200:
                continue  # короткие строки — не промпты
            if price_re.search(node.value):
                problems.append(
                    f"{path.relative_to(ROOT).as_posix()}:{node.lineno} — в длинной "
                    f"строке есть цена в сумах. Цены живут в каталоге; в промпте "
                    f"они устаревают молча (инструмент get_price_list)"
                )


def main() -> int:
    check_department_coverage()
    check_unique_names()
    check_risky_have_confirmation()
    check_delegation_targets()
    check_executor_wired()
    check_no_prices_in_prompts()

    all_tools = tool_registry.all_tools()
    counts = tool_registry.departments_with_tools()
    notes.append(f"  ok  инструментов всего: {len(all_tools)}")
    notes.append(f"  ok  рискованных (через подтверждение): "
                 f"{len([t for t in all_tools if t.risky])}")
    notes.append(f"  ok  отделов с инструментами: {len(counts)}")
    notes.append(f"  ok  руководитель видит: {len(tool_registry.tools_for('pm'))}")

    print("Сверка инструментов отделов\n")
    for note in notes:
        print(note)
    for dept in sorted(counts):
        print(f"      {dept:<10} {counts[dept]}")

    if problems:
        print(f"\n✗ найдено ({len(problems)}):")
        for problem in dict.fromkeys(problems):
            print(f"  · {problem}")
        return 1

    print("\n✓ у каждого отдела есть инструменты, цепочка делегирования замкнута")
    return 0


if __name__ == "__main__":
    sys.exit(main())
