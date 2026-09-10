#!/usr/bin/env python3
"""
Каждое звено цепи «работал -> зарплата» имеет и писателя, и читателя.

ЗАЧЕМ ЭТА ПРОВЕРКА

Владелец попросил замкнуть цепь от «человек вышел на смену» до «человеку
начислено». Разбор показал, что она была разорвана в самом начале, и все
разрывы были ТИХИМИ — ни один не падал и не логировался:

  · `Employee.baseSalary` объявлен в схеме и читается расчётом зарплаты,
    но НЕ ПИСАЛСЯ НИГДЕ: поля не было ни в форме сотрудника, ни в белом
    списке правки. У всех выходил ноль, экран «Зарплата» показывал нули,
    а календарь платежей не видел крупнейшего регулярного расхода — при
    том что в коде записано обратное.
  · `crm_employees.salary` читали два бота и инструмент офиса. Писателя у
    колонки нет во всём репозитории, и владельцу дважды в месяц приходило
    уверенное «Фонд: 0 сум».
  · `Employee.birthDate` не читает и не пишет никто.

Общее у всех: поле есть, код вокруг него правильный, а цепь разомкнута.
Такое не видят ни линтер, ни типы, ни тесты — они проверяют форму, а не
то, что данные доезжают.

ПОЧЕМУ ЗАПИСЬ ОПОЗНАЁТСЯ ТАК УЗКО

Первая версия считала писателем любое упоминание имени поля в кавычках.
Проверка осталась ЗЕЛЁНОЙ, когда писателя убрали: имя нашлось в списке
строк по соседству. Сторож, который не краснеет на подсунутую ошибку, —
не сторож. Теперь записью считаются только два случая, и оба взяты из
того, как этот проект действительно пишет в базу.

ЧЕГО НЕ ПРОВЕРЯЕТ. Что записанное совпадает с прочитанным по смыслу —
это работа тестов. Здесь только «звено не висит в пустоте».
"""

import re
import sys
from pathlib import Path

# Консоль Windows по умолчанию не в UTF-8, и печать «✓» роняет сверку
# UnicodeEncodeError — то есть она краснеет там, где всё в порядке.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001 — не смогли, значит вывод и так годится
    pass

ROOT = Path(__file__).resolve().parents[3]

# Схему НЕ смотрим намеренно: объявление поля — это ни чтение, ни запись,
# и засчитав его, проверка стала бы зелёной ровно в тех случаях, ради
# которых написана.
SEARCH_DIRS = [
    ROOT / "apps" / "web" / "src",
    ROOT / "apps" / "tgas",
    ROOT / "apps" / "bot",
]
SKIP_PARTS = {"node_modules", ".next", "__pycache__", ".venv", "dist", "scripts"}
SUFFIXES = {".ts", ".tsx", ".py"}

#: поле -> зачем оно нужно (текст показывается при разрыве)
LINKS = {
    "baseSalary": "оклад: без писателя ведомость показывает нули у всех",
    "shiftRate": "ставка за смену: без писателя полевым начисляется ноль",
    "startTime": "начало смены: без писателя смена остаётся планом",
    "endTime": "конец смены: без писателя смена висит открытой вечно",
    "closedAuto": "пометка автозакрытия: её надо отличать от закрытия человеком",
    "openedVia": "откуда открыли смену: без читателя спор о времени не разобрать",
}


def writes(text: str, field: str) -> bool:
    """Пишется ли поле в этом файле.

    Записью считаются два случая:
      · поле внутри `data: { ... }` — так Prisma принимает значения;
      · поле в списке разрешённых к правке, рядом с соседом по массиву.

    Упоминание в комментарии, в типе или одиночной строкой записью НЕ
    считается.
    """
    for block in re.finditer(r"data:\s*\{", text):
        tail = text[block.end(): block.end() + 1200]
        if re.search(r"\b" + field + r"\s*:", tail):
            return True
    return bool(
        re.search(r"'" + field + r"'\s*,\s*'", text)
        or re.search(r",\s*'" + field + r"'", text)
    )


def reads(text: str, field: str) -> bool:
    """Читается ли поле: обращение через точку или разбор значения."""
    return bool(
        re.search(r"\.\s*" + field + r"\b", text)
        or re.search(r"\b" + field + r"\s*(\?\?|\)|===|!==|>|<)", text)
    )


def sources():
    for base in SEARCH_DIRS:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix not in SUFFIXES:
                continue
            if SKIP_PARTS & set(path.parts):
                continue
            yield path


def main() -> int:
    texts = []
    for path in sources():
        try:
            texts.append((path, path.read_text(encoding="utf-8")))
        except (OSError, UnicodeDecodeError):
            continue

    print("Сверка замкнутости цепи: работал -> зарплата\n")
    broken = []

    for field, why in LINKS.items():
        writers = [p for p, t in texts if writes(t, field)]
        readers = [p for p, t in texts if reads(t, field)]
        if writers and readers:
            print(f"  ok   {field:14} писателей {len(writers)}, читателей {len(readers)}")
            continue
        missing = "писателя" if not writers else "читателя"
        broken.append((field, missing, why))
        print(f"  НЕТ  {field:14} не найдено {missing}")

    if broken:
        print("\nРАЗОРВАННЫЕ ЗВЕНЬЯ:")
        for field, missing, why in broken:
            print(f"  · {field} — нет {missing}. {why}")
        print(
            "\nПоле, которое пишут и никто не читает, — работа впустую.\n"
            "Поле, которое читают и никто не пишет, — тихий ноль на экране\n"
            "и уверенно неверное число в отчёте владельцу."
        )
        return 1

    print("\n✓ цепь замкнута: у каждого звена есть писатель и читатель")
    return 0


if __name__ == "__main__":
    sys.exit(main())
