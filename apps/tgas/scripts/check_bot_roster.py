"""scripts/check_bot_roster.py — сверка реестра ботов.

Запуск:  python scripts/check_bot_roster.py       (из apps/tgas)

ЗАЧЕМ ЭТОТ СКРИПТ СУЩЕСТВУЕТ

Список ботов дублируется в шести местах, и они разъезжаются молча:

    shared/health.py          ALL_BOTS — по нему строится отчёт мониторинга
    shared/event_bus.py       карта host:port прямой доставки событий
    docker-compose.yml        dev-стек
    ../../docker-compose.prod.yml   прод-стек (то, что крутится на сервере)
    start_all.ps1 / .bat      windows-лаунчеры
    bots/<name>/main.py       фактический вызов start_heartbeat

30.07.2026 мониторинг показывал 11/13, и обе причины были из этой щели:

  · analytics_bot импортировал start_heartbeat и НЕ вызывал его. Бот работал,
    но ключа bot:heartbeat:analytics_bot в Redis не появлялось никогда, и
    отчёт вечно писал «НЕ ЗАПУЩЕН».
  · franchise отсутствовал в docker-compose.prod.yml целиком — на прод его
    просто не разворачивали, хотя в ALL_BOTS и dev-compose он был.

Ни одну из этих ошибок нельзя увидеть, читая один файл. Скрипт сверяет все
шесть источников с ALL_BOTS как с единственной правдой и падает со списком
расхождений. Инфраструктура не нужна — только чтение файлов.

Чего скрипт НЕ проверяет: что бот реально жив. Это делает мониторинг
Стёпана (bot_health_check) и /health в web_office.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Вывод русский, а консоль Windows по умолчанию cp1251 и падает на «→».
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parent.parent  # apps/tgas
REPO = ROOT.parent.parent  # корень репозитория

# ── единственный источник правды ────────────────────────────────────────
sys.path.insert(0, str(ROOT))
from shared.health import ALL_BOTS  # noqa: E402

EXPECTED = set(ALL_BOTS)

# Боту не нужен порт event bus, если он не принимает широковещательные
# события. n8n_bridge — вебхук-приёмник n8n, у него своя точка входа.
NO_EVENT_PORT = {"n8n_bridge"}

problems: list[str] = []
notes: list[str] = []


def read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def compare(label: str, found: set[str], *, expected: set[str] = EXPECTED) -> None:
    """Сравнить найденный набор с ожидаемым и записать расхождения.

    Если ожидаемых меньше полного состава, называем исключённых вслух. Строка
    «карта портов — 12» при тринадцати ботах читалась как расхождение, которое
    проверка почему-то считает успехом; на деле у n8n_bridge порта нет
    намеренно, но по выводу этого было не понять.
    """
    missing = expected - found
    extra = found - expected
    if missing:
        problems.append(f"{label}: НЕТ {', '.join(sorted(missing))}")
    if extra:
        problems.append(f"{label}: лишние {', '.join(sorted(extra))}")
    if not missing and not extra:
        skipped = EXPECTED - expected
        suffix = f" из {len(EXPECTED)} (без {', '.join(sorted(skipped))})" if skipped else ""
        notes.append(f"  ok  {label} — {len(found)}{suffix}")


# ── 1. вызов start_heartbeat в каждом боте ──────────────────────────────
# Ловит случай analytics_bot: импорт есть, вызова нет.
hb_found: set[str] = set()
for bot in sorted(EXPECTED):
    main = read(ROOT / "bots" / bot / "main.py")
    if main is None:
        problems.append(f"bots/{bot}/main.py: файла нет")
        continue
    if re.search(rf'start_heartbeat\(\s*["\']{re.escape(bot)}["\']', main):
        hb_found.add(bot)
    elif "start_heartbeat" in main:
        problems.append(
            f"bots/{bot}/main.py: start_heartbeat упомянут, но не вызван с именем «{bot}» "
            f"— бот будет работать, но мониторинг покажет «НЕ ЗАПУЩЕН»"
        )
    else:
        problems.append(f'bots/{bot}/main.py: нет вызова start_heartbeat("{bot}")')
if hb_found == EXPECTED:
    notes.append(f"  ok  вызов start_heartbeat — {len(hb_found)}")

# ── 2. карта портов прямой доставки событий ─────────────────────────────
# Карта переехала из shared/event_bus.py в shared/bot_registry.py: теперь
# это единственный источник и для неё, и для ALL_BOTS. event_bus его просто
# импортирует, поэтому разъехаться они больше не могут — но проверяем, что
# в реестре у каждого бота (кроме безпортовых) порт действительно указан.
registry = read(ROOT / "shared" / "bot_registry.py") or ""
registry_ports = {
    m.group(1) if m.group(1).endswith("_bot") else f"{m.group(1)}_bot"
    for m in re.finditer(
        r'BotInfo\(\s*"([a-z0-9_]+)",\s*"mg_[a-z0-9_]+",\s*\d+', registry
    )
}
compare(
    "shared/bot_registry.py карта портов",
    registry_ports,
    expected=EXPECTED - NO_EVENT_PORT,
)

if "from shared.bot_registry import EVENT_ENDPOINTS" not in (
    read(ROOT / "shared" / "event_bus.py") or ""
):
    problems.append(
        "shared/event_bus.py: карта портов задана вручную вместо импорта "
        "EVENT_ENDPOINTS из shared/bot_registry.py — источники снова разъедутся"
    )

# ── 3. compose-файлы ────────────────────────────────────────────────────
for label, path in (
    ("docker-compose.yml (dev)", ROOT / "docker-compose.yml"),
    ("docker-compose.prod.yml", REPO / "docker-compose.prod.yml"),
):
    text = read(path)
    if text is None:
        problems.append(f"{label}: файла нет")
        continue
    compare(label, set(re.findall(r"python -m bots\.([a-z0-9_]+)\.main", text)))


# ── 4. windows-лаунчеры ─────────────────────────────────────────────────
# Лаунчеры перечисляют ботов двумя способами: строкой `bots.<имя>.main`
# (старый копипаст) или списком имён с циклом (нынешний вид). Понимаем оба:
# сначала выбрасываем комментарии, чтобы пояснения в шапке не сошли за
# реестр, потом ищем имена из ALL_BOTS как отдельные слова.
def launcher_bots(text: str, comment: str) -> set[str]:
    body = "\n".join(
        line
        for line in text.splitlines()
        if not line.strip().lower().startswith(comment)
    )
    return {bot for bot in EXPECTED if re.search(rf"\b{re.escape(bot)}\b", body)}


for name, comment in (("start_all.ps1", "#"), ("start_all.bat", "rem")):
    text = read(ROOT / name)
    if text is None:
        notes.append(f"  —   {name} — файла нет, пропускаю")
        continue
    compare(name, launcher_bots(text, comment))

# start_all_wmi.ps1 удалён проверкой 31.07.2026: он отстал на 8 ботов из 13,
# был помечен устаревшим в CLAUDE.md и ничем не запускался. Если файл вернут —
# сверяем как обычный лаунчер, а не как исключение.

# ── итог ────────────────────────────────────────────────────────────────
print(f"Реестр ботов: {len(EXPECTED)} (shared/health.py → ALL_BOTS)\n")
for line in notes:
    print(line)

if problems:
    print("\n✗ расхождения:")
    for p in problems:
        print(f"  · {p}")
    print("\nПравить так, чтобы все источники совпадали с ALL_BOTS.")
    sys.exit(1)

print("\n✓ все источники согласованы с ALL_BOTS")
