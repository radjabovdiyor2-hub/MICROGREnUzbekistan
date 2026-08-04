"""check_compose.py — сторож инвариантов прод-развёртывания.

Ловит регрессии, которые не видны при чтении диффа и всплывают только на
сервере. Каждое правило здесь стоит за конкретной аварией:

  * сервис с `build:` без `image:` — compose даёт каждому своё имя образа и
    собирает один Dockerfile четырнадцать раз подряд; деплой не укладывался
    в отведённые 28 минут и падал по таймауту;
  * образ не из GHCR — значит, он собирается на сервере, а неограниченная
    сборка витрины (npm install + next build, 1,5–2,5 ГБ) выедала память
    4-гигабайтной машины до OOM;
  * заниженный `mem_limit` — это порог убийства, а не бюджет: ниже реального
    потребления контейнер уходит в restart-loop;
  * `pull` после миграции базы — под `set -e` обрыв скачивания оставлял базу
    мигрированной, а стек неподнятым.

Запуск из корня репозитория: python scripts/check_compose.py
"""

from __future__ import annotations

import io
import re
import sys

import yaml

COMPOSE = "docker-compose.prod.yml"
DEPLOY_FILES = (".github/workflows/ci.yml", "deploy_unified.sh")

# Больше четырёх уникальных пар (dockerfile, target) быть не должно: tgas,
# витрина, builder витрины и витринный бот. Пятая — признак того, что сборку
# снова размножили по сервисам.
MAX_UNIQUE_BUILDS = 4

# Сторонние образы, которые законно тянутся не из нашего GHCR.
ALLOWED_EXTERNAL = ("pgvector/", "redis:", "nginx:", "certbot/")

# Нижние границы порогов памяти. Поднимать можно, опускать нельзя: числа взяты
# из `docker stats` на проде 04.08.2026, а не из оценки. Первая редакция как раз
# была оценкой и оказалась занижена вдвое — сторож существует, чтобы к ней не
# вернулись «за экономией».
MIN_MB = {
    "postgres": 512,  # факт 120 МБ, но растёт от подключений и тяжёлых отчётов
    "redis": 192,  # факт 7 МБ; форк при RDB-снимке удваивает резидентную память
    "web": 512,  # факт 102 МБ, рантайм Next.js standalone
    "bot": 256,  # факт 167 МБ
}

# Сервисы офиса делят один образ, поэтому и порог общий.
TGAS_SERVICES = frozenset(
    {
        "web_office", "stepan", "sales", "support", "hr", "finance",
        "marketing", "analytics", "content", "qa", "rnd", "devops",
        "franchise", "n8n_bridge",
    }
)
# Боты с полным Dispatcher'ом держат 158–170 МБ; 256 = 170 × 1.5.
TGAS_MIN_MB = 256
# stepan — диспетчер, инструменты всех отделов и состояние совещаний: 190 МБ.
# content лениво импортирует pytrends → pandas при суточном сборе трендов,
# и замер 159 МБ снят ДО него: реальный пик ≈240 МБ.
TGAS_OVERRIDES = {"content": 320, "stepan": 320}

FORBIDDEN_SUBSTRINGS = ("up -d --build", "compose build")

# 512m, 1g, 1.5G, 256M, а также размер числом (compose допускает байты).
_SIZE_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*([kmg]?)b?$", re.IGNORECASE)
_UNIT_TO_MB = {"": 1 / 1024 / 1024, "k": 1 / 1024, "m": 1.0, "g": 1024.0}


class Checker:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def fail(self, message: str) -> None:
        self.errors.append(message)

    def read(self, path: str) -> str | None:
        """Читает файл строго как utf-8.

        Явная кодировка обязательна: на Windows дефолт — cp1251, и YAML с
        кириллицей в комментариях не парсится вовсе.
        """
        try:
            return io.open(path, encoding="utf-8").read()
        except OSError as exc:
            self.fail(f"не удалось прочитать {path}: {exc}")
            return None

    def to_mb(self, value: object, where: str) -> float | None:
        """Переводит значение mem_limit в мегабайты.

        Разбирать надо все формы. Падение с ValueError на легитимном значении
        сделало бы сторожа непригодным: поднять порог с `512m` до `1g` после
        замера стало бы нельзя — CI краснел бы трейсбеком.
        """
        if value is None:
            self.fail(f"{where}: mem_limit не задан")
            return None
        if isinstance(value, bool):
            self.fail(f"{where}: mem_limit имеет неожиданный тип bool")
            return None
        if isinstance(value, (int, float)):
            return float(value) / 1024 / 1024
        match = _SIZE_RE.match(str(value).strip())
        if not match:
            self.fail(f"{where}: mem_limit неразбираем ({value!r})")
            return None
        return float(match.group(1)) * _UNIT_TO_MB[match.group(2).lower()]

    def check_limit(self, name: str, conf: dict, minimum: int) -> None:
        where = f"сервис '{name}'"
        actual = self.to_mb(conf.get("mem_limit"), where)
        if actual is not None and actual < minimum:
            self.fail(
                f"{where}: mem_limit {conf['mem_limit']} ниже минимума "
                f"{minimum}m — понижать нельзя, это порог убийства"
            )

    def check_compose(self) -> None:
        raw = self.read(COMPOSE)
        if raw is None:
            return
        try:
            data = yaml.safe_load(raw)
        except yaml.YAMLError as exc:
            self.fail(f"{COMPOSE} не парсится: {exc}")
            return

        services = (data or {}).get("services") or {}
        builds: set[tuple[str, str | None]] = set()

        for name, conf in services.items():
            if not isinstance(conf, dict):
                continue

            build = conf.get("build")
            if build is not None:
                if "image" not in conf:
                    self.fail(
                        f"сервис '{name}': есть 'build:', но нет 'image:' — "
                        f"compose соберёт этот Dockerfile отдельно"
                    )
                if isinstance(build, dict):
                    builds.add((build.get("dockerfile", "Dockerfile"), build.get("target")))
                else:
                    builds.add((str(build), None))

            image = conf.get("image")
            if image is not None:
                image = str(image)
                if not image.startswith("ghcr.io/") and not image.startswith(ALLOWED_EXTERNAL):
                    self.fail(
                        f"сервис '{name}': образ '{image}' не из ghcr.io и не в "
                        f"списке разрешённых сторонних"
                    )

            if name in MIN_MB:
                self.check_limit(name, conf, MIN_MB[name])
            elif name in TGAS_SERVICES:
                self.check_limit(name, conf, TGAS_OVERRIDES.get(name, TGAS_MIN_MB))

        if len(builds) > MAX_UNIQUE_BUILDS:
            listed = ", ".join(sorted(f"{df}:{tgt}" for df, tgt in builds))
            self.fail(
                f"{COMPOSE}: уникальных сборок {len(builds)} > {MAX_UNIQUE_BUILDS} "
                f"({listed})"
            )

    def check_deploy_scripts(self) -> None:
        for path in DEPLOY_FILES:
            raw = self.read(path)
            if raw is None:
                continue
            # Комментарии выкидываем: запрет на `--build` описан словами в этих
            # же файлах, и без очистки сторож краснел бы на предупреждении о
            # самом запрете. По той же причине порядок ищем по коду, а не по
            # тексту — про unify_databases.sql там сказано и в комментарии.
            code = "\n".join(
                line for line in raw.splitlines() if not line.lstrip().startswith("#")
            )

            for bad in FORBIDDEN_SUBSTRINGS:
                if bad in code:
                    self.fail(
                        f"{path}: встречается '{bad}' — сборка на сервере "
                        f"запрещена, образы приходят из GHCR"
                    )

            pull = code.find("compose -f docker-compose.prod.yml pull")
            migration = code.find("unify_databases.sql")
            if pull == -1:
                self.fail(f"{path}: нет `docker compose pull` — образы не обновятся")
            elif migration != -1 and pull > migration:
                self.fail(
                    f"{path}: `pull` идёт после unify_databases.sql — под set -e "
                    f"обрыв скачивания оставит базу мигрированной, а стек лежачим"
                )

    def run(self) -> int:
        self.check_compose()
        self.check_deploy_scripts()
        if self.errors:
            for message in self.errors:
                print(f"ERROR: {message}", file=sys.stderr)
            print(f"\n[FAIL] нарушено правил: {len(self.errors)}", file=sys.stderr)
            return 1
        print("[OK] инварианты развёртывания на месте")
        return 0


def _force_utf8() -> None:
    """Переводит вывод в utf-8.

    В CI stdout и так utf-8, а на Windows он cp1251: русский текст и галочки
    роняли бы сам сторож с UnicodeEncodeError. Проверка, которую нельзя
    запустить локально, перестаёт запускаться вовсе.
    """
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


if __name__ == "__main__":
    _force_utf8()
    sys.exit(Checker().run())
