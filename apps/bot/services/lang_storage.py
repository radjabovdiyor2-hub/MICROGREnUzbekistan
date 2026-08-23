"""
Язык интерфейса: где он хранится и откуда берётся.

ЧТО БЫЛО

Переключатель в профиле (`features.py::cb_profile_lang`) показывал тост
«✅ Язык изменён» и на этом заканчивался — ни запроса, ни записи. Профиль
читал `language` из витрины, куда бот его никогда не писал, а новые
пользователи заводятся с `uz` — поэтому профиль писал «Oʻzbekcha», а
интерфейс оставался русским.

ГДЕ ХРАНИМ

Рядом с корзиной: тот же Redis, тот же срок жизни, тот же запасной файл.
Язык — это состояние сессии, и терять его при перезапуске нельзя ровно так
же, как корзину.

Витрина остаётся источником правды: выбор зеркалится в `users.language`,
чтобы сайт и бот говорили с человеком одинаково. Но ЧИТАЕМ сначала
локально — язык нужен на каждое сообщение, и ходить за ним по HTTP на
каждую кнопку нельзя.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from shared.i18n import DEFAULT_LANG, normalize

logger = logging.getLogger(__name__)

LANG_FILE = Path(__file__).parent.parent / "data" / "langs.json"
REDIS_PREFIX = "mcg:lang:"
# Тот же срок, что у корзины: человек, вернувшийся через неделю, не должен
# внезапно увидеть другой язык.
REDIS_TTL = 86400 * 7


class LangStorage:
    """Язык пользователя. Redis, если есть; иначе файл."""

    def __init__(self) -> None:
        self._memory: dict[int, str] = {}
        self.client = None
        try:
            from services.cart_storage import cart_storage

            # Переиспользуем уже открытое соединение: второй пул к тому же
            # Redis ради одной строки на пользователя не нужен.
            self.client = getattr(cart_storage, "client", None)
        except Exception as exc:  # noqa: BLE001 — Redis необязателен
            logger.warning("Язык: Redis недоступен, работаем через файл: %s", exc)
        self._load_file()

    # ── Файловый запас ──
    def _load_file(self) -> None:
        try:
            if LANG_FILE.exists():
                raw = json.loads(LANG_FILE.read_text(encoding="utf-8"))
                self._memory = {int(k): v for k, v in raw.items()}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Язык: не удалось прочитать %s: %s", LANG_FILE, exc)

    def _save_file(self) -> None:
        try:
            LANG_FILE.parent.mkdir(parents=True, exist_ok=True)
            LANG_FILE.write_text(
                json.dumps(self._memory, ensure_ascii=False), encoding="utf-8"
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Язык: не удалось записать %s: %s", LANG_FILE, exc)

    # ── Чтение и запись ──
    def get(self, user_id: int, fallback: str | None = None) -> str:
        """
        Язык пользователя.

        `fallback` — то, что знает Telegram (`message.from_user.language_code`).
        Он лучше умолчания: узбекоязычный клиент с первого сообщения увидит
        узбекский, не заходя в настройки.
        """
        if self.client is not None:
            try:
                stored = self.client.get(f"{REDIS_PREFIX}{user_id}")
                if stored:
                    return normalize(stored)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Язык: чтение из Redis не удалось: %s", exc)

        if user_id in self._memory:
            return normalize(self._memory[user_id])

        return normalize(fallback) if fallback else DEFAULT_LANG

    def set(self, user_id: int, lang: str) -> str:
        value = normalize(lang)
        if self.client is not None:
            try:
                self.client.setex(f"{REDIS_PREFIX}{user_id}", REDIS_TTL, value)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Язык: запись в Redis не удалась: %s", exc)
        self._memory[user_id] = value
        self._save_file()
        return value


lang_storage = LangStorage()


def lang_of(event) -> str:
    """
    Язык собеседника.

    Сначала сохранённый выбор, иначе — язык клиента Telegram. Второе важнее,
    чем кажется: узбекоязычный покупатель видит узбекский с первого экрана,
    не заходя в настройки, а до этого весь бот был русским независимо от
    того, на каком языке человек вообще говорит.

    Пять обработчиков держали дословную копию этой функции. Копия — место,
    где расхождение появляется молча: правку в одной никто не перенесёт в
    остальные, и половина бота начнёт отвечать не на том языке.
    """
    user = getattr(event, "from_user", None)
    if user is None:
        return DEFAULT_LANG
    return lang_storage.get(user.id, getattr(user, "language_code", None))
