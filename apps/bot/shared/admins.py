"""
Кто здесь владелец — один список на весь бот.

ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Разбор `ADMIN_CHAT_ID` был выписан дважды —
в `handlers/admin.py` и в `handlers/start.py`, — и оба раза с одним и тем же
запасным значением: конкретным Telegram-аккаунтом, вписанным в исходники.
Это не секрет, это ПРАВА: стоило переменной окружения оказаться пустой (новый
сервер, опечатка в имени, перезапуск без .env), и админка бота доставалась
одному конкретному человеку — тому, чей id остался в коде.

Пустое значение теперь означает «админов нет». Отказ в правах видно сразу и
чинится одной строкой в .env; молчаливая выдача прав не видна вообще.

Бот при этом продолжает обслуживать покупателей: он для них и написан, и
отсутствие ADMIN_CHAT_ID — не повод закрывать магазин.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def _parse(raw: str) -> list[int]:
    out: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except ValueError:
            # Мусор в списке не должен молча превращаться в «админов нет»:
            # тогда правда о правах осталась бы только в переменной окружения.
            logger.error("ADMIN_CHAT_ID: «%s» — не число, пропускаю", part)
    return out


ADMIN_IDS: list[int] = _parse(os.getenv("ADMIN_CHAT_ID", ""))

if not ADMIN_IDS:
    logger.warning(
        "ADMIN_CHAT_ID не задан — админ-команды бота недоступны никому. "
        "Это осознанный отказ: раньше здесь стоял вписанный в код id владельца."
    )


def is_admin(user_id: int) -> bool:
    """Владелец ли. Пустой список = нет, и это безопасная сторона ошибки."""
    return user_id in ADMIN_IDS
