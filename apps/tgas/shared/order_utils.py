"""
Shared — генерация номера CRM-заказа (атомарная).

Номер обычного заказа выдаёт витрина: она владелец заказов, и её номер
(`M-YYYYMMDD-XXXX`) виден клиенту, в админке и в зеркале CRM. Этот генератор
нужен только для строк, которых на витрине нет и не будет: локальный черновик,
когда витрина недоступна, и LEAD/manual с неопределённой суммой.

Формат остаётся `MG-XXXXXX`, чтобы такие строки было видно невооружённым глазом.

Считаем по `crm_orders`, а не по `orders`: после объединения баз имя `orders`
принадлежит витрине, где номер выглядит как `M-20260803-0042`. Прежний запрос
брал из него подстроку с четвёртого символа и приводил к INTEGER — на витринном
номере это падало с ошибкой приведения типа. Поэтому и таблица другая, и в
выборку берутся только номера нашего формата.
"""

from shared.database import get_session_ctx
from sqlalchemy import text as sa_text


async def generate_order_number() -> str:
    """Атомарно генерирует уникальный номер CRM-заказа MG-XXXXXX.

    Advisory lock гарантирует, что два процесса не прочитают один и тот же MAX.
    Блокировка снимается при commit/rollback транзакции (xact lock).
    """
    async with get_session_ctx() as session:
        await session.execute(sa_text("SELECT pg_advisory_xact_lock(777)"))
        res = await session.execute(
            sa_text(
                "SELECT COALESCE("
                "  MAX(CAST(SUBSTRING(order_number FROM 4) AS INTEGER)),"
                "  0"
                ") + 1 FROM crm_orders "
                "WHERE order_number ~ '^MG-[0-9]+$'"
            )
        )
        next_num = res.scalar() or 1
        return f"MG-{str(next_num).zfill(6)}"
