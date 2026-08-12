#!/usr/bin/env python3
"""
Сверка: каждая переменная окружения, которую читает код, где-то объявлена.

ЗАЧЕМ ЭТОТ СТОРОЖ СУЩЕСТВУЕТ

Три поломки третьего раунда сверки — один и тот же класс: работающий
защитный код, обезоруженный переменной, которой нет ни в одном файле
окружения. Ни одна из них не видна при чтении кода: там всё правильно.

  · `BACKUP_REMOTE_TARGET` (`apps/tgas/shared/backup.py`) — предупреждение
    «бэкап не уехал наружу» показывалось ТОЛЬКО при заданной переменной.
    Переменной не было нигде, поэтому владелец видел чистое «✅ Бэкап
    готов», а единственная копия лежала на той же машине, что и база.
  · `CRON_SECRET` (`api/marketing/digest`) — при незаданном значении
    ожидаемый заголовок равен литералу «Bearer undefined», который может
    прислать кто угодно.
  · `AUDIT_LOG_DIR` — журнал аудита писался в слой образа и умирал с
    каждым деплоем вместе с HMAC-цепочкой, смысл которой в неизменности.

Объявлением считается упоминание имени в `.env.example`, в
`apps/tgas/.env.example` или в любом docker-compose: этого достаточно,
чтобы переменную было видно человеку, настраивающему сервер.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Где ищем чтение переменных.
CODE_GLOBS = (
    "apps/web/src/**/*.ts",
    "apps/web/src/**/*.tsx",
    "apps/bot/**/*.py",
    "apps/tgas/**/*.py",
    "packages/**/*.ts",
)

# Где считается объявленным.
DECLARATION_FILES = (
    ".env.example",
    "apps/tgas/.env.example",
    "docker-compose.yml",
    "docker-compose.prod.yml",
    "docker-compose.n8n.yml",
    "docker-compose.monitoring.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/deploy.yml",
)

# Стандартное окружение и то, что ставит рантайм, — не наша забота.
IGNORED = {
    "NODE_ENV", "PATH", "HOME", "PWD", "USER", "PORT", "HOSTNAME", "CI", "TZ",
    "VERCEL", "VERCEL_URL", "npm_package_version", "PYTHONPATH", "LANG",
    "ENVIRONMENT", "NEXT_RUNTIME", "NEXT_PUBLIC_VERCEL_URL", "DEBUG",
}

READ_PATTERNS = (
    re.compile(r"process\.env\.([A-Z][A-Z0-9_]{2,})"),
    re.compile(r"process\.env\[['\"]([A-Z][A-Z0-9_]{2,})['\"]\]"),
    re.compile(r"os\.getenv\(\s*['\"]([A-Z][A-Z0-9_]{2,})['\"]"),
    re.compile(r"os\.environ\.get\(\s*['\"]([A-Z][A-Z0-9_]{2,})['\"]"),
    re.compile(r"os\.environ\[\s*['\"]([A-Z][A-Z0-9_]{2,})['\"]\s*\]"),
)


def _iter_code_files():
    for pattern in CODE_GLOBS:
        for path in ROOT.glob(pattern):
            parts = set(path.parts)
            # venv/site-packages — чужой код: его переменные объявлять не нам.
            if parts & {
                "node_modules", ".next", "__pycache__",
                "venv", ".venv", ".test_venv", "site-packages",
            }:
                continue
            if path.name.endswith((".test.ts", ".test.tsx", ".spec.ts")):
                continue
            yield path


def main() -> int:
    declared: set[str] = set()
    for rel in DECLARATION_FILES:
        path = ROOT / rel
        if path.exists():
            declared |= set(
                re.findall(r"([A-Z][A-Z0-9_]{2,})", path.read_text(encoding="utf-8"))
            )

    used: dict[str, str] = {}
    for path in _iter_code_files():
        try:
            source = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for pattern in READ_PATTERNS:
            for name in pattern.findall(source):
                used.setdefault(name, str(path.relative_to(ROOT)))

    missing = {
        name: where
        for name, where in sorted(used.items())
        if name not in declared and name not in IGNORED
    }

    print("Сверка переменных окружения")
    print(f"  читается в коде: {len(used)}")
    print(f"  объявлено:       {len(declared & set(used))}")

    if missing:
        print(f"\n[FAIL] не объявлены нигде ({len(missing)}):")
        for name, where in missing.items():
            print(f"  - {name}  <- {where}")
        print(
            "\nДопишите их в .env.example (или в compose) с объяснением, что будет,\n"
            "если оставить пустыми. Незадекларированная переменная = функция,\n"
            "молча выключенная в проде."
        )
        return 1

    print("\n[OK] каждая читаемая переменная где-то объявлена")
    return 0


if __name__ == "__main__":
    sys.exit(main())
