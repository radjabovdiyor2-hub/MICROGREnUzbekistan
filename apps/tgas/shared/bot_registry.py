"""shared/bot_registry.py — Единый реестр ботов.

Раньше состав команды был вписан в шести местах: ALL_BOTS в shared/health.py,
карта host:port в shared/event_bus.py, docker-compose.yml, docker-compose.prod.yml,
start_all.ps1 и start_all.bat. Списки расходились молча, и это стоило двух
реальных инцидентов: analytics_bot импортировал start_heartbeat, но не вызывал
его (бот работал, а мониторинг показывал «НЕ ЗАПУЩЕН»), а franchise отсутствовал
в прод-compose и просто не разворачивался на сервер.

Теперь это единственный источник для Python-кода. Compose-файлы и start_all.*
живут отдельно (их не импортируешь), поэтому сверку делает
`python scripts/check_bot_roster.py`.

Порт — это порт aiohttp-слушателя event_bus (`/event`). У n8n_bridge его нет:
он только читает файловую очередь bot_bus и наружу ничего не слушает.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class BotInfo:
    """Описание одного сервиса-бота."""

    name: str
    """Имя модуля и ключ пульса: bots/<name>/main.py, bot:heartbeat:<name>."""

    container: str
    """Имя контейнера в docker-compose — оно же DNS-имя внутри сети mg_net."""

    port: Optional[int]
    """Порт слушателя event_bus. None — бот наружу не слушает."""

    title: str
    """Человеческое название для админки и отчётов."""

    department: Optional[str] = None
    """Значение поля `department` в задачах, которые принимает бот.

    None — бот делегированных задач не принимает. Это не пробел, а
    осознанное решение: franchise_bot — планировщик суточных сводок, на
    event_bus он не подписан. Отделы pm/operations/production/logistics
    своего бота не имеют — их задачи принимает Stepan (он же PM/COO).
    """

    telegram: bool = True
    """Есть ли у бота Telegram-интерфейс. Служебные воркеры — без него."""


BOTS: tuple[BotInfo, ...] = (
    BotInfo("stepan_bot", "mg_stepan", 8081, "Стёпан (CEO/PM)", "pm"),
    BotInfo("sales_bot", "mg_sales", 8082, "Продажи", "sales"),
    BotInfo("support_bot", "mg_support", 8083, "Поддержка", "support"),
    BotInfo("hr_bot", "mg_hr", 8084, "Кадры (HR)", "hr"),
    BotInfo("finance_bot", "mg_finance", 8085, "Финансы", "finance"),
    BotInfo("marketing_bot", "mg_marketing", 8086, "Маркетинг", "marketing"),
    BotInfo("analytics_bot", "mg_analytics", 8088, "Аналитика", "analytics"),
    BotInfo("content_bot", "mg_content", 8089, "Контент", "content"),
    BotInfo("qa_bot", "mg_qa", 8090, "QA / Качество", "qa", telegram=False),
    BotInfo("rnd_bot", "mg_rnd", 8091, "R&D", "rnd", telegram=False),
    BotInfo("devops_bot", "mg_devops", 8092, "DevOps / IT", "devops", telegram=False),
    BotInfo("franchise_bot", "mg_franchise", 8093, "Франшиза", None, telegram=False),
    BotInfo("n8n_bridge", "mg_n8n_bridge", None, "n8n мост", None, telegram=False),
)

# Порт 8087 исторически зарезервирован за pm_bot. Отдельного бота нет:
# роль PM исполняет Стёпан. Не занимайте порт, чтобы не путать карты.

ALL_BOTS: list[str] = [b.name for b in BOTS]

BY_NAME: dict[str, BotInfo] = {b.name: b for b in BOTS}

#: Резервный канал прямой доставки event_bus, когда Redis Pub/Sub недоступен.
EVENT_ENDPOINTS: list[tuple[str, int]] = [
    (b.container, b.port) for b in BOTS if b.port is not None
]


def get(name: str) -> Optional[BotInfo]:
    """Найти бота по имени. Принимает и 'sales', и 'sales_bot'."""
    if name in BY_NAME:
        return BY_NAME[name]
    return BY_NAME.get(f"{name}_bot")


def department_bot(department: str) -> Optional[BotInfo]:
    """Какой бот обслуживает отдел.

    Сравнение регистронезависимое: диспетчер присылал department='QA', а
    боты сравнивали с 'qa' напрямую — задача молча терялась.
    """
    dept = (department or "").lower()
    for bot in BOTS:
        if bot.department == dept:
            return bot
    return None
