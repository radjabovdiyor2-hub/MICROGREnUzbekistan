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
  · TEAM_CONTEXT подмешивается каждому боту и перечислял 8 отделов из 13 —
    QA, R&D, DevOps и Franchise не существовали для остальных, хотя первое
    же правило в том же тексте требует «все должны знать друг о друге».
  · у qa/rnd/franchise системный промпт был одной строкой («Ты инженер QA
    на ферме микрозелени.») — без фирменного голоса и без запрета выдумывать.

Скрипт ловит повторение каждого из этих случаев. Инфраструктура не нужна —
только чтение файлов, как и в scripts/check_bot_roster.py.

Чего скрипт НЕ проверяет: что юзернеймы ботов существуют в Telegram и что
прайс в промпте совпадает с таблицей products (известное расхождение — см.
CLAUDE.md). Это проверяется руками.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

problems: list[str] = []
notes: list[str] = []

# ── 1. Заглушки, которые нельзя показывать клиенту ──────────────────────
# Ищем в коде, но не в комментариях: объяснения «раньше здесь была заглушка»
# оставлять полезно, а живое значение — нет.
PLACEHOLDERS = {
    "123 45 67": "телефон-заглушка",
    "1234567890": "merchant id / телефон-заглушка",
    '"12345"': "merchant id-заглушка",
    "my.click.uz": "ссылка на онлайн-оплату (её убрали)",
    "checkout.paycom": "ссылка на онлайн-оплату (её убрали)",
}

for path in sorted(ROOT.glob("**/*.py")):
    rel = path.relative_to(ROOT).as_posix()
    if "__pycache__" in rel or rel.startswith("venv/") or rel.startswith("scripts/check_"):
        continue
    # utils.py — валидатор телефонов, примеры форматов в докстринге законны
    if rel == "shared/utils.py":
        continue
    for num, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        code = line.split("#", 1)[0]
        for bad, what in PLACEHOLDERS.items():
            if bad in code:
                problems.append(f"{rel}:{num} — {what}: {bad}")

if not problems:
    notes.append("  ok  заглушек в коде нет")

# ── 2. TEAM_CONTEXT знает про всех ботов ────────────────────────────────
from shared.health import ALL_BOTS            # noqa: E402
from shared.prompts import TEAM_CONTEXT       # noqa: E402

# n8n_bridge упомянут как служебный мост; сверяем по «человеческому» имени
ALIASES = {
    "stepan_bot": ["Степан"], "sales_bot": ["Sales"], "hr_bot": ["HR"],
    "finance_bot": ["Finance"], "marketing_bot": ["Marketing"],
    "support_bot": ["Support"], "analytics_bot": ["Analytics"],
    "content_bot": ["Content"], "qa_bot": ["QA"], "rnd_bot": ["R&D"],
    "devops_bot": ["DevOps"], "franchise_bot": ["Franchise"],
    "n8n_bridge": ["n8n"],
}
missing = [b for b in ALL_BOTS if not any(a in TEAM_CONTEXT for a in ALIASES.get(b, [b]))]
if missing:
    problems.append(
        "shared/prompts.py: TEAM_CONTEXT не упоминает " + ", ".join(missing)
        + " — остальные боты не знают об их существовании и не могут маршрутизировать"
    )
else:
    notes.append(f"  ok  TEAM_CONTEXT упоминает все {len(ALL_BOTS)}")

# ── 3. Кто принимает задачи — должен знать о команде ────────────────────
for bot in ALL_BOTS:
    pkg = ROOT / "bots" / bot
    if not pkg.exists():
        continue
    files = [f for f in pkg.rglob("*.py") if "__pycache__" not in f.as_posix()]
    src = "\n".join(f.read_text(encoding="utf-8", errors="replace") for f in files)
    takes_tasks = "handle_task_created" in src
    # Требуем командный контекст только от тех, кто реально обращается к модели:
    # devops_bot и n8n_bridge задачи принимают, но AI не вызывают — промпт им
    # некуда подставлять, достаточно упоминания в TEAM_CONTEXT (проверка выше).
    uses_ai = "system_prompt" in src or "AIEngine" in src
    knows_team = "TEAM_CONTEXT" in src
    if takes_tasks and uses_ai and not knows_team:
        problems.append(
            f"bots/{bot}: вызывает AI и принимает задачи, но не подмешивает "
            f"TEAM_CONTEXT — не знает, куда маршрутизировать"
        )

# ── 4. Однострочные системные промпты ──────────────────────────────────
# Признак недоделанного бота: system_prompt="одна фраза" вместо константы
# с ролью и фирменным голосом.
# 90, а не 45: порог 45 пропустил промпт на 69 символов
# («Ты шеф-повар и гениальный менеджер по продажам Microgreen Uzbekistan.»)
# в vision-обработчике sales_bot — при том что соседний обработчик в том же
# файле командный контекст подмешивал. Нормальный промпт с TEAM_CONTEXT — это
# константа на тысячи символов, так что 90 не даёт ложных срабатываний.
SHORT = 90
for path in sorted((ROOT / "bots").rglob("*.py")):
    if "__pycache__" in path.as_posix():
        continue
    rel = path.relative_to(ROOT).as_posix()
    for num, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        m = re.search(r'system_prompt\s*=\s*(["\'])(.*?)\1', line)
        # Промпты «ответь только JSON» — законное исключение: TEAM_CONTEXT с
        # указаниями по тону и формату провоцирует модель добавить прозу вокруг
        # структуры, и разбор ломается. Такие оставляем короткими намеренно.
        if m and "JSON" in m.group(2).upper():
            continue
        if m and len(m.group(2)) < SHORT:
            problems.append(
                f"{rel}:{num} — системный промпт задан строкой в {len(m.group(2))} символов "
                f"(«{m.group(2)[:40]}»): нужна константа TEAM_CONTEXT + роль + BRAND_TEXT_STYLE"
            )

if not any("системный промпт" in p for p in problems):
    notes.append("  ok  однострочных системных промптов нет")

# ── итог ────────────────────────────────────────────────────────────────
print("Проверка промптов и контактов\n")
for line in notes:
    print(line)

if problems:
    print("\n✗ найдено:")
    for p in problems:
        print(f"  · {p}")
    sys.exit(1)

print("\n✓ промпты и контакты в порядке")
