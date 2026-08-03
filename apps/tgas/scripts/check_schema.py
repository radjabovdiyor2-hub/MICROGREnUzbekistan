"""scripts/check_schema.py — сверка SQL ботов со схемой базы.

Запуск:  python scripts/check_schema.py       (из apps/tgas)

ЗАЧЕМ ЭТОТ СКРИПТ СУЩЕСТВУЕТ

Боты работают сырыми запросами (`sqlalchemy.text(...)`), поэтому обращение к
несуществующей таблице или колонке не всплывает ни при импорте, ни при линтинге —
только в рантайме, где почти везде стоит `except Exception` и ошибка уходит в лог.
Аудит 31.07.2026 нашёл три таких случая, и ни один не был заметен при чтении кода:

  · franchise_bot считал сводку филиалов как
    `SELECT COUNT(id), SUM(total) FROM orders WHERE city = :city`,
    хотя в заказах НЕТ ни `city`, ни `total` (город у клиента, сумма —
    `total_amount`). Запрос падал на каждом городе, единственная задача бота
    не отработала ни разу.
  · `franchise_journals` не создавалась ничем: в `init.sql` её не было, а сам
    init.sql применяется ТОЛЬКО при первой инициализации тома Postgres.
  · `restaurants` — таблица витрины, её не было в схеме ботов вовсе.

ПОЧЕМУ ИСТОЧНИК ПРАВДЫ — schema.prisma, А НЕ database/init.sql

Раньше колонки сверялись с `database/init.sql`. Из-за этого скрипт пропустил
самую дорогую поломку проекта. `unify_databases.sql` переименовал офисные
таблицы (`products → crm_products`, `orders → crm_orders`,
`order_items → crm_order_items`, `employees → crm_employees`), отдав эти имена
витрине. В `init.sql` они остались офисными — и `SELECT unit FROM products`
проходил проверку, хотя в живой базе `products` это таблица витрины и `unit`
там нет. Регистрация продажи молча отвечала «не смог записать продажу в БД»,
прайс-лист приходил пустым, зеркалирование заказов сайта в CRM не работало.

Схемой владеет Prisma (`prisma db push`), поэтому правда живёт в
`packages/database/prisma/schema.prisma`. `database/init.sql` — исторический
файл: он применяется только при первой инициализации тома и уже разошёлся со
схемой. Скрипт отдельно предупреждает, если init.sql объявляет таблицу с тем
же именем, но другим набором колонок, — это ровно та ловушка, что сработала.

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

ROOT = Path(__file__).resolve().parent.parent  # apps/tgas
REPO = ROOT.parent.parent  # корень репозитория

problems: list[str] = []
warnings: list[str] = []
notes: list[str] = []


# ── 1. Схема из schema.prisma — источник правды ─────────────────────────
PRISMA_SCALARS = {
    "String",
    "Int",
    "BigInt",
    "Float",
    "Decimal",
    "Boolean",
    "DateTime",
    "Json",
    "Bytes",
    # Типы, которых у Prisma нет, но колонка в базе есть: pgvector-эмбеддинг
    # объявлен как Unsupported("vector(1536)"). Без него база знаний
    # support-бота выглядела бы обращением к несуществующей колонке.
    "Unsupported",
}


def load_prisma_schema() -> dict[str, set[str]]:
    """{имя таблицы в БД: {колонки}} из schema.prisma.

    Имя таблицы — из `@@map("...")`, иначе имя модели. Имя колонки — из
    `@map("...")`, иначе имя поля КАК ЕСТЬ: Prisma не превращает camelCase в
    snake_case сама, поэтому и мы не превращаем.

    Поля-связи (`category Category @relation(...)`, `items OrderItem[]`)
    колонками не являются — в базе от них остаётся только скалярный ключ,
    объявленный отдельным полем. Отличаем по типу: скаляр Prisma или enum.
    """
    path = REPO / "packages" / "database" / "prisma" / "schema.prisma"
    if not path.exists():
        problems.append(f"не найден {path} — сверять не с чем")
        return {}
    body = path.read_text(encoding="utf-8")

    enums = set(re.findall(r"^enum\s+(\w+)\s*\{", body, re.M))
    scalar_types = PRISMA_SCALARS | enums

    tables: dict[str, set[str]] = {}
    for match in re.finditer(r"^model\s+(\w+)\s*\{(.*?)^\}", body, re.M | re.S):
        model, block = match.group(1), match.group(2)
        mapped = re.search(r'@@map\("(\w+)"\)', block)
        table = (mapped.group(1) if mapped else model).lower()

        columns: set[str] = set()
        for line in block.splitlines():
            line = line.strip()
            if not line or line.startswith("//") or line.startswith("@@"):
                continue
            field = re.match(r"(\w+)\s+(\w+)", line)
            if not field:
                continue
            name, ftype = field.group(1), field.group(2)
            if ftype not in scalar_types or "[]" in line.split("//")[0]:
                continue  # связь, а не колонка
            column = re.search(r'@map\("(\w+)"\)', line)
            columns.add((column.group(1) if column else name).lower())
        tables[table] = columns
    return tables


# ── 2. Таблицы, которые код создаёт сам в рантайме ──────────────────────
CREATE_RE = re.compile(
    r"CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\n\s*\)", re.I | re.S
)


def _parse_columns(body: str) -> set[str]:
    columns: set[str] = set()
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith("--"):
            continue
        if re.match(r"(?i)(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b", line):
            continue
        column = re.match(r"(\w+)\s+\w", line)
        if column:
            columns.add(column.group(1).lower())
    return columns


def load_runtime_tables() -> dict[str, set[str]]:
    """Таблицы, создаваемые прямо в коде (`CREATE TABLE IF NOT EXISTS`).

    Так заведены `meeting_state`, `ig_comment_seen`, `franchise_journals` —
    init.sql на живой базе их бы не создал.
    """
    tables: dict[str, set[str]] = {}
    for path in sorted(ROOT.rglob("*.py")):
        if "__pycache__" in path.as_posix():
            continue
        body = path.read_text(encoding="utf-8", errors="replace")
        for match in CREATE_RE.finditer(body):
            tables[match.group(1).lower()] = _parse_columns(match.group(2))
    return tables


# ── 3. Исторический init.sql — только для предупреждения о ловушке ──────
def load_init_sql() -> dict[str, set[str]]:
    path = ROOT / "database" / "init.sql"
    if not path.exists():
        return {}
    body = path.read_text(encoding="utf-8")
    tables: dict[str, set[str]] = {}
    for match in re.finditer(
        r"CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\n\);", body, re.S
    ):
        tables[match.group(1).lower()] = _parse_columns(match.group(2))
    return tables


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
                found.append(
                    (path.relative_to(ROOT).as_posix(), node.lineno, arg.value)
                )
    return found


SQL_WORDS = {
    "select",
    "from",
    "where",
    "and",
    "or",
    "not",
    "in",
    "is",
    "null",
    "as",
    "on",
    "join",
    "left",
    "right",
    "inner",
    "outer",
    "full",
    "group",
    "by",
    "order",
    "having",
    "limit",
    "offset",
    "insert",
    "into",
    "values",
    "update",
    "set",
    "delete",
    "create",
    "table",
    "if",
    "exists",
    "primary",
    "key",
    "foreign",
    "references",
    "default",
    "distinct",
    "case",
    "when",
    "then",
    "else",
    "end",
    "asc",
    "desc",
    "union",
    "all",
    "with",
    "returning",
    "conflict",
    "do",
    "nothing",
    "cast",
    "interval",
    "true",
    "false",
    "between",
    "like",
    "ilike",
    "text",
    "integer",
    "serial",
    "boolean",
    "timestamp",
    "date",
    "numeric",
    "jsonb",
    "json",
    "varchar",
    "decimal",
    "at",
    "time",
    "zone",
    "constraint",
    "unique",
    "check",
    "using",
    "temp",
    "any",
    "some",
    "over",
    "partition",
    "nulls",
    "first",
    "last",
    "add",
    "column",
    "alter",
    "drop",
    "index",
}

# Значения без скобок, которые выглядят как идентификатор, но им не являются.
SQL_CONSTANTS = {
    "current_date",
    "current_timestamp",
    "current_time",
    "current_user",
    "localtime",
    "localtimestamp",
    "session_user",
    "now",
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
    s = re.sub(r"'[^']*'", " ", sql)  # строковые литералы
    s = re.sub(r":\w+", " ", s)  # параметры :name
    s = re.sub(r"--[^\n]*", " ", s)  # комментарии
    out: set[str] = set()
    for rx in (COMPARISON_RE, AGGREGATE_RE):
        for m in rx.finditer(s):
            w = m.group(1).lower()
            if w in SQL_WORDS or w in SQL_CONSTANTS:
                continue
            out.add(w)
    return out


# Колонки, перечисленные в INSERT INTO t (a, b, c) — разбор однозначен,
# а именно там жила поломка: вставка офисных колонок в таблицу витрины.
INSERT_RE = re.compile(r"(?i)INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)")


def insert_columns(sql: str) -> tuple[str, set[str]] | None:
    m = INSERT_RE.search(sql)
    if not m:
        return None
    raw = [c.strip().lower() for c in m.group(2).split(",")]
    cols = {c for c in raw if re.fullmatch(r"[a-z_][a-z0-9_]*", c)}
    return m.group(1).lower(), cols


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
            continue  # «DO UPDATE SET», «INSERT INTO ... SELECT»
        out.add(name)
    return out


def main() -> int:
    schema = load_prisma_schema()
    runtime_tables = load_runtime_tables()
    known = {**schema, **runtime_tables}
    statements = collect_sql()

    notes.append(f"  ok  схема Prisma: {len(schema)} таблиц в schema.prisma")
    notes.append(f"  ok  создаются в рантайме: {len(runtime_tables) or 'нет'}")
    notes.append(f"  ok  разобрано SQL-запросов: {len(statements)}")

    # ── ловушка init.sql: то же имя, другой набор колонок ────────────────
    for table, columns in load_init_sql().items():
        if table not in schema or not columns:
            continue
        drifted = columns - schema[table]
        if drifted:
            warnings.append(
                f"database/init.sql объявляет «{table}» с колонками "
                f"{', '.join(sorted(drifted))}, которых нет в schema.prisma. "
                f"init.sql исторический (применяется только при первой "
                f"инициализации тома); правда — schema.prisma."
            )

    # ── таблицы существуют ───────────────────────────────────────────────
    for rel, line, sql in statements:
        for tbl in tables_used(sql):
            if tbl in known:
                continue
            problems.append(
                f"{rel}:{line} — таблица «{tbl}» не объявлена ни в "
                f"schema.prisma, ни через CREATE TABLE IF NOT EXISTS в коде. "
                f"Схемой владеет Prisma: то, чего нет в schema.prisma, "
                f"на живой базе не появится."
            )

    # ── колонки в INSERT INTO t (...) ────────────────────────────────────
    for rel, line, sql in statements:
        parsed = insert_columns(sql)
        if not parsed:
            continue
        tbl, cols = parsed
        if tbl not in known or not known[tbl]:
            continue
        for col in sorted(cols - known[tbl]):
            problems.append(
                f"{rel}:{line} — INSERT в «{tbl}»: колонки «{col}» нет. "
                f"Есть: {', '.join(sorted(known[tbl]))}"
            )

    # ── колонки существуют (только однотабличные запросы) ────────────────
    for rel, line, sql in statements:
        tables = tables_used(sql)
        if len(tables) != 1:
            continue  # с JOIN не гадаем
        # Подзапрос приносит свои псевдонимы (AVG(daily_sum) от SELECT ... AS
        # daily_sum), и по одной схеме их не отличить от колонок. Пропускаем.
        if len(re.findall(r"(?i)\bSELECT\b", sql)) > 1:
            continue
        tbl = next(iter(tables))
        if tbl not in known or not known[tbl]:
            continue
        for col in sorted(columns_used(sql) - {tbl}):
            if col in known[tbl] or col in known:
                continue  # имя другой таблицы внутри запроса — не колонка
            problems.append(
                f"{rel}:{line} — в «{tbl}» нет колонки «{col}». "
                f"Есть: {', '.join(sorted(known[tbl]))}"
            )

    print("Сверка SQL ботов со схемой базы (источник правды — schema.prisma)\n")
    for n in notes:
        print(n)

    if warnings:
        print("\n⚠ предупреждения:")
        for w in dict.fromkeys(warnings):
            print(f"  · {w}")

    if problems:
        print(f"\n✗ найдено ({len(dict.fromkeys(problems))}):")
        for p in dict.fromkeys(problems):
            print(f"  · {p}")
        return 1

    print("\n✓ все таблицы и колонки на месте")
    return 0


if __name__ == "__main__":
    sys.exit(main())
