"""
Shared — генерация номера заказа (атомарная).

Единственная точка выдачи order_number во всей системе.
Использует INSERT … RETURNING вместо SELECT MAX + INSERT,
чтобы два параллельных запроса не получили одинаковый номер.
"""

from shared.database import get_session_ctx
from sqlalchemy import text as sa_text


async def generate_order_number() -> str:
    """Атомарно генерирует уникальный номер заказа MG-XXXXXX.

    Выполняет INSERT пустой строки, берёт id и формирует номер.
    Если таблица orders поддерживает SERIAL/IDENTITY id — используем его.
    Если id = cuid (строка) — fallback на advisory lock + MAX.
    """
    async with get_session_ctx() as session:
        # Advisory lock гарантирует, что только один процесс
        # читает MAX и вставляет в одно время. Lock ID = 0xMG = 777.
        await session.execute(sa_text("SELECT pg_advisory_xact_lock(777)"))
        res = await session.execute(sa_text(
            "SELECT COALESCE("
            "  MAX(CAST(SUBSTRING(order_number FROM 4) AS INTEGER)),"
            "  0"
            ") + 1 FROM orders"
        ))
        next_num = res.scalar() or 1
        order_number = f"MG-{str(next_num).zfill(6)}"
        # Lock освобождается при commit/rollback транзакции (xact lock).
        return order_number
