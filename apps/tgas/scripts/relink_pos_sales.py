"""Перепривязка кассовых чеков в CRM к настоящим клиентам.

ЗАЧЕМ ЭТОТ СКРИПТ

Касса витрины давала выбрать покупателя, честно писала его в
`pos_sales.customer_id` — и на этом всё заканчивалось. В зеркало
`/ingest/order` покупатель не передавался вовсе: имя было захардкожено
строкой «Покупатель в магазине», и офис по имени находил одну и ту же
фиктивную карточку.

Следствие: ВСЕ продажи за прилавком, включая продажи конкретному ресторану,
скопились на одной карточке, а у настоящих клиентов `crm_orders` не
появилось — то есть `orders_count`, `total_spent` и `last_order_date` у них
не двигались, история заказов оставалась пустой, а точка на карте не меняла
ни цвет (сегмент), ни размер (выручка).

Данные при этом не потеряны: `pos_sales.customer_id` заполнялся всё это
время, а номер чека (`S-…`) и есть `crm_orders.order_number`. По этой паре
история восстанавливается однозначно.

ПОЧЕМУ СКРИПТ ЖИВЁТ В ОФИСЕ

`crm_orders` и `customers` принадлежат AI-офису — витрина их только читает.
Здесь же лежит и `customer_repo.recalc_stats`, которым считаются счётчики:
второй копии той же формулы быть не должно.

ЗАПУСК

    python -m scripts.relink_pos_sales            # только отчёт, ничего не меняет
    python -m scripts.relink_pos_sales --apply    # записать

Возвраты (`R-…`) привязываются к клиенту ИСХОДНОГО чека: у старых возвратов
своего покупателя нет — витрина его не проставляла.
"""

import argparse
import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from shared import customer_repo  # noqa: E402
from shared.database import get_session_ctx  # noqa: E402

# Чеки кассы и их зеркала в CRM. `pos_sales` — таблица витрины, читаем её
# и только её: писать туда офис не имеет права.
#
# `orig` — исходная продажа для возврата. Возврат наследует покупателя от
# неё: `COALESCE` берёт своего, если он уже проставлен (новые возвраты), и
# чужого, если нет (все, что были до этой правки).
FIND_SQL = """
SELECT co.id,
       co.order_number,
       co.customer_id                                  AS current_cid,
       COALESCE(ps.customer_id, orig.customer_id)      AS target_cid
FROM crm_orders co
JOIN pos_sales ps        ON ps.number = co.order_number
LEFT JOIN pos_sales orig ON orig.id = ps.refund_of_id
WHERE COALESCE(ps.customer_id, orig.customer_id) IS NOT NULL
  AND co.customer_id IS DISTINCT FROM COALESCE(ps.customer_id, orig.customer_id)
ORDER BY co.id
"""

NAMES_SQL = "SELECT id, COALESCE(company_name, name, '—') FROM customers WHERE id = ANY(:ids)"

# Карточка, на которую валились все анонимные чеки.
#
# ПОЧЕМУ ОНА НЕ ПЕРЕИМЕНОВЫВАЕТСЯ
#
# Заманчиво назвать её «Розничный покупатель» — по смыслу это она и есть.
# Но имя тут не подпись, а КЛЮЧ: у анонимной продажи нет ни `customer_id`,
# ни телефона, ни telegram, и `customer_repo.upsert` находит карточку
# последней ступенью — нечётким совпадением по имени. Переименуй её, и
# следующая же продажа без покупателя заведёт вторую такую же, а через
# неделю их будет три.
#
# Поэтому имя остаётся ключом, а опознаётся карточка полями: `source='pos'`
# говорит, откуда она взялась, `customer_type='b2c'` — что это розница, а не
# заведение. Деньги чужих клиентов с неё уже сняты перепривязкой выше.
RETAIL_NAME = "Покупатель в магазине"

RETAIL_SQL = """
UPDATE customers
   SET source = 'pos', customer_type = 'b2c'
 WHERE name = :name
   AND (source IS DISTINCT FROM 'pos' OR customer_type <> 'b2c')
"""


async def mark_retail_card(session, apply: bool) -> int:
    """Пометить карточку розницы. Возвращает число тронутых строк."""
    found = (
        await session.execute(
            text("SELECT COUNT(*) FROM customers WHERE name = :name"), {"name": RETAIL_NAME}
        )
    ).scalar() or 0
    if not found:
        return 0

    if not apply:
        print(f"Карточка розницы («{RETAIL_NAME}»): будет помечена source=pos, тип b2c")
        return int(found)

    result = await session.execute(text(RETAIL_SQL), {"name": RETAIL_NAME})
    return int(result.rowcount or 0)


async def relink(apply: bool) -> int:
    """Отчёт, а при `apply` — и запись. Возвращает число затронутых чеков."""
    async with get_session_ctx() as session:
        rows = (await session.execute(text(FIND_SQL))).fetchall()

        if not rows:
            print("Перепривязывать нечего: все кассовые чеки уже у своих клиентов.")
            marked = await mark_retail_card(session, apply)
            if apply and marked:
                await session.commit()
                print(f"Карточка розницы помечена (строк: {marked}).")
            return 0

        # Пересчитать надо ОБЕ стороны: и того, кому чек уходит, и того, у
        # кого он был. Иначе фиктивная карточка навсегда останется VIP-ом с
        # чужими деньгами.
        touched: set[int] = set()
        for row in rows:
            if row[2] is not None:
                touched.add(int(row[2]))
            touched.add(int(row[3]))

        names = dict(
            (await session.execute(text(NAMES_SQL), {"ids": list(touched)})).fetchall()
        )

        print(f"Чеков к перепривязке: {len(rows)}")
        for row in rows:
            was = names.get(row[2], "нет клиента") if row[2] is not None else "нет клиента"
            # Стрелка ASCII-я намеренно: консоль Windows у владельца работает
            # в cp1251, и «→» роняет скрипт UnicodeEncodeError прямо посреди
            # отчёта — при том, что перепривязку он уже посчитал.
            print(f"  {row[1]}: {was} -> {names.get(row[3], row[3])}")

        if not apply:
            await mark_retail_card(session, apply)
            print("\nЭто отчёт. Для записи: python -m scripts.relink_pos_sales --apply")
            return len(rows)

        for row in rows:
            await session.execute(
                text("UPDATE crm_orders SET customer_id = :cid WHERE id = :id"),
                {"cid": int(row[3]), "id": int(row[0])},
            )

        for customer_id in sorted(touched):
            await customer_repo.recalc_stats(session, customer_id)

        marked = await mark_retail_card(session, apply)

        await session.commit()
        print(f"\nГотово. Пересчитано карточек: {len(touched)}")
        if marked:
            print(f"Карточка розницы помечена (строк: {marked}).")
        return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Перепривязка кассовых чеков в CRM")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="записать изменения (без флага — только отчёт)",
    )
    args = parser.parse_args()
    asyncio.run(relink(args.apply))


if __name__ == "__main__":
    main()
