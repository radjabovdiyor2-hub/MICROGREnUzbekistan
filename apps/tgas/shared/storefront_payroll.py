"""
💰 STOREFRONT PAYROLL — единственная дверь офиса к зарплате витрины.

ЗАЧЕМ ЭТОТ МОДУЛЬ ПОЯВИЛСЯ

Офис считал фонд оплаты труда сам: `SUM(salary) FROM crm_employees`. У
этой колонки НЕТ НИ ОДНОГО ПИШУЩЕГО МЕСТА во всём репозитории — ни в
вебе, ни в офисе, ни в миграциях. То есть она всегда пуста.

Из-за этого владельцу дважды в месяц приходило уверенное «Фонд: 0 сум»:
25-го от HR-бота и 28-го от финансового. Число выглядело настоящим,
проверять его было нечем, и оно было неверным оба раза.

Зарплата живёт на витрине: `Employee.baseSalary`, `Employee.shiftRate`,
выплаты в `EmployeePayout` и расчёт в `lib/finance/payroll.ts`. Туда и
ходим — как за каталогом и заказами. Второй источник правды о деньгах
человека и был причиной поломки; заводить его заново нельзя.
"""

import logging
import os
from typing import Any, Dict, Optional

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_API_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")

# Напоминание о зарплате не срочный груз: не дошло — скажем честно, что
# не дошло, а висеть в планировщике нельзя.
TIMEOUT_SEC = 10


def _headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if BOT_SECRET:
        headers["x-bot-secret"] = BOT_SECRET
    return headers


def _url(path: str) -> str:
    return f"{STOREFRONT_API_URL.rstrip('/')}{path}"


async def get_payroll(period: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Ведомость витрины за период (ГГГГ-ММ; по умолчанию — текущий месяц).

    Возвращает `None`, если витрина не ответила. НЕ ноль и не пустую
    ведомость: ноль здесь неотличим от «все получили всё», и именно эта
    подмена превращала сломанный запрос в спокойное сообщение владельцу.

    Формат задаёт `/api/admin/payroll`: `rows` по сотрудникам плюс
    `totalAccrued`, `totalPaid`, `totalRemaining`, `payday` и
    `daysToPayday`.
    """
    # Период — ПАРАМЕТРОМ, а не куском адреса. Сверка моста разбирает
    # вызовы статически и на собранной строке спотыкается: адрес
    # `/admin/payroll{query}` она искать не умеет и честно краснеет.
    params = {"period": period} if period else None
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SEC)
        async with aiohttp.ClientSession(headers=_headers(), timeout=timeout) as session:
            async with session.get(_url("/admin/payroll"), params=params) as resp:
                if resp.status != 200:
                    logger.warning("PAYROLL: витрина ответила %s", resp.status)
                    return None
                body = await resp.json(content_type=None)
                if not isinstance(body, dict) or "payroll" not in body:
                    logger.warning("PAYROLL: неожиданный ответ витрины")
                    return None
                return body["payroll"]
    except Exception as exc:
        logger.warning("PAYROLL: ведомость не получена (%s)", exc)
        return None
