"""
🔗 ССЫЛКИ В АДМИНКУ — единственная дверь к публичному адресу витрины
=====================================================================
Оповещения владельцу были плоским текстом. Он читал «Удалить задачу #95
безвозвратно — 115 ч» и упирался в тупик: карточку с кнопками надо было
искать вручную выше по переписке, а чтобы посмотреть саму задачу — открыть
сайт, ввести пароль и найти нужную вкладку глазами среди сорока семи.
Ни одной кнопки `url=` или `web_app=` во всём офисе не было; единственный
веб-переход вёл на корень сайта.

Здесь строится адрес вида `/admin?tab=<вкладка>&focus=<предмет>`, по которому
админка открывается сразу на нужном экране (`useAdminTab.ts` на витрине).

КУДА ВЕСТИ — ЗНАЕТ САМ ИНСТРУМЕНТ

Соответствие «действие → экран» живёт в поле `Tool.admin_tab` рядом с самим
инструментом, а не таблицей здесь. Вторая копия разошлась бы с реестром ровно
так же, как разошлись юзернеймы ботов, и половина ссылок вела бы не туда.
Здесь только то, чего в реестре офиса нет: типы заявок, не связанные с
инструментом, и write-инструменты витрины (они объявлены в TypeScript).

ПОЧЕМУ ДВА ВИДА КНОПОК

`web_app` открывает админку прямо внутри Telegram и пускает владельца без
пароля (витрина проверяет подпись initData). Но Bot API разрешает `web_app`
в inline-клавиатуре ТОЛЬКО в личной переписке, а карточки подтверждения
уходят и в групповые чаты задач — там Telegram отклонит сообщение целиком.
Поэтому в группе кнопка обычная, `url`.
"""

from __future__ import annotations

import html
import logging
from typing import Any, Dict, Optional, Tuple
from urllib.parse import quote

from aiogram.types import InlineKeyboardButton, WebAppInfo

from shared.config import settings

logger = logging.getLogger(__name__)

#: Куда вести заявки, у которых нет инструмента офиса.
#: `storefront_write` разбирается отдельно — у него есть имя инструмента витрины.
KIND_TABS: Dict[str, str] = {
    "content_publish": "dept_content",
    "meeting_plan": "tasks",
}

#: Write-инструменты витрины (`apps/web/src/lib/stepan/writeTools*.ts`).
#: Их `Tool` живёт в TypeScript, поля `admin_tab` у него нет — здесь единственное
#: место, где офис знает про их экраны.
STOREFRONT_TOOL_TABS: Dict[str, str] = {
    "add_product": "products",
    "change_product_price": "products",
    "create_task": "tasks",
    "deactivate_learning": "learnings",
    "dispatch_bot_action": "bot_control",
    "register_sale": "orders",
    "set_setting": "settings",
    "toggle_bot_job": "bot_control",
    "update_order_status": "orders",
}

#: Вкладка «Ждёт решения». Неизвестный тип ведёт сюда, а не в никуда:
#: очередь заявок — верный ответ на «что от меня хотят» в любом случае.
FALLBACK_TAB = "approvals"


def base_url() -> str:
    """Публичный адрес витрины без хвостового слэша."""
    return str(getattr(settings, "public_web_url", "") or "").rstrip("/")


def admin_url(tab: str, focus: Optional[str] = None) -> str:
    """Адрес экрана админки. `focus` — конкретная запись на нём."""
    url = f"{base_url()}/admin?tab={quote(str(tab or FALLBACK_TAB), safe='')}"
    if focus not in (None, ""):
        url += f"&focus={quote(str(focus), safe='')}"
    return url


def target_for(kind: str, payload: Optional[Dict[str, Any]]) -> Tuple[str, Optional[str]]:
    """Вкладка и предмет действия для заявки. Пустого ответа не бывает."""
    data = payload or {}
    tool_name = str(data.get("tool") or "")
    args = data.get("args") if isinstance(data.get("args"), dict) else {}

    if tool_name:
        tab, focus_arg = _tool_target(tool_name)
        if tab:
            focus = args.get(focus_arg) if focus_arg else None
            return tab, (str(focus) if focus not in (None, "") else None)

    return KIND_TABS.get(str(kind or ""), FALLBACK_TAB), None


def _tool_target(tool_name: str) -> Tuple[str, str]:
    """(вкладка, имя аргумента для focus) по имени инструмента."""
    try:
        from shared import tools as tool_registry

        tool = tool_registry.by_name(tool_name)
        if tool is not None and tool.admin_tab:
            return tool.admin_tab, tool.admin_focus_arg
    except Exception as exc:  # реестр не должен ронять отправку оповещения
        logger.warning("ADMIN_LINKS: реестр инструментов недоступен: %s", exc)

    return STOREFRONT_TOOL_TABS.get(tool_name, ""), ""


def link(text: str, kind: str, payload: Optional[Dict[str, Any]]) -> str:
    """Строка-гиперссылка для текста сообщения (parse_mode=HTML)."""
    tab, focus = target_for(kind, payload)
    return f'<a href="{html.escape(admin_url(tab, focus), quote=True)}">{html.escape(str(text))}</a>'


def is_private_owner_chat(chat_id: Optional[int]) -> bool:
    """Личка владельца — единственное место, где уместен `web_app`.

    Идентификаторы групп в Telegram отрицательные, личные — положительные.
    Владельца сверяем отдельно: Mini App пускает в админку без пароля, и
    предлагать эту дверь кому-то ещё незачем.
    """
    if not chat_id or int(chat_id) <= 0:
        return False
    ids = getattr(settings, "admin_telegram_ids", None) or []
    return int(chat_id) in ids


def open_button(
    text: str,
    kind: str,
    payload: Optional[Dict[str, Any]],
    chat_id: Optional[int],
) -> InlineKeyboardButton:
    """Кнопка «открыть в админке» — Mini App в личке владельца, ссылка иначе."""
    tab, focus = target_for(kind, payload)
    url = admin_url(tab, focus)
    if is_private_owner_chat(chat_id):
        return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url))
    return InlineKeyboardButton(text=text, url=url)


def tab_button(text: str, tab: str, chat_id: Optional[int]) -> InlineKeyboardButton:
    """То же самое, но вкладка задана прямо — без разбора заявки."""
    url = admin_url(tab)
    if is_private_owner_chat(chat_id):
        return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url))
    return InlineKeyboardButton(text=text, url=url)
