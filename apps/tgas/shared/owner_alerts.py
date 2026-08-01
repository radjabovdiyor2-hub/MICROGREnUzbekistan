"""
🔔 СИГНАЛЫ ВЛАДЕЛЬЦУ — доставка в веб-админку.
==============================================

У Стёпана дюжина расписаний: здоровье ботов каждые пять минут, KPI-watchdog,
бекап в 03:00, дедлайны. Всё это уходило только в Telegram. Владелец,
работающий в админке, о проблеме не узнавал вовсе.

Здесь — второй канал доставки. Telegram не заменяется: критичное должно
дойти обоими путями.

Правило Джарвиса: сообщать не голый факт, а факт и что с ним делать.
Поэтому у сигнала есть suggested_action в терминах пульта ({action, bot}) —
владелец запускает его одной кнопкой, и оно идёт обычным путём с
подтверждением, а не в обход.

Адрес витрины берётся из настройки: внутри контейнера бота по локальному
адресу её нет.
"""

import logging
import os
from typing import Any, Optional

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api").rstrip("/")
ALERTS_PATH = "/admin/alerts"
TIMEOUT_SECONDS = 8

#: Допустимые уровни. Всё остальное витрина приведёт к "warning".
SEVERITY_INFO = "info"
SEVERITY_WARNING = "warning"
SEVERITY_CRITICAL = "critical"


async def raise_alert(
    kind: str,
    title: str,
    message: str,
    source: str,
    severity: str = SEVERITY_WARNING,
    suggested_action: Optional[dict[str, Any]] = None,
) -> bool:
    """Поднять сигнал владельцу в админке.

    Возвращает True, если витрина приняла. Неудача не должна ронять
    вызывающую задачу: сигнал — это дополнение к работе, а не сама работа.
    Но в лог она попадает обязательно, иначе потеря останется незамеченной.

    :param kind: bot_down | kpi_drop | backup_failed | stock_low | deadline
    :param suggested_action: {"action": "daily_backup", "bot": "devops_bot"}
    """
    payload: dict[str, Any] = {
        "kind": kind,
        "severity": severity,
        "title": title[:255],
        "message": message[:4000],
        "source": source,
    }
    if suggested_action:
        payload["suggestedAction"] = suggested_action

    headers = {
        "Content-Type": "application/json",
        "x-bot-secret": os.getenv("BOT_SECRET", ""),
    }

    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{STOREFRONT_URL}{ALERTS_PATH}", headers=headers, json=payload
            ) as resp:
                if resp.status != 200:
                    logger.error(
                        "Сигнал «%s» не доставлен в админку: витрина ответила %s",
                        kind,
                        resp.status,
                    )
                    return False
                return True
    except Exception as exc:
        logger.error("Сигнал «%s» не доставлен в админку: %s", kind, exc)
        return False
