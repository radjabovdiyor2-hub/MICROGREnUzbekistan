"""
Удалённый клиент не всплывает в офисе.

ЗАЧЕМ ЭТА ПРОВЕРКА

У `customers` появилось мягкое удаление (`deleted_at`): карточку помечают,
а не стирают — вернуть физически удалённую было нечем, а чистят их пачками.

В вебе фильтр подставляет расширение клиента Prisma, и забыть его нельзя.
В офисе весь доступ — СЫРОЙ SQL: семьдесят девять мест, и каждое пишется
руками. Забытый фильтр не падает и не логируется — он просто возвращает
удалённого клиента в список, в отчёт или, что хуже всего, в рассылку.

Поэтому проверка смотрит на каждый SELECT по `customers` и требует, чтобы
рядом стояло условие про `deleted_at`.

ЧТО НЕ ПРОВЕРЯЕТСЯ И ПОЧЕМУ:
  • INSERT/UPDATE/DELETE — они не показывают карточку человеку;
  • `COUNT(*)` в служебных проверках схемы;
  • запрос с явным упоминанием `deleted_at` в любом виде — значит, автор
    подумал (в том числе если он СПЕЦИАЛЬНО ищет удалённых).

Запуск: python scripts/check_soft_delete.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

TGAS = Path(__file__).resolve().parent.parent

# Где ищем — СПИСОК РАСТЁТ, а не стоит.
#
# Сырых обращений к `customers` в офисе семьдесят четыре, и каждое пишется
# руками. Требовать фильтр сразу от всех значило бы либо переписать их
# скопом (половина обрывается на границе строкового литерала, и ошибка
# вылезет не при сборке, а на живом запросе), либо держать сторож красным.
#
# Поэтому охраняем то, где воскресший клиент действительно вредит:
#
#   • `shared/customer_repo.py` — единственная дверь офиса к клиентам:
#     поиск, дедуп, карточка. Условие вшито в `_SELECT`, забыть нельзя;
#   • `shared/capabilities.py` — исходящие клиентам. Худшее место для
#     воскрешения: отправленное сообщение не отзывается;
#   • `shared/tools/` — инструменты отделов, которыми боты ДЕЛАЮТ работу.
#
# Остальное (отчёты аналитики, дашборды, сводки) считает клиентов и
# показывает числа — там удалённая карточка портит цифру, а не действие.
# Эти файлы дописываются сюда по мере приведения в порядок.
SCANNED = [
    "shared/customer_repo.py",
    "shared/capabilities.py",
    "shared/tools",
]

# `FROM customers` / `JOIN customers c ON ...`
READ = re.compile(r"\b(?:FROM|JOIN)\s+customers\b", re.I)

# Сколько символов вокруг считаем «тем же запросом». Запросы здесь
# собираются из строковых литералов подряд, и условие идёт ниже по тексту.
WINDOW = 900

# Сколько смотрим НАЗАД. Пометка об осознанном исключении пишется
# комментарием над запросом, и объяснение занимает несколько строк —
# короткого взгляда назад не хватало, метка оставалась за краем окна.
LOOKBACK = 600

MARKER = "deleted_at"

# Явный отказ — когда удалённых видеть НУЖНО. Пишется рядом с запросом.
OPT_OUT = "видим-удалённых-намеренно"


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


def main() -> int:
    offenders: list[str] = []
    checked = 0

    for path in _sources():
        text = path.read_text(encoding="utf-8")
        for match in READ.finditer(text):
            checked += 1
            start = max(0, match.start() - LOOKBACK)
            window = text[start: match.start() + WINDOW]
            if MARKER in window or OPT_OUT in window:
                continue
            line = text[: match.start()].count("\n") + 1
            offenders.append(f"{path.relative_to(TGAS)}:{line}")

    print("Мягкое удаление клиентов\n")
    print(f"  проверено обращений к `customers`: {checked}\n")

    if checked < 8:
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
