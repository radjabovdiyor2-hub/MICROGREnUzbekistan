"""
Цепь продажи целиком — на заглушках, без БД, Redis и сети.

Это то, что нельзя проверить ни компиляцией, ни сверкой схемы: КУДА уходит
продажа и что при этом НЕ происходит. Каждая проверка соответствует поломке,
которая уже случалась:

  · продажа писалась своим SQL в таблицу витрины и падала («не смог записать
    продажу в БД») — теперь заказ создаёт только витрина;
  · ORDER_CREATED публиковался и здесь, и зеркалом — доход считался дважды;
  · при недоступной витрине заказ уходил в обход, и базы разъезжались.
"""

from __future__ import annotations

import pytest

from shared import sales_ops


LINE = {
    "product_id": "clx_gorokh",
    "name": "Микрозелень Горох",
    "unit": "pack",
    "quantity": 10,
    "unit_price": 15000,
    "total_price": 150000,
}


@pytest.fixture
def chain(monkeypatch):
    """Подменяем всё внешнее, собираем вызовы витрины и события шины."""
    calls = {"create": [], "status": [], "events": [], "customer": []}

    async def fake_resolve(items):
        return {"resolved": [dict(LINE)]}

    async def fake_seen(fingerprint):
        return None

    async def fake_remember(fingerprint, order_number):
        calls.setdefault("remembered", []).append(order_number)

    async def fake_upsert(name, phone, ctype, by):
        calls["customer"].append({"name": name, "phone": phone, "type": ctype})
        # Третий элемент — телефон, известный CRM. По умолчанию карточка пустая:
        # тесты, которым нужен номер из CRM, подменяют эту функцию своей.
        return 77, True, phone

    async def fake_create(**kwargs):
        calls["create"].append(kwargs)
        return {"ok": True, "order": {"id": "clx_order", "orderNumber": "M-20260804-0007"}}

    async def fake_status(order_id, status=None, payment_status=None):
        calls["status"].append((order_id, status, payment_status))
        return {"ok": True, "order": {}}

    monkeypatch.setattr(sales_ops, "_resolve_items", fake_resolve)
    monkeypatch.setattr(sales_ops, "_seen_recently", fake_seen)
    monkeypatch.setattr(sales_ops, "_remember_sale", fake_remember)
    monkeypatch.setattr(sales_ops, "_upsert_customer", fake_upsert)
    monkeypatch.setattr(sales_ops.storefront_orders, "create_order", fake_create)
    monkeypatch.setattr(sales_ops.storefront_orders, "update_status", fake_status)

    # Если кто-то попробует опубликовать событие — заметим.
    import shared.event_bus as event_bus_module

    async def fake_publish(event, data, source=None):
        calls["events"].append(event)

    monkeypatch.setattr(event_bus_module.event_bus, "publish", fake_publish)
    return calls


@pytest.mark.asyncio
async def test_sale_goes_to_storefront_once(chain):
    """Продажа — это ровно один заказ витрины с позициями из каталога."""
    result = await sales_ops.register_sale(
        {
            "customer_name": "Zarra Resort",
            "phone": "+998881552557",
            "customer_type": "b2b",
            "items": [{"product": "горох", "quantity": 10, "unit_price": 15000}],
        }
    )

    assert result["status"] == "ok"
    assert result["data"]["order_number"] == "M-20260804-0007"

    assert len(chain["create"]) == 1, "продажа обязана быть одним заказом"
    payload = chain["create"][0]
    assert payload["customer_name"] == "Zarra Resort"
    assert payload["items"] == [
        {"id": "clx_gorokh", "price": 15000, "quantity": 10}
    ], "в витрину уходит cuid товара и цена, о которой сказал менеджер"


@pytest.mark.asyncio
async def test_sale_does_not_publish_order_created(chain):
    """ORDER_CREATED шлёт зеркало /ingest/order — иначе доход посчитают дважды."""
    await sales_ops.register_sale(
        {
            "customer_name": "Zarra",
            "phone": "+998881552557",
            "items": [{"product": "горох", "quantity": 10}],
        }
    )
    assert chain["events"] == [], f"лишние события: {chain['events']}"


@pytest.mark.asyncio
async def test_paid_sale_gets_delivered_status(chain):
    """Менеджер сообщает о СОСТОЯВШЕЙСЯ продаже — заказ не должен висеть в PENDING."""
    await sales_ops.register_sale(
        {
            "customer_name": "Zarra",
            "phone": "+998881552557",
            "items": [{"product": "горох", "quantity": 10}],
            "payment_status": "paid",
        }
    )
    assert chain["status"] == [("clx_order", "delivered", "paid")]


@pytest.mark.asyncio
async def test_storefront_down_means_sale_not_registered(chain, monkeypatch):
    """Витрина недоступна — отказ, и НИЧЕГО не пишется в обход."""

    async def failing_create(**kwargs):
        chain["create"].append(kwargs)
        return {"ok": False, "error": "витрина недоступна (timeout)"}

    monkeypatch.setattr(sales_ops.storefront_orders, "create_order", failing_create)

    result = await sales_ops.register_sale(
        {
            "customer_name": "Zarra",
            "phone": "+998881552557",
            "items": [{"product": "горох", "quantity": 10}],
        }
    )

    assert result["status"] == "error"
    assert "НЕ записал" in result["message"]
    assert chain["status"] == [], "статус не трогаем — заказа нет"
    assert chain["events"] == [], "события не шлём — продажи не было"


@pytest.mark.asyncio
async def test_duplicate_is_refused(chain, monkeypatch):
    """Та же продажа в окне дедупликации — второй заказ не создаём."""

    async def already_seen(fingerprint):
        return "M-20260804-0007"

    monkeypatch.setattr(sales_ops, "_seen_recently", already_seen)

    result = await sales_ops.register_sale(
        {"customer_name": "Zarra", "items": [{"product": "горох", "quantity": 10}]}
    )

    assert result["status"] == "duplicate"
    assert chain["create"] == [], "повторная продажа не должна дойти до витрины"


@pytest.mark.asyncio
async def test_customer_card_is_created_before_the_order(chain):
    """Карточку клиента заводим до заказа: зеркало найдёт её по телефону и
    дополнит, а не создаст вторую — уже как b2c."""
    await sales_ops.register_sale(
        {
            "customer_name": "Zarra Resort",
            "phone": "+998881552557",
            "customer_type": "b2b",
            "items": [{"product": "горох", "quantity": 10}],
        }
    )
    assert chain["customer"] == [
        {"name": "Zarra Resort", "phone": "+998881552557", "type": "b2b"}
    ]


@pytest.mark.asyncio
async def test_phone_is_taken_from_the_customer_card(chain, monkeypatch):
    """Менеджер диктует продажу постоянному клиенту без номера — берём из CRM.

    «Зарегистрируй продажу 15 гороха ресторан Жасмин» — обычная формулировка, и
    телефон у такого клиента давно записан. Раньше карточка находилась по имени,
    но функция возвращала только id: номер выбрасывался, витрина отвечала 400.
    """

    async def upsert_with_known_phone(name, phone, ctype, by):
        chain["customer"].append({"name": name, "phone": phone, "type": ctype})
        return 77, False, phone or "+998901112233"

    monkeypatch.setattr(sales_ops, "_upsert_customer", upsert_with_known_phone)

    result = await sales_ops.register_sale(
        {
            "customer_name": "Ресторан Жасмин",
            "customer_type": "b2b",
            "items": [{"product": "горох", "quantity": 15, "unit_price": 15000}],
        }
    )

    assert result["status"] == "ok"
    assert len(chain["create"]) == 1
    assert chain["create"][0]["phone"] == "+998901112233"


@pytest.mark.asyncio
async def test_sale_without_any_phone_asks_instead_of_failing(chain):
    """Телефона нет нигде — спрашиваем, а не отправляем витрине заведомый брак.

    Пустой phone витрина отклоняет с «Shaxsiy ma'lumotlar to'liq emas», и раньше
    этот узбекский код уходил руководителю вместе с советом «повторите позже» —
    хотя повтор давал ровно тот же отказ.
    """
    result = await sales_ops.register_sale(
        {
            "customer_name": "Новый клиент",
            "customer_type": "b2b",
            "items": [{"product": "горох", "quantity": 15, "unit_price": 15000}],
        }
    )

    assert result["status"] == "clarify"
    assert result["data"]["needs"] == "phone"
    assert "телефон" in result["message"].lower()
    assert chain["create"] == [], "заведомо отклоняемый заказ витрине не шлём"


def test_storefront_refusal_is_explained_in_russian():
    """Код витрины переводится, и повтор советуется только когда он поможет."""
    deterministic = sales_ops._storefront_refusal_message(
        "Shaxsiy ma'lumotlar to'liq emas"
    )
    assert "данных клиента" in deterministic
    assert "тот же отказ" in deterministic
    assert "ma'lumotlar" not in deterministic, "узбекский код не должен утечь в чат"

    transient = sales_ops._storefront_refusal_message("витрина недоступна (timeout)")
    assert "повторите" in transient.lower()
