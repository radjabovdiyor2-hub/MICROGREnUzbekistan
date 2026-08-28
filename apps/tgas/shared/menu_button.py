"""
📌 КНОПКА МЕНЮ БОТА — постоянная дверь в свой раздел админки
=============================================================
Кнопки «Открыть в админке» появились под сообщениями, но у них общий
недостаток: они живут в конкретном сообщении. Через день переписки такое
сообщение уезжает вверх, и владелец снова открывает сайт вручную. Кнопка
меню стоит рядом с полем ввода ВСЕГДА — это и есть постоянная дверь.

Ни у одного бота офиса её не было: `setChatMenuButton` вызывался только у
витринного бота и вёл в магазин.

ПОЧЕМУ ТОЛЬКО ДЛЯ ВЛАДЕЛЬЦА, А НЕ ПО УМОЛЧАНИЮ

Кнопка без `chat_id` меняет меню у ВСЕХ, кто пишет боту. Mini App при этом
пускает по подписи: посторонний упрётся в экран пароля — не дыра, но
обещание двери, которая ему не откроется. Ставим адресно тем, у кого она
работает.

Каждый бот ведёт в СВОЙ раздел: финансы — в баланс, продажи — в заказы,
кадры — в сотрудников. Одна кнопка «в админку вообще» заставляла бы искать
нужный экран глазами — ровно то, от чего уходим.
"""

from __future__ import annotations

import logging
from typing import Optional

from aiogram import Bot
from aiogram.types import MenuButtonWebApp, WebAppInfo

from shared import admin_links
from shared.config import settings

logger = logging.getLogger(__name__)

#: Раздел админки для каждого бота. Ключ — имя из `bot_registry`.
#:
#: Соответствие живёт здесь, а не в реестре ботов: реестр отвечает за то,
#: КТО есть в офисе (порты, контейнеры, юзернеймы), а не за то, какой экран
#: витрины ближе отделу. Смешивать эти два знания в одной таблице значит
#: заставлять реестр меняться при каждой правке админки.
BOT_TABS: dict[str, str] = {
    "stepan_bot": "stats",
    "sales_bot": "orders",
    "support_bot": "departments",
    "hr_bot": "employees",
    "finance_bot": "finance",
    "marketing_bot": "departments",
    "analytics_bot": "analytics",
    "content_bot": "departments",
}

#: На каком отделе открыть экран «Отделы».
#:
#: Десять вкладок dept_* свернулись в один экран с переключателем, и без
#: этой подсказки кнопка бота маркетинга открывала бы отдел продаж —
#: первый в списке. Владелец жал бы её и переключался вручную каждый раз.
BOT_DEPARTMENTS: dict[str, str] = {
    "support_bot": "support",
    "marketing_bot": "marketing",
    "content_bot": "content",
}

#: Подпись кнопки. Короткая: Telegram обрезает длинную без предупреждения.
BUTTON_TEXT = "🏢 Офис"


async def install(bot: Bot, bot_name: str, text: str = BUTTON_TEXT) -> int:
    """Поставить кнопку меню владельцам. Возвращает число чатов, где вышло.

    Никогда не бросает: бот запускается ради работы, а не ради кнопки, и
    падение на старте из-за неё было бы несоразмерным. Но молчать тоже
    нельзя — отсутствие двери потом не с чем связать.
    """
    tab = BOT_TABS.get(bot_name)
    if not tab:
        logger.warning("MENU: у бота %s нет раздела админки — кнопка не ставится", bot_name)
        return 0

    owners: list[int] = list(getattr(settings, "admin_telegram_ids", None) or [])
    if not owners:
        logger.warning("MENU: ADMIN_TELEGRAM_IDS пуст — кнопку меню ставить некому")
        return 0

    url = admin_links.admin_url(tab, BOT_DEPARTMENTS.get(bot_name))
    installed = 0
    for chat_id in owners:
        try:
            await bot.set_chat_menu_button(
                chat_id=chat_id,
                menu_button=MenuButtonWebApp(text=text, web_app=WebAppInfo(url=url)),
            )
            installed += 1
        except Exception as exc:
            # Владелец мог не начинать переписку с этим ботом — Telegram
            # ответит ошибкой, и это нормально, а не авария.
            logger.info("MENU: не поставил кнопку в чат %s (%s): %s", chat_id, bot_name, exc)

    logger.info("MENU: кнопка «%s» → %s поставлена в %d чат(ов)", text, tab, installed)
    return installed


def tab_of(bot_name: str) -> Optional[str]:
    """Раздел админки бота. `None` — у бота своего экрана нет."""
    return BOT_TABS.get(bot_name)
