"""
Зеркало «витрина → CRM» (`/ingest/order`) — на заглушках, без БД и сети.

Через этот мост проходит КАЖДЫЙ заказ: и оформленный на сайте, и
зарегистрированный менеджером в Telegram (продажу тоже создаёт витрина).
Поэтому его поломка невидима с обеих сторон — сайт здоров, продажа «прошла»,
а CRM пустая. Ровно это и случилось после переименования таблиц: мост писал
в `orders` офисными колонками и падал на каждом заказе.

Проверяем: пишет в crm_*, связывает клиента с витриной, публикует ORDER_CREATED
ровно один раз и не создаёт дубль при повторном вызове.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

import pytest


ORDER = {
    "order_number": "M-20260804-0007",
    "customer": {
        "name": "Zarra Resort",
        "phone": "+998881552557",
        "telegram_id": "847872669",
        "bonus_balance": 0,
        "web_user_id": "clx_user_1",
    },
    "total_amount": 150000,
    "delivery_fee": 0,
    "discount_amount": 0,
    "payment_method": "cash",
    "delivery_address": "Самарканд",
    "items_summary": "Микрозелень Горох x10",
    "items": [
        {
            "storefront_id": "clx_gorokh",
            "name": "Микрозелень Горох",
            "quantity": 10,
            "price": 15000,
        }
    ],
    "notes": "",
}


class FakeRequest:
    def __init__(self, body: dict):
        self._body = body
        self.headers: dict[str, str] = {}

    async def json(self):
        return self._body


class Recorder:
    """Сессия, которая записывает SQL и отвечает правдоподобными строками."""

    def __init__(self, existing_order=None):
        self.sql: list[str] = []
        self._existing_order = existing_order

    async def execute(self, statement, params=None):
        query = " ".join(str(statement).split())
        self.sql.append(query)
        recorder = self

        class Result:
            def scalar(self):
                if "SELECT id FROM crm_orders WHERE notes LIKE" in query:
                    return recorder._existing_order
                if "SELECT id FROM customers" in query:
                    return 77
                if "INSERT INTO customers" in query:
                    return 77
                if "SELECT m.unit FROM crm_products" in query:
                    return "pack"
                if "SELECT id FROM crm_products" in query or "INSERT INTO crm_products" in query:
                    return 5
                return 1

            def fetchone(self):
                if "FROM crm_products" in query:
                    return (5, "pack")
                if "INSERT INTO crm_orders" in query:
                    return (101, "M-20260804-0007")
                # Смена статуса возвращает и customer_id: по нему пересчитываются
                # счётчики клиента. Порядок колонок — как в RETURNING роута,
                # иначе заглушка разойдётся с оригиналом.
                if "UPDATE crm_orders" in query and "RETURNING" in query:
                    return (101, "M-20260804-0007", "cancelled", 77)
                return None

            def fetchall(self):
                return []

        return Result()

    async def commit(self):
        pass

    def wrote_to(self, table: str) -> bool:
        return any(f"INTO {table} " in q or f"UPDATE {table} " in q for q in self.sql)


@pytest.fixture
def office(monkeypatch):
    """Подменяем БД и шину в web_office, возвращаем (recorder, события)."""
    import web_office.main as office_main

    published: list[dict] = []
    recorder = Recorder()

    @asynccontextmanager
    async def fake_ctx():
        yield recorder

    class FakeBus:
        # Сигнатура ровно как у настоящей шины: source_bot — именно так её
        # зовёт web_office, и заглушка не должна расходиться с оригиналом.
        async def publish(self, event_type, data, source_bot="unknown"):
            published.append(
                {"event": event_type, "data": data, "source": source_bot}
            )

    monkeypatch.setattr(office_main, "get_session_ctx", fake_ctx)
    monkeypatch.setattr(office_main, "event_bus", FakeBus())
    monkeypatch.setattr(office_main, "INGEST_SECRET", "")
    monkeypatch.setenv("ENVIRONMENT", "development")
    return office_main, recorder, published


@pytest.mark.asyncio
async def test_mirror_writes_to_crm_tables_not_storefront(office):
    """Зеркало пишет в CRM. Витринные `orders`/`order_items` — не его таблицы."""
    office_main, recorder, _ = office
    response = await office_main.ingest_order(FakeRequest(dict(ORDER)))
    assert response.status_code == 200

    assert recorder.wrote_to("crm_orders")
    assert recorder.wrote_to("crm_order_items")
    joined = " | ".join(recorder.sql)
    assert "INTO orders " not in joined, "заказ витрины трогать нельзя"
    assert "INTO order_items " not in joined


@pytest.mark.asyncio
async def test_mirror_links_customer_to_storefront_user(office):
    """customers.web_user_id — связка карточки CRM с пользователем витрины."""
    office_main, recorder, _ = office
    await office_main.ingest_order(FakeRequest(dict(ORDER)))
    assert any("web_user_id" in q for q in recorder.sql)


@pytest.mark.asyncio
async def test_mirror_updates_customer_stats(office):
    """orders_count / total_spent ведёт зеркало — больше этого не делает никто.

    Считаем ПО ФАКТУ заказов, а не приращением. Здесь стояло приращение
    (`orders_count + 1`), и уменьшать его было некому: отменённый заказ
    навсегда оставался в счётчике и в сумме потраченного.
    """
    office_main, recorder, _ = office
    await office_main.ingest_order(FakeRequest(dict(ORDER)))

    stats = [q for q in recorder.sql if "orders_count" in q and "UPDATE customers" in q]
    assert stats, "зеркало не обновило счётчики клиента"
    sql = " ".join(stats)
    assert "orders_count + 1" not in sql, "счётчик снова приращивается вместо пересчёта"
    assert "COUNT(*)" in sql and "SUM(total_amount)" in sql
    # Отменённые в счётчики не входят — иначе отмена ничего не меняла бы.
    assert "status <> 'cancelled'" in sql


@pytest.mark.asyncio
async def test_cancelling_order_recalculates_customer_stats(office):
    """Отмена заказа обязана пересчитать счётчики клиента.

    Раньше смена статуса не трогала `customers` вовсе: «Потрачено» у клиента
    оставалось завышенным, а на этом числе стоят статус VIP и сортировка
    «лучшие клиенты» в sales_bot.
    """
    office_main, recorder, _ = office
    await office_main.ingest_order_status(
        FakeRequest({"order_number": "M-20260804-0007", "status": "cancelled"})
    )

    assert any(
        "UPDATE customers" in q and "status <> 'cancelled'" in q for q in recorder.sql
    ), "смена статуса не пересчитала счётчики клиента"


@pytest.mark.asyncio
async def test_mirror_publishes_order_created_exactly_once(office):
    """Событие — только отсюда. Второй издатель означал бы двойной доход."""
    office_main, _, published = office
    await office_main.ingest_order(FakeRequest(dict(ORDER)))

    created = [e for e in published if str(e["event"]).lower() == "order_created"]
    assert len(created) == 1
    assert created[0]["data"]["order_number"] == "M-20260804-0007"
    # Получатель читает payload["data"]["..."] — payload обязан быть плоским.
    assert created[0]["data"]["total_amount"] == 150000


@pytest.mark.asyncio
async def test_mirror_is_idempotent(office, monkeypatch):
    """Повторный вызов с тем же номером дубль не создаёт."""
    office_main, recorder, published = office
    recorder._existing_order = 101  # заказ уже перенесён

    response = await office_main.ingest_order(FakeRequest(dict(ORDER)))
    body = json.loads(response.body)

    assert body["status"] == "duplicate"
    assert not recorder.wrote_to("crm_orders")
    assert published == [], "повтор не должен поднимать событие второй раз"

# ── Деловая дата заказа ────────────────────────────────────────────────
#
# Витрина шлёт `created_at` строкой ISO — так её отдаёт `Date.toISOString()`.
# asyncpg проверяет тип ПАРАМЕТРА до того, как Postgres увидит CAST, и на
# строке падает целиком: «expected a datetime instance, got str». Отваливалась
# при этом не дата, а вся вставка — заказ не попадал в CRM вовсе.
#
# Поймано 18.08.2026 прогоном досылки на копии базы, а не чтением кода:
# в SQL стоял `CAST(:created_at AS TIMESTAMP)`, и выглядело это правильно.


def test_business_date_parsed_into_datetime():
    """Строка ISO превращается в datetime — иначе падает вся вставка."""
    from datetime import datetime

    from web_office.main import _parse_business_date

    parsed = _parse_business_date("2026-08-12T18:07:53.911Z")
    assert isinstance(parsed, datetime)
    assert parsed.tzinfo is not None, "момент без зоны Postgres развернёт не в тот пояс"
    assert parsed.year == 2026 and parsed.month == 8 and parsed.day == 12


def test_business_date_without_offset_is_utc():
    """Витрина шлёт UTC. Значение без смещения трактуем так же, а не как местное."""
    from web_office.main import _parse_business_date

    parsed = _parse_business_date("2026-08-12T18:07:53")
    assert parsed is not None and parsed.utcoffset().total_seconds() == 0


def test_business_date_absent_or_broken_falls_back_to_now():
    """Пусто и мусор дают None — в SQL сработает COALESCE(..., NOW())."""
    from web_office.main import _parse_business_date

    assert _parse_business_date(None) is None
    assert _parse_business_date("") is None
    # Мусор не должен ронять приём заказа: дата важна, но заказ важнее.
    assert _parse_business_date("вчера вечером") is None
