"""scripts/check_bridge.py — адрес витрины, который зовёт Python, существует.

Запуск:  python scripts/check_bridge.py       (из apps/tgas)

ЗАЧЕМ

Витринный бот месяцами слал `POST /api/sms` и получал 404: группы с таким
именем не было и не было никогда. Ошибка не падает и не пишется в логи —
вызов просто не делает ничего, а функция считается работающей. Тот же
случай, что с `check_imports`: чтением кода это не проверить, потому что
обе стороны компилируются по отдельности.

ЧТО ПРОВЕРЯЕМ

Каждый адрес `apps/web/api/...`, который строит Python, имеет
соответствующий `route.ts`. Динамический сегмент `{id}` сходится с
каталогом `[id]`. Рядом печатаются методы, которые роут экспортирует, —
вызов несуществующего метода виден глазом.

ПОЧЕМУ ШАБЛОНОВ НЕСКОЛЬКО. Адреса строятся четырьмя способами, и обёртка
`_call(метод, путь)` из `production_repo` сначала выпала из разбора:
сверка молча пропускала пять адресов и была зелёной впустую. Добавляете
новый способ звать витрину — добавьте сюда шаблон, иначе проверка соврёт.
"""

import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
PY_DIRS = [ROOT / "apps" / "tgas", ROOT / "apps" / "bot"]
API_DIR = ROOT / "apps" / "web" / "src" / "app" / "api"

PATH = r"(/[A-Za-z0-9/_{}.\-]*)"

PATTERNS = [
    # f-строка с базовым URL: f"{STOREFRONT_API_URL.rstrip('/')}/products"
    re.compile(r"STOREFRONT_API_URL\.rstrip\([^)]*\)\}" + PATH),
    re.compile(r"STOREFRONT_URL\}" + PATH),
    # Помощник _url("/path")
    re.compile(r"_url\(\s*f?[\"']" + PATH),
    # Обёртка _call("GET", "/path") — так ходит production_repo. Без этого
    # шаблона сверка молча пропускала пять адресов и была зелёной впустую.
    re.compile(r"_call\(\s*[\"'][A-Z]+[\"']\s*,\s*f?[\"']" + PATH, re.S),
]


def collect_calls():
    found = {}
    for directory in PY_DIRS:
        if not directory.exists():
            continue
        for file in directory.rglob("*.py"):
            if "__pycache__" in file.parts:
                continue
            # Сам себя не разбираем: в докстринге выше есть примеры адресов,
            # и сверка честно не находила бы `/api/path`.
            if file.name == Path(__file__).name:
                continue
            text = file.read_text(encoding="utf-8", errors="replace")
            for pattern in PATTERNS:
                for match in pattern.finditer(text):
                    path = match.group(1).rstrip("/")
                    if path and path != "/":
                        found.setdefault(path, set()).add(file.name)
    return found


def route_exists(path):
    """Есть ли route.ts под этим адресом. Динамический сегмент — [id]."""
    node = API_DIR
    for part in [p for p in path.strip("/").split("/") if p]:
        if "{" in part:
            dyn = [d for d in node.iterdir() if d.is_dir() and d.name.startswith("[")]
            if not dyn:
                return False
            node = dyn[0]
            continue
        nxt = node / part
        if nxt.is_dir():
            node = nxt
            continue
        dyn = [d for d in node.iterdir() if d.is_dir() and d.name.startswith("[")]
        if not dyn:
            return False
        node = dyn[0]
    return (node / "route.ts").exists()


def methods_of(path):
    """Какие методы экспортирует роут — чтобы поймать вызов несуществующего."""
    node = API_DIR
    for part in [p for p in path.strip("/").split("/") if p]:
        cand = node / part
        if cand.is_dir():
            node = cand
            continue
        dyn = [d for d in node.iterdir() if d.is_dir() and d.name.startswith("[")]
        if not dyn:
            return set()
        node = dyn[0]
    file = node / "route.ts"
    if not file.exists():
        return set()
    text = file.read_text(encoding="utf-8", errors="replace")
    return set(re.findall(r"export async function ([A-Z]+)", text))


def main():
    calls = collect_calls()
    print("адресов витрины в Python: %d\n" % len(calls))

    missing = []
    for path in sorted(calls):
        ok = route_exists(path)
        mark = "ok " if ok else "НЕТ"
        verbs = ",".join(sorted(methods_of(path))) if ok else "-"
        print("  %s  /api%-34s [%s]  <- %s" % (mark, path, verbs, ", ".join(sorted(calls[path]))))
        if not ok:
            missing.append(path)

    if missing:
        print("\nНЕ НАЙДЕНЫ РОУТЫ:")
        for path in missing:
            print("  /api" + path)
        return 1

    print("\nвсе адреса существуют")
    return 0


if __name__ == "__main__":
    sys.exit(main())
