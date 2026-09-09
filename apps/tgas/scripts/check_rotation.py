"""scripts/check_rotation.py — ротация контента не должна совпадать с неделей.

Запуск:  python scripts/check_rotation.py       (из apps/tgas)

ЗАЧЕМ

Утренние сторис выглядели одинаково неделя за неделей, и причина была не в
текстах, а в арифметике. Формат поста выбирался так:

    MORNING_FORMATS[tm_yday % len(MORNING_FORMATS)]

Форматов было ровно семь, и в неделе семь дней. Остаток от деления дня года
на семь МЕНЯЕТСЯ ВМЕСТЕ С ДНЁМ НЕДЕЛИ и потому от него не отличается: каждый
понедельник выпадал «факт», каждый вторник — «вопрос», круглый год. Формат
задаёт фото, макет оверлея и триггер вовлечения, то есть весь внешний вид
поста, — подписчик видел ленту с недельным повтором макета.

Остальные списки уцелели случайно: в них 11, 12, 15 и 33 элемента. Достаточно
кому-то однажды добавить или убрать пункт, чтобы длина стала кратной семи, и
однообразие вернётся — молча, без единой ошибки в логах.

ЧТО ПРОВЕРЯЕМ

1. Длина списка ротации не кратна 7. Кратность означает жёсткую привязку к
   дню недели при любой ротации по дню года.
2. Ротация по `tm_yday` без сдвига по номеру недели допустима только для
   списков, длина которых с семёркой взаимно проста.

ПОЧЕМУ ГЕЙТ, А НЕ КОММЕНТАРИЙ. Комментарий не останавливает правку: добавить
восьмой формат «чтобы было разнообразнее» и получить обратно недельный цикл
можно за одну минуту, и заметить это по ленте — только через месяц.
"""

import ast
import math
import sys
from pathlib import Path

# Консоль Windows по умолчанию cp1251: без этого «✓» в финальной строке
# валит скрипт UnicodeEncodeError — сверка проходит, а код возврата
# ненулевой. Так же поступают остальные проверки в этой папке.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "shared" / "content_plan.py"

# Списки, из которых выбирают по дню. Имя → как используется.
# Проверяем ВСЕ списки верхнего уровня: перечислять вручную значит забыть
# следующий, а он и окажется семёркой.
WEEK = 7

problems: list[str] = []
notes: list[str] = []

if not TARGET.exists():
    print(f"✗ не найден {TARGET}")
    sys.exit(1)

source = TARGET.read_text(encoding="utf-8")
tree = ast.parse(source)

lengths: dict[str, int] = {}
for node in tree.body:
    if not isinstance(node, (ast.Assign, ast.AnnAssign)):
        continue
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    value = node.value
    if not isinstance(value, (ast.List, ast.Tuple)):
        continue
    for t in targets:
        if isinstance(t, ast.Name) and t.id.isupper():
            lengths[t.id] = len(value.elts)

if not lengths:
    print("✗ в content_plan.py не нашлось ни одного списка ротации")
    sys.exit(1)

# Какие списки крутятся по дню года и какие защищены сдвигом по номеру недели.
#
# Разбираем ПО ФУНКЦИЯМ, а не регуляркой по файлу. Сдвиг обычно выносят в
# переменную строкой выше — тогда внутри скобок индекса его не видно, и
# проверка ругалась бы на исправленный код. И наоборот: сдвиг в соседней
# функции не оправдывает его отсутствие здесь, поэтому область — тело одной
# функции, а не весь модуль.
rotated: set[str] = set()
shifted: set[str] = set()
for fn in ast.walk(tree):
    if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
        continue
    body = ast.dump(fn)
    if "tm_yday" not in body:
        continue
    used = {
        n.value.id
        for n in ast.walk(fn)
        if isinstance(n, ast.Subscript) and isinstance(n.value, ast.Name) and n.value.id.isupper()
    }
    rotated |= used
    if "isocalendar" in body:
        shifted |= used

for name, size in sorted(lengths.items()):
    if size == 0:
        problems.append(f"{name} — пустой список ротации")
        continue

    # Сдвиг по номеру недели снимает вопрос длины: на фиксированном дне
    # недели индекс всё равно уезжает на единицу каждую неделю.
    if name in shifted:
        notes.append(f"  ok  {name}: {size}, со сдвигом по номеру недели")
        continue

    if size % WEEK == 0:
        problems.append(
            f"{name} — {size} элементов, кратно {WEEK}, и ротация идёт по дню года "
            f"без сдвига: выбор намертво привяжется ко дню недели"
            if name in rotated
            else f"{name} — {size} элементов, кратно {WEEK}: "
            f"ротация по дню года привяжет его ко дню недели"
        )
        continue

    if name in rotated and math.gcd(size, WEEK) != 1:
        problems.append(
            f"{name} — {size} элементов, общий делитель с {WEEK}: "
            f"часть дней недели получит один и тот же элемент"
        )
        continue

    notes.append(f"  ok  {name}: {size}")

# Отдельно: формат утреннего поста обязан сдвигаться по номеру недели.
# Даже при длине, взаимно простой с семёркой, сдвиг делает ротацию заметно
# разнообразнее, а его исчезновение — первый признак отката правки.
if "isocalendar" not in source:
    problems.append(
        "get_daily_morning_format — пропал сдвиг по номеру недели "
        "(isocalendar): формат снова закрепится за днём недели"
    )
else:
    notes.append("  ok  сдвиг по номеру недели на месте")

print("Проверка ротации контента\n")
print(f"  область: {TARGET.relative_to(ROOT)} — списков: {len(lengths)}\n")
for line in notes:
    print(line)

if problems:
    print(f"\n✗ найдено ({len(problems)}):")
    for p in problems:
        print(f"  · {p}")
    print(
        "\nДлина списка, кратная семи, превращает ежедневную ротацию в еженедельную:"
        "\nдобавьте или уберите один пункт либо сдвигайте индекс по номеру недели."
    )
    sys.exit(1)

print("\n✓ ни один список ротации не привязан ко дню недели")
