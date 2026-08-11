"""scripts/check_prompts.py — проверка промптов и контактов.

Запуск:  python scripts/check_prompts.py       (из apps/tgas)

ЗАЧЕМ

Аудит 30.07.2026 нашёл дефекты, которые не видны при чтении одного файла и не
падают в рантайме — они просто выдают клиенту неправду:

  · `+998 91 123 45 67` — заглушка — была вписана строкой в промпт продаж
    (а правило №8 велит «предложи связаться с менеджером по телефону»),
    в промпт Instagram-сторис и в подвал PDF коммерческих предложений.
    При этом COMPANY_PHONE в .env был задан правильно — то есть три модуля
    просто не читали конфиг.
  · ссылки Click/Payme собирались из merchant ID со значениями «12345» и
    «1234567890» из defaults, которых не было в .env: клиент получал
    кликабельную кнопку «Оплатить», ведущую в никуда.
  · TEAM_CONTEXT подмешивается каждому боту и перечислял 8 отделов из 13.
  · у qa/rnd/franchise системный промпт был одной строкой.

Аудит 09.08.2026 показал, что сам этот скрипт видел меньше половины:

  · он смотрел только `.py` и только внутри apps/tgas. `faq.md` — файл, который
    уходит в базу знаний и оттуда прямо в системный промпт поддержки —
    обещал Click/Payme и замороженные цены, а витринный бот и apps/web
    вообще не проверялись.
  · правило 4 искало регуляркой `system_prompt="…"` и не видело промптов,
    переданных ПЕРВЫМ ПОЗИЦИОННЫМ аргументом: `chat_completion("Ты HR-менеджер
    Microgreen Uzbekistan.", msg.text)` — это обработчик личных сообщений
    HR-бота, и он всё это время отвечал без фирменного голоса.
  · f-строки и склейка (`"а" + B`) не разбирались вовсе.

Теперь разбор идёт по AST, а не регуляркой, и область — три модуля.

Чего скрипт НЕ проверяет: что юзернеймы ботов существуют в Telegram (это
`check_bots_live.py`, нужна сеть).
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

TGAS = Path(__file__).resolve().parent.parent
REPO = TGAS.parent.parent
BOT = REPO / "apps" / "bot"
WEB_AI = REPO / "apps" / "web" / "src" / "lib" / "ai"
WEB_AI_API = REPO / "apps" / "web" / "src" / "app" / "api" / "ai"

sys.path.insert(0, str(TGAS))

problems: list[str] = []
notes: list[str] = []


def rel(path: Path) -> str:
    try:
        return path.relative_to(REPO).as_posix()
    except ValueError:
        return path.as_posix()


# ── Точечное подавление ────────────────────────────────────────────────
#
# Правила ниже ловят дублирование данных, у которых есть владелец (настройки,
# каталог). Но бывают строки, у которых владельца нет: пример формата телефона
# в подсказке «напишите так», вилка зарплаты в вакансии, запасное значение на
# случай недоступной витрины.
#
# Такую строку можно пометить `# prompt-ok: причина` — на самой строке или на
# предыдущей. Причина обязательна: молчаливое подавление ничем не лучше
# отсутствия проверки, а так его видно и в коде, и в `git grep prompt-ok`.
SUPPRESS = re.compile(r"#\s*prompt-ok:\s*(\S.*)")


def suppressed(lines: list[str], lineno: int) -> bool:
    for i in (lineno - 1, lineno - 2):
        if 0 <= i < len(lines) and SUPPRESS.search(lines[i]):
            return True
    return False


def skip(path: Path) -> bool:
    p = path.as_posix()
    return (
        "__pycache__" in p
        or "/venv/" in p
        or "/node_modules/" in p
        or "/.next/" in p
        or "/.ruff_cache/" in p
        or "/scripts/check_" in p
        or p.endswith("shared/utils.py")  # валидатор телефонов: форматы законны
    )


def py_files(*roots: Path) -> list[Path]:
    out: list[Path] = []
    for root in roots:
        if root.exists():
            out += [f for f in root.rglob("*.py") if not skip(f)]
    return sorted(out)


# ═══ Сбор строковых литералов без докстрингов ═══════════════════════════
#
# Комментарии и докстринги объясняют, ПОЧЕМУ так делать нельзя, — ловить в
# них те же слова значит запретить объяснения. Поэтому берём только живые
# строки: AST их отличает от докстрингов надёжно, в отличие от регулярки.


def _docstring_nodes(tree: ast.AST) -> set[int]:
    ids: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            body = getattr(node, "body", [])
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
                if isinstance(body[0].value.value, str):
                    ids.add(id(body[0].value))
    return ids


def live_strings(tree: ast.AST) -> list[tuple[int, str]]:
    """(строка файла, значение) для всех строковых литералов, кроме докстрингов."""
    docs = _docstring_nodes(tree)
    out: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docs:
            out.append((node.lineno, node.value))
    return out


# ═══ 1. Заглушки, которые нельзя показывать клиенту ═════════════════════
PLACEHOLDERS = {
    "123 45 67": "телефон-заглушка",
    "1234567890": "merchant id / телефон-заглушка",
    "my.click.uz": "ссылка на онлайн-оплату (её убрали)",
    "checkout.paycom": "ссылка на онлайн-оплату (её убрали)",
}

# Значение целиком, а не подстрока: «12345» встречается внутри любого номера
# вида +998901234567, и подстрочный поиск давал ложные срабатывания.
PLACEHOLDERS_EXACT = {
    "12345": "merchant id-заглушка",
    "0000": "заглушка",
}

PY_SCOPE = py_files(TGAS / "bots", TGAS / "shared", TGAS / "scripts", BOT)

for path in PY_SCOPE:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    try:
        tree = ast.parse(text)
    except SyntaxError:
        continue
    for line, value in live_strings(tree):
        if suppressed(lines, line):
            continue
        for bad, what in PLACEHOLDERS.items():
            if bad in value:
                problems.append(f"{rel(path)}:{line} — {what}: {bad}")
        what = PLACEHOLDERS_EXACT.get(value.strip())
        if what:
            problems.append(f"{rel(path)}:{line} — {what}: {value.strip()}")

if not any("заглушка" in p or "-заглушка" in p for p in problems):
    notes.append("  ok  заглушек в живых строках нет")


# ═══ 2. Телефоны литералами ═════════════════════════════════════════════
# Номер живёт в настройках (`contacts.phonePrimary`, `settings.company_phone`).
# Вписанный строкой, он расходится: в промптах витрины лежало два номера,
# в аварийном ответе роута — третий, а в дефолте config_service — заглушка.
PHONE = re.compile(r"\+998[\s\-()]*\d[\d\s\-()]{6,}")
PHONE_ALLOWED = {
    "shared/brand.py",  # BRAND — сам источник, из него берётся company_phone
}

for path in PY_SCOPE:
    r = rel(path)
    if any(r.endswith(a) for a in PHONE_ALLOWED):
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    try:
        tree = ast.parse(text)
    except SyntaxError:
        continue
    for line, value in live_strings(tree):
        m = PHONE.search(value)
        if m and not suppressed(lines, line):
            problems.append(
                f"{r}:{line} — телефон строкой ({m.group(0).strip()}): "
                f"берите из настроек (contacts.phonePrimary / settings.company_phone)"
            )

if not any("телефон строкой" in p for p in problems):
    notes.append("  ok  телефонов литералами нет")


# ═══ 3. Цены в промптах и текстах ═══════════════════════════════════════
# Единственный источник цены — каталог. Прайс, вписанный в промпт, разошёлся
# с базой, и модель получала два противоречащих списка сразу.
PRICE = re.compile(
    r"\d{1,3}[\s, ]\d{3}\s*(сум|so'm|som|uzs|UZS)",
    re.IGNORECASE,
)

for path in PY_SCOPE:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    try:
        tree = ast.parse(text)
    except SyntaxError:
        continue
    for line, value in live_strings(tree):
        m = PRICE.search(value)
        if m and not suppressed(lines, line):
            problems.append(
                f"{rel(path)}:{line} — цена строкой («{m.group(0)}»): "
                f"цены только из каталога (catalog_repo / get_price_list / /api/products)"
            )

if not any("цена строкой" in p for p in problems):
    notes.append("  ok  цен литералами нет")


# ═══ 4. Битые ссылки на витрину ═════════════════════════════════════════
# Страниц /shop, /game, /admin/products, /admin/users на сайте нет.
DEAD_PATHS = {
    "com/shop": "/shop не существует — каталог живёт на /catalog",
    "com/game": "/game не существует — игра это Mini App t.me/<bot>/game",
    "com/admin/products": "/admin/products не существует — админка на /admin",
    "com/admin/users": "/admin/users не существует — админка на /admin",
}

TEXT_SCOPE: list[Path] = list(PY_SCOPE)
TEXT_SCOPE += [f for f in (TGAS / "bots").rglob("*.md") if not skip(f)]
for root in (WEB_AI, WEB_AI_API):
    if root.exists():
        TEXT_SCOPE += [f for f in root.rglob("*.ts") if not skip(f)]

for path in TEXT_SCOPE:
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix == ".py":
        try:
            values = [(ln, v) for ln, v in live_strings(ast.parse(text))]
        except SyntaxError:
            continue
    else:
        # .md/.ts: комментарии вырезаем, остальное считаем живым текстом
        body = re.sub(r"<!--.*?-->", "", text, flags=re.S)
        body = re.sub(r"^\s*//.*$", "", body, flags=re.M)
        values = [(i, ln) for i, ln in enumerate(body.splitlines(), 1)]
    for line, value in values:
        for bad, why in DEAD_PATHS.items():
            if bad in value:
                problems.append(f"{rel(path)}:{line} — {why}")

if not any("не существует" in p for p in problems):
    notes.append("  ok  битых ссылок на витрину нет")


# ═══ 5. Обещания онлайн-оплаты ══════════════════════════════════════════
# Онлайн-оплаты в системе нет; способы оплаты приходят из настроек
# (`payment.methods`). Названия провайдеров, вписанные в текст, обещают то,
# что владелец мог отключить в админке.
PAY_WORDS = re.compile(r"\b(Click|Payme)\b")
PAY_ALLOWED = {
    # Таблицы подписей: они не обещают способ, а переводят ключ из
    # `payment.methods` в человеческое название. Нет ключа — нет строки.
    "apps/tgas/shared/storefront_config.py",
    "apps/bot/services/config_service.py",
    "apps/web/src/lib/ai/chatHelpers.ts",
}

for path in TEXT_SCOPE:
    r = rel(path)
    if r in PAY_ALLOWED:
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix == ".py":
        try:
            values = live_strings(ast.parse(text))
        except SyntaxError:
            continue
    else:
        body = re.sub(r"<!--.*?-->", "", text, flags=re.S)
        body = re.sub(r"^\s*//.*$", "", body, flags=re.M)
        values = [(i, ln) for i, ln in enumerate(body.splitlines(), 1)]
    for line, value in values:
        m = PAY_WORDS.search(value)
        if m:
            problems.append(
                f"{r}:{line} — способ оплаты строкой («{m.group(0)}»): "
                f"берите из настроек payment.methods"
            )

if not any("способ оплаты строкой" in p for p in problems):
    notes.append("  ok  онлайн-оплата строкой не обещана")


# ═══ 6. TEAM_CONTEXT знает про всех ботов ═══════════════════════════════
from shared.health import ALL_BOTS  # noqa: E402
from shared.prompts import TEAM_CONTEXT  # noqa: E402

ALIASES = {
    "stepan_bot": ["Степан"],
    "sales_bot": ["Sales"],
    "hr_bot": ["HR"],
    "finance_bot": ["Finance"],
    "marketing_bot": ["Marketing"],
    "support_bot": ["Support"],
    "analytics_bot": ["Analytics"],
    "content_bot": ["Content"],
    "qa_bot": ["QA"],
    "rnd_bot": ["R&D"],
    "devops_bot": ["DevOps"],
    "franchise_bot": ["Franchise"],
    "n8n_bridge": ["n8n"],
}
missing = [
    b for b in ALL_BOTS if not any(a in TEAM_CONTEXT for a in ALIASES.get(b, [b]))
]
if missing:
    problems.append(
        "shared/prompts.py: TEAM_CONTEXT не упоминает "
        + ", ".join(missing)
        + " — остальные боты не знают об их существовании и не могут маршрутизировать"
    )
else:
    notes.append(f"  ok  TEAM_CONTEXT упоминает все {len(ALL_BOTS)}")


# ═══ 7. Кто принимает задачи — должен знать о команде ═══════════════════
for bot in ALL_BOTS:
    pkg = TGAS / "bots" / bot
    if not pkg.exists():
        continue
    files = [f for f in pkg.rglob("*.py") if "__pycache__" not in f.as_posix()]
    src = "\n".join(f.read_text(encoding="utf-8", errors="replace") for f in files)
    takes_tasks = "handle_task_created" in src
    uses_ai = "system_prompt" in src or "AIEngine" in src
    knows_team = "TEAM_CONTEXT" in src
    if takes_tasks and uses_ai and not knows_team:
        problems.append(
            f"bots/{bot}: вызывает AI и принимает задачи, но не подмешивает "
            f"TEAM_CONTEXT — не знает, куда маршрутизировать"
        )


# ═══ 8. Однострочные системные промпты (AST) ════════════════════════════
#
# Регулярка видела только `system_prompt="…"`. Промпт передают ещё и первым
# позиционным аргументом, и через переменную, и f-строкой — все эти формы
# рассматриваются здесь.
SHORT = 90
PROMPT_KEYWORDS = {"system_prompt", "sys_prompt", "system_context", "system_message"}
PROMPT_CALLS = {"chat_completion", "run_tool_loop", "ask", "generate"}


def static_len(node: ast.AST) -> tuple[int, bool]:
    """Длина статической части выражения и признак «есть подстановка».

    Для f-строк и склейки считаем только буквальный текст: именно он задаёт
    голос. `TEAM_CONTEXT + роль` считается длинным независимо от длины роли —
    контекст подмешан, а это и требуется.
    """
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return len(node.value), False
    if isinstance(node, ast.JoinedStr):
        total, dyn = 0, False
        for part in node.values:
            if isinstance(part, ast.Constant) and isinstance(part.value, str):
                total += len(part.value)
            else:
                dyn = True
        return total, dyn
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left, ldyn = static_len(node.left)
        right, rdyn = static_len(node.right)
        return left + right, ldyn or rdyn
    return 0, True  # переменная/вызов — считаем динамическим


def static_text(node: ast.AST) -> str:
    """Буквальный текст выражения — для понятного сообщения об ошибке."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        return "".join(
            p.value for p in node.values
            if isinstance(p, ast.Constant) and isinstance(p.value, str)
        )
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return static_text(node.left) + static_text(node.right)
    return ""


# Функции, которые сами подмешивают TEAM_CONTEXT (shared/prompts.py).
PROMPT_COMPOSERS = {"role_prompt"}


def mentions_context(node: ast.AST) -> bool:
    """Есть ли в выражении TEAM_CONTEXT, промпт-константа или composer."""
    for sub in ast.walk(node):
        if isinstance(sub, ast.Name) and sub.id.isupper():
            return True
        if isinstance(sub, ast.Attribute) and sub.attr.isupper():
            return True
        if isinstance(sub, ast.Call):
            fn = sub.func
            name = fn.attr if isinstance(fn, ast.Attribute) else getattr(fn, "id", "")
            if name in PROMPT_COMPOSERS:
                return True
    return False


def check_prompt_expr(path: Path, node: ast.AST, where: str) -> None:
    length, _dyn = static_len(node)
    if mentions_context(node):
        return  # подмешана константа — голос на месте
    if length == 0:
        return  # чистая переменная: значение задано в другом месте
    sample = static_text(node)
    if "JSON" in sample.upper():
        return  # структурный ответ: TEAM_CONTEXT провоцирует прозу вокруг JSON
    if length < SHORT:
        problems.append(
            f"{rel(path)}:{node.lineno} — системный промпт {where} задан "
            f"{length} символами («{sample[:45]}»): нужна константа "
            f"TEAM_CONTEXT + роль + BRAND_TEXT_STYLE"
        )


for path in py_files(TGAS / "bots", BOT):
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
    except SyntaxError:
        continue

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
            for kw in node.keywords:
                if kw.arg in PROMPT_KEYWORDS:
                    check_prompt_expr(path, kw.value, f"аргументом {kw.arg}")
            if name in PROMPT_CALLS and node.args:
                check_prompt_expr(path, node.args[0], f"первым аргументом {name}()")
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for t in targets:
                if isinstance(t, ast.Name) and t.id in PROMPT_KEYWORDS and node.value:
                    check_prompt_expr(path, node.value, f"переменной {t.id}")

if not any("системный промпт" in p for p in problems):
    notes.append("  ok  однострочных системных промптов нет")


# ═══ 8. Секрет с запасным значением в коде ══════════════════════════════
# `process.env.WHATSAPP_VERIFY_TOKEN || 'microgreen_uz_wa_token_stub'` —
# верификацию вебхука WhatsApp проходил кто угодно, кто прочитал этот файл в
# публичном репозитории, пока переменная не задана. Правило то же, что у
# `getSecret()` в lib/session.ts и у `requireBotAuth`: нет переменной — отказ,
# а не тихий вход по значению из исходников.
#
# Правило 1 такое не ловило: оно смотрит только Python и знает конкретные
# заглушки в лицо. Здесь важна не строка, а форма — «секрет со значением
# по умолчанию».
SECRET_FALLBACK = re.compile(
    r"process\.env\.[A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD)[A-Z0-9_]*\s*\|\|\s*"
    r"['\"`][^'\"`]+['\"`]"
)

WEB_SRC = REPO / "apps" / "web" / "src"
TS_SCOPE: list[Path] = []
for root in (WEB_SRC / "app" / "api", WEB_SRC / "lib", WEB_SRC / "middleware.ts"):
    if root.is_dir():
        TS_SCOPE += [f for f in root.rglob("*.ts") if not skip(f)]
    elif root.is_file():
        TS_SCOPE.append(root)

for path in TS_SCOPE:
    body = path.read_text(encoding="utf-8", errors="replace")
    # Комментарии вырезаем: в них разбор прошлых ошибок, а не живой код.
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    for i, line in enumerate(body.splitlines(), 1):
        if re.match(r"\s*(//|\*)", line):
            continue
        if SECRET_FALLBACK.search(line):
            problems.append(
                f"{rel(path)}:{i} — секрет с запасным значением в коде: "
                f"нет переменной окружения — должен быть отказ, а не вход "
                f"по значению из исходников"
            )

# Та же форма на Python: `os.getenv("META_VERIFY_TOKEN", "microgreen_secure_token_2026")`
# — вебхук Meta в web_office проходил верификацию по значению из исходников.
PY_SECRET_ARG = re.compile(r"(?:SECRET|TOKEN|KEY|PASSWORD)", re.I)

for path in PY_SCOPE + py_files(TGAS / "web_office"):
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
    except SyntaxError:
        continue
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or len(node.args) < 2:
            continue
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        if name not in {"getenv", "environ_get"}:
            continue
        var, default = node.args[0], node.args[1]
        if not (isinstance(var, ast.Constant) and isinstance(var.value, str)):
            continue
        if not (isinstance(default, ast.Constant) and isinstance(default.value, str)):
            continue
        if not PY_SECRET_ARG.search(var.value) or not default.value:
            continue
        problems.append(
            f"{rel(path)}:{node.lineno} — секрет с запасным значением в коде: "
            f"{var.value} по умолчанию «{default.value[:24]}»"
        )

if not any("секрет с запасным значением" in p for p in problems):
    notes.append(f"  ok  секретов со значением по умолчанию нет ({len(TS_SCOPE)} .ts + .py)")


# ═══ итог ═══════════════════════════════════════════════════════════════
print("Проверка промптов и контактов\n")
print(f"  область: apps/tgas, apps/bot, apps/web/src/lib/ai — {len(TEXT_SCOPE)} файлов\n")
for line in notes:
    print(line)

if problems:
    print(f"\n✗ найдено ({len(problems)}):")
    for p in problems:
        print(f"  · {p}")
    sys.exit(1)

print("\n✓ промпты и контакты в порядке")
