"""scripts/check_schema.py — сверка SQL ботов со схемой базы.

Запуск:  python scripts/check_schema.py       (из apps/tgas)

ЗАЧЕМ ЭТОТ СКРИПТ СУЩЕСТВУЕТ

Боты работают сырыми запросами (`sqlalchemy.text(...)`), поэтому обращение к
несуществующей таблице или колонке не всплывает ни при импорте, ни при линтинге —
только в рантайме, где почти везде стоит `except Exception` и ошибка уходит в лог.
Аудит 31.07.2026 нашёл три таких случая, и ни один не был заметен при чтении кода:

  · franchise_bot считал сводку филиалов как
    `SELECT COUNT(id), SUM(total) FROM orders WHERE city = :city`,
    хотя в `orders` НЕТ ни `city`, ни `total` (город у клиента, сумма —
    `total_amount`). Запрос падал на каждом городе, единственная задача бота
    не отработала ни разу.
  · `franchise_journals` не создавалась ничем: в `init.sql` её не было, а сам
    init.sql применяется ТОЛЬКО при первой инициализации тома Postgres.
  · `restaurants` — таблица витрины (Prisma), её нет в схеме ботов вовсе.
    База при этом одна: все сервисы в docker-compose.prod.yml смотрят в
    microgreen, поэтому такие таблицы читаются обычной сессией.

Скрипт ловит повторение каждого случая. Инфраструктура не нужна — только чтение
файлов, как в check_bot_roster.py и check_prompts.py.

ЧЕГО СКРИПТ НЕ ДЕЛАЕТ
Он не полноценный разборщик SQL. Колонки проверяются только у запросов к одной
таблице без JOIN — там разбор однозначен. Запросы с JOIN проверяются лишь на
существование таблиц: сопоставить колонку с нужной таблицей без схемы алиасов
нельзя, а гадать хуже, чем молчать.
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

ROOT = Path(__file__).resolve().parent.parent          # apps/tgas
REPO = ROOT.parent.parent                              # корень репозитория

problems: list[str] = []
notes: list[str] = []


# ── 1. Схема ботов из database/init.sql ─────────────────────────────────
def load_init_sql() -> dict[str, set[str]]:
    sql = (ROOT / "database" / "init.sql").read_text(encoding="utf-8")
    tables: dict[str, set[str]] = {}
    for m in re.finditer(r"CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\n\);", sql, re.S):
        name, body = m.group(1), m.group(2)
        cols = set()
        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith("--"):
                continue
            # пропускаем табличные ограничения: они начинаются с ключевого слова
            if re.match(r"(?i)(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b", line):
                continue
            cm = re.match(r"(\w+)\s+\w", line)
            if cm:
                cols.add(cm.group(1).lower())
        tables[name.lower()] = cols
    return tables


# ── 2. Таблицы витрины из schema.prisma ─────────────────────────────────
def load_prisma_tables() -> set[str]:
    path = REPO / "packages" / "database" / "prisma" / "schema.prisma"
    if not path.exists():
        return set()
    text_ = path.read_text(encoding="utf-8")
    names: set[str] = set()
    for m in re.finditer(r"@@map\(\"(\w+)\"\)", text_):
        names.add(m.group(1).lower())
    # модели без @@map: Prisma кладёт их в таблицу с именем модели
    for m in re.finditer(r"^model\s+(\w+)\s*\{", text_, re.M):
        names.add(m.group(1).lower())
    return names


# ── 3. Таблицы, которые код создаёт сам в рантайме ──────────────────────
def load_runtime_tables() -> set[str]:
    names: set[str] = set()
    for path in sorted(ROOT.rglob("*.py")):
        if "__pycache__" in path.as_posix():
            continue
        body = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"CREATE TABLE IF NOT EXISTS\s+(\w+)", body, re.I):
            names.add(m.group(1).lower())
    return names


# ── 4. Все SQL-строки ботов ─────────────────────────────────────────────
def collect_sql() -> list[tuple[str, int, str]]:
    """[(файл, строка, sql)] из вызовов text("...")."""
    found: list[tuple[str, int, str]] = []
    for path in sorted(ROOT.rglob("*.py")):
        rel = path.as_posix()
        if "__pycache__" in rel or "/scripts/check_" in rel:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            fn = node.func
            name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
            if name != "text" or not node.args:
                continue
            arg = node.args[0]
            # ast сам склеивает соседние литералы — то, ради чего он здесь
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                found.append((path.relative_to(ROOT).as_posix(), node.lineno, arg.value))
    return found


SQL_WORDS = {
    "select", "from", "where", "and", "or", "not", "in", "is", "null", "as", "on",
    "join", "left", "right", "inner", "outer", "full", "group", "by", "order",
    "having", "limit", "offset", "insert", "into", "values", "update", "set",
    "delete", "create", "table", "if", "exists", "primary", "key", "foreign",
    "references", "default", "distinct", "case", "when", "then", "else", "end",
    "asc", "desc", "union", "all", "with", "returning", "conflict", "do",
    "nothing", "cast", "interval", "true", "false", "between", "like", "ilike",
    "text", "integer", "serial", "boolean", "timestamp", "date", "numeric",
    "jsonb", "json", "varchar", "decimal", "at", "time", "zone", "constraint",
    "unique", "check", "using", "temp", "any", "some", "over", "partition",
    "nulls", "first", "last", "add", "column", "alter", "drop", "index",
}

# Значения без скобок, которые выглядят как идентификатор, но им не являются.
SQL_CONSTANTS = {
    "current_date", "current_timestamp", "current_time", "current_user",
    "localtime", "localtimestamp", "session_user", "now",
}

# Колонку ищем только там, где она однозначна: операнд сравнения либо
# аргумент агрегата. Так проверка не гадает и не шумит на подзапросах.
COMPARISON_RE = re.compile(
    r"\b([a-z_][a-z0-9_]*)\s*(?:=|<>|!=|<=|>=|<|>|\bIN\b|\bIS\b|\bLIKE\b|\bILIKE\b|\bBETWEEN\b)",
    re.I,
)
AGGREGATE_RE = re.compile(
    r"\b(?:SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(?:DISTINCT\s+)?([a-z_][a-z0-9_]*)\s*\)", re.I
)


def columns_used(sql: str) -> set[str]:
    """Колонки, использованные однозначно: в сравнении или в агрегате."""
    s = re.sub(r"'[^']*'", " ", sql)                 # строковые литералы
    s = re.sub(r":\w+", " ", s)                      # параметры :name
    s = re.sub(r"--[^\n]*", " ", s)                  # комментарии
    out: set[str] = set()
    for rx in (COMPARISON_RE, AGGREGATE_RE):
        for m in rx.finditer(s):
            w = m.group(1).lower()
            if w in SQL_WORDS or w in SQL_CONSTANTS:
                continue
            out.add(w)
    return out


# EXTRACT(MONTH FROM date) — это не «таблица date», поэтому такие FROM убираем.
EXTRACT_RE = re.compile(r"(?i)\bEXTRACT\s*\([^)]*\)")
TABLE_RE = re.compile(r"(?i)\b(FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)(\()?")


def tables_used(sql: str) -> set[str]:
    """Имена таблиц из FROM/JOIN/INTO/UPDATE."""
    s = EXTRACT_RE.sub(" ", sql)
    s = re.sub(r"'[^']*'", " ", s)
    out: set[str] = set()
    for m in TABLE_RE.finditer(s):
        kw, name, paren = m.group(1).upper(), m.group(2).lower(), m.group(3)
        # «FROM unnest(...)» — вызов функции, а не таблица. Скобка учитывается
        # только вплотную и только после FROM/JOIN: у «INSERT INTO t (a, b)»
        # скобка тоже есть, и из-за неё вставки раньше не проверялись вовсе.
        if paren and kw in ("FROM", "JOIN"):
            continue
        if name in SQL_WORDS or name in SQL_CONSTANTS:
            continue                  # «DO UPDATE SET», «INSERT INTO ... SELECT»
        out.add(name)
    return out


def main() -> int:
    init_tables = load_init_sql()
    prisma_tables = load_prisma_tables()
    runtime_tables = load_runtime_tables()
    statements = collect_sql()

    notes.append(f"  ok  схема ботов: {len(init_tables)} таблиц в database/init.sql")
    notes.append(f"  ok  витрина: {len(prisma_tables)} таблиц в schema.prisma")
    notes.append(f"  ok  создаются в рантайме: {len(runtime_tables) or 'нет'}")
    notes.append(f"  ok  разобрано SQL-запросов: {len(statements)}")

    # ── таблицы существуют ───────────────────────────────────────────────
    for rel, line, sql in statements:
        for tbl in tables_used(sql):
            if tbl in init_tables or tbl in runtime_tables:
                continue
            if tbl in prisma_tables:
                # Таблица витрины, объявленная в schema.prisma. База одна и та
                # же (см. DATABASE_URL всех сервисов в docker-compose.prod.yml),
                # поэтому обычной сессией она читается корректно.
                #
                # Раньше здесь была ругань «на проде это ОТДЕЛЬНАЯ база» и
                # проверка, что запрос открыт особой storefront-сессией. Базы
                # разъехались только в истории проекта: сессия-«витрина» была
                # псевдонимом обычной, то есть проверка сравнивала одно и то же
                # с самим собой и держала в коде память о несуществующем делении.
                continue
            problems.append(
                f"{rel}:{line} — таблица «{tbl}» не определена нигде: ни в "
                f"database/init.sql, ни через CREATE TABLE IF NOT EXISTS в коде. "
                f"init.sql применяется только при первой инициализации тома, "
                f"поэтому на живой базе её не появится."
            )

    # ── колонки существуют (только однотабличные запросы) ────────────────
    for rel, line, sql in statements:
        tables = tables_used(sql)
        if len(tables) != 1:
            continue                      # с JOIN не гадаем
        # Подзапрос приносит свои псевдонимы (AVG(daily_sum) от SELECT ... AS
        # daily_sum), и по одной схеме их не отличить от колонок. Пропускаем.
        if len(re.findall(r"(?i)\bSELECT\b", sql)) > 1:
            continue
        tbl = next(iter(tables))
        if tbl not in init_tables:
            continue                      # чужая схема — не наше дело
        known = init_tables[tbl]
        if not known:
            continue
        for col in columns_used(sql) - {tbl}:
            if col in known:
                continue
            # имя другой известной таблицы внутри запроса — не колонка
            if col in init_tables or col in prisma_tables or col in runtime_tables:
                continue
            problems.append(
                f"{rel}:{line} — в «{tbl}» нет колонки «{col}». "
                f"Есть: {', '.join(sorted(known))}"
            )

    print("Сверка SQL ботов со схемой базы\n")
    for n in notes:
        print(n)

    if problems:
        print("\n✗ найдено:")
        for p in dict.fromkeys(problems):
            print(f"  · {p}")
        return 1

    print("\n✓ все таблицы и колонки на месте")
    return 0


if __name__ == "__main__":
    sys.exit(main())
