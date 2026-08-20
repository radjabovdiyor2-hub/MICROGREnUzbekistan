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

ПОЧЕМУ ПРОВЕРЯЕТСЯ И СПИСОК ВЫБИРАЕМЫХ КОЛОНОК

Колонки искались только в сравнениях, агрегатах и списках INSERT. Колонка,
которую просто ЧИТАЮТ, под проверку не попадала — и на этом сторож пропустил
`SELECT message_id FROM tasks` в stepan_bot. Такой колонки нет, запрос падал
до `UPDATE tasks SET status='done'` в той же транзакции, ошибка гасилась
внешним `except`: в чат уходило «задача выполнена», а в базе оставалось
`todo`. Кнопка «✅ Выполнено» не закрывала задачу НИ РАЗУ, и просрочка у
владельца копилась месяцами. Теперь разбирается и проекция SELECT — для
однотабличных запросов, где сопоставление однозначно.

ЧЕГО СКРИПТ НЕ ДЕЛАЕТ
Он не полноценный разборщик SQL. Неквалифицированные колонки проверяются
только у запросов к одной таблице без JOIN — там разбор однозначен. Запросы с
JOIN проверяются по `алиас.колонка` и на существование таблиц: сопоставить
голое имя с нужной таблицей без схемы алиасов нельзя, а гадать хуже,
чем молчать.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path
from typing import Optional

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

    Списки скаляров (`cuisine String[]` → `text[]`) — это КОЛОНКИ. Раньше
    здесь отбрасывалось всё со скобками `[]`, и вместе со связями терялись
    массивы: `SELECT cuisine, dishes, microgreens FROM restaurants` выглядел
    обращением к несуществующим колонкам. Признак связи — имя модели в типе,
    а не квадратные скобки.
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
            if ftype not in scalar_types:
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

#: Чем заменяется подставляемое значение внутри f-строки. Слово, а не пустота:
#: `WHERE {where}` без замены даёт «WHERE ORDER BY», и разбор ломается.
PLACEHOLDER = "_x_"


def _sql_text(node: ast.AST) -> Optional[str]:
    """Восстановить SQL из литерала, f-строки или склейки через `+`.

    Раньше принимался только `ast.Constant`, и ЛЮБОЙ запрос, собранный
    f-строкой или конкатенацией, сторож пропускал целиком — молча, без следа
    в отчёте. Так мимо прошёл `LOWER(kind)` по нативному enum в
    `get_inventory` (падал при каждом вызове с фильтром) и ещё около десятка
    запросов в common/crm/finance/operations_read.

    Подставляемые значения заменяются на `PLACEHOLDER`: что именно там
    окажется, статически неизвестно, но остальная часть запроса — обычные
    имена таблиц и колонок, и её проверить можно.
    """
    if isinstance(node, ast.Constant):
        return node.value if isinstance(node.value, str) else None

    if isinstance(node, ast.JoinedStr):
        parts: list[str] = []
        for piece in node.values:
            if isinstance(piece, ast.Constant) and isinstance(piece.value, str):
                parts.append(piece.value)
            else:
                parts.append(PLACEHOLDER)
        return "".join(parts)

    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = _sql_text(node.left)
        right = _sql_text(node.right)
        if left is None or right is None:
            return None
        return left + right

    # Имя переменной, вызов, что угодно ещё — содержимое статически неизвестно.
    return None


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
            # ast сам склеивает соседние литералы — то, ради чего он здесь
            sql = _sql_text(node.args[0])
            if sql:
                found.append((path.relative_to(ROOT).as_posix(), node.lineno, sql))
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
# `_x_` — след подстановки в f-строке (см. PLACEHOLDER): на его месте могло
# быть что угодно, включая целое выражение вроде SQL_PHONE_TAIL, и колонкой
# он не является.
SQL_CONSTANTS = {
    "_x_",
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
#
# `[a-z0-9_.]` — с ТОЧКОЙ. Без неё `SUM(oi.total_price)` и `o.status = 'new'` не
# матчились вовсе, то есть КАЖДАЯ колонка с алиасом в проекте оставалась
# непроверенной. Именно так мимо сторожа прошло `SUM(oi.subtotal)` по таблице,
# где такой колонки нет, — при том, что весь смысл этого скрипта в ловле ровно
# таких расхождений.
COMPARISON_RE = re.compile(
    r"\b([a-z_][a-z0-9_.]*)\s*(?:=|<>|!=|<=|>=|<|>|\bIN\b|\bIS\b|\bLIKE\b|\bILIKE\b|\bBETWEEN\b)",
    re.I,
)
AGGREGATE_RE = re.compile(
    r"\b(?:SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(?:DISTINCT\s+)?([a-z_][a-z0-9_.]*)\s*\)", re.I
)

# `FROM crm_orders o`, `JOIN customers c ON …` — алиас идёт сразу за именем
# таблицы. Ключевые слова (ON, WHERE, GROUP…) алиасом быть не могут.
ALIAS_RE = re.compile(
    r"(?i)\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)\s+(?:AS\s+)?([a-z_][a-z0-9_]*)\b"
)


def alias_map(sql: str) -> dict[str, str]:
    """{алиас: таблица} из FROM/JOIN. Без алиаса таблица сама себе ключ."""
    out: dict[str, str] = {}
    for table, alias in ALIAS_RE.findall(sql):
        if alias.lower() in SQL_WORDS or table.lower() in SQL_WORDS:
            continue
        out[alias.lower()] = table.lower()
    return out


def columns_used(sql: str) -> set[str]:
    """Неквалифицированные колонки: в сравнении или в агрегате."""
    s = _strip(sql)
    out: set[str] = set()
    for rx in (COMPARISON_RE, AGGREGATE_RE):
        for m in rx.finditer(s):
            w = m.group(1).lower()
            if "." in w or w in SQL_WORDS or w in SQL_CONSTANTS:
                continue
            out.add(w)
    return out


# `e.name AS employee_name`, `sh.type` — квалифицированное имя в списке
# выбираемых колонок. Алиас после AS отбрасываем: проверяем то, что читается
# из таблицы, а не то, как это назвали в результате.
QUALIFIED_TOKEN_RE = re.compile(r"\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)")


def qualified_columns(sql: str) -> set[tuple[str, str]]:
    """{(таблица, колонка)} для `алиас.колонка` — разбор однозначен даже с JOIN.

    Это снимает главное ограничение скрипта: раньше запросы больше чем с одной
    таблицей пропускались целиком, а весь офисный SQL — это JOIN'ы CRM-зеркала.

    Проекция разбирается наравне со сравнениями. Пока её не проверяли,
    `SELECT e.name, e.position FROM shifts sh JOIN employees e` считался
    здоровым: колонки `position` у `employees` нет (есть `role`), запрос падал
    с UndefinedColumn на каждом вызове, и офис не мог прочитать ни одной смены.
    Однотабличная проверка проекции (`select_columns`) такой запрос не видит —
    таблиц в нём две.
    """
    s = _strip(sql)
    aliases = alias_map(s)
    out: set[tuple[str, str]] = set()

    tokens = [m.group(1).lower() for rx in (COMPARISON_RE, AGGREGATE_RE) for m in rx.finditer(s)]

    projection = SELECT_RE.search(s)
    if projection:
        tokens += [
            f"{alias}.{column}"
            for alias, column in QUALIFIED_TOKEN_RE.findall(projection.group(1).lower())
        ]

    for token in tokens:
        if "." not in token:
            continue
        alias, _, column = token.partition(".")
        table = aliases.get(alias)
        if not table or column in SQL_WORDS or column in SQL_CONSTANTS:
            continue
        out.add((table, column))
    return out


def _strip(sql: str) -> str:
    s = re.sub(r"'[^']*'", " ", sql)  # строковые литералы
    s = re.sub(r":\w+", " ", s)  # параметры :name
    return re.sub(r"--[^\n]*", " ", s)  # комментарии


# Список выбираемых колонок: SELECT a, b, c FROM t.
# Берём только простой список имён — как только встречается вызов функции,
# арифметика, звёздочка, алиас или подзапрос, разбор перестаёт быть
# однозначным, и всю проекцию пропускаем целиком.
SELECT_RE = re.compile(r"(?is)\bSELECT\s+(.*?)\s+\bFROM\b")


def select_columns(sql: str) -> Optional[set[str]]:
    """Колонки из проекции `SELECT a, b, c FROM t` или None, если не разобрать."""
    match = SELECT_RE.search(sql)
    if not match:
        return None
    body = match.group(1)
    # Скобки — это функция или подзапрос; звёздочка ничего не называет.
    if "(" in body or "*" in body:
        return None
    columns: set[str] = set()
    for part in body.split(","):
        name = part.strip().lower()
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", name) or name in SQL_WORDS:
            return None  # алиас, литерал, DISTINCT — не гадаем
        columns.add(name)
    return columns or None


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

# Имена общих табличных выражений: `WITH src AS (…)`, `WITH a AS (…), b AS (…)`.
#
# Такое имя живёт ровно один запрос, и в schema.prisma его быть НЕ ДОЛЖНО. Без
# этого разбора сверка требовала объявить `src` таблицей — то есть запрещала
# обычный `WITH`, хотя именно он заменяет цикл по строкам одним запросом
# (`shared/catalog_sync.py`, синк каталога в зеркало CRM).
CTE_RE = re.compile(r"(?is)\b(?:WITH|,)\s+([a-z_][a-z0-9_]*)\s+AS\s*\(")


def cte_names(sql: str) -> set[str]:
    """Имена CTE запроса — это не таблицы базы."""
    if not re.search(r"(?i)\bWITH\s+[a-z_]", sql):
        return set()
    return {m.group(1).lower() for m in CTE_RE.finditer(sql)}


def tables_used(sql: str) -> set[str]:
    """Имена таблиц из FROM/JOIN/INTO/UPDATE, без имён CTE."""
    s = EXTRACT_RE.sub(" ", sql)
    s = re.sub(r"'[^']*'", " ", s)
    local = cte_names(s)
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
        if name in local:
            continue  # имя из `WITH … AS (…)`: существует только внутри запроса
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

    # ── колонки с алиасом: `o.status`, `SUM(oi.total_price)` ─────────────
    # Работает и в запросах с JOIN — алиас однозначно указывает на таблицу.
    for rel, line, sql in statements:
        for table, column in sorted(qualified_columns(sql)):
            if table not in known or not known[table]:
                continue
            if column in known[table]:
                continue
            problems.append(
                f"{rel}:{line} — в «{table}» нет колонки «{column}». "
                f"Есть: {', '.join(sorted(known[table]))}"
            )

    # ── колонки в проекции SELECT (только однотабличные запросы) ─────────
    # Читаемая колонка раньше не проверялась вовсе — так прошёл
    # `SELECT message_id FROM tasks`, из-за которого задачи не закрывались.
    for rel, line, sql in statements:
        tables = tables_used(sql)
        if len(tables) != 1:
            continue  # с JOIN не гадаем
        if len(re.findall(r"(?i)\bSELECT\b", sql)) > 1:
            continue  # подзапрос приносит свои имена
        tbl = next(iter(tables))
        if tbl not in known or not known[tbl]:
            continue
        for col in sorted((select_columns(sql) or set()) - known[tbl]):
            problems.append(
                f"{rel}:{line} — SELECT из «{tbl}»: колонки «{col}» нет. "
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
