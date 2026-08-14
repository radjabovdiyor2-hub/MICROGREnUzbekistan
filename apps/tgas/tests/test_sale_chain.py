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

from shared import customer_repo, sales_ops


LINE = {
    "product_id": "clx_gorokh",
    "name": "Микрозелень Горох",
    "unit": "pack",
    "quantity": 10,
    "unit_price": 15000,
    "total_price": 150000,
}


def customer_card(**overrides):
    """Карточка клиента в том виде, в каком её отдаёт customer_repo."""
    card = {
        "id": 77,
        "name": "Ресторан Жасмин",
        "company_name": "Ресторан Жасмин",
        "phone": "+998901112233",
        "phone_display": "+998 90 111-22-33",
        "telegram_id": None,
        "telegram_username": None,
        "customer_type": "b2b",
        "company_type": "restaurant",
        "status": "active",
        "city": "Samarqand",
        "total_spent": 0.0,
        "bonus_balance": 0.0,
        "orders_count": 3,
        "last_order_date": None,
        "source": "manual",
        "web_user_id": None,
        "notes": None,
    }
    card.update(overrides)
    return card


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

    # По умолчанию клиента в CRM нет — тесты, которым нужна карточка,
    # подменяют customer_repo.resolve своим ответом.
    async def fake_customer_resolve(name, phone=None):
        return {}

    # И похожих тоже нет. Без этой заглушки `similar()` лезла бы в настоящую
    # базу; ошибку подключения глотал бы запасной путь «pg_trgm не установлен»,
    # и тест проходил бы по неверной причине — молча, ничего не проверив.
    async def fake_similar(name, limit=5):
        calls.setdefault("similar", []).append(name)
        return []

    monkeypatch.setattr(customer_repo, "similar", fake_similar)

    async def fake_upsert(name, phone, ctype, by, customer_id=None, match_by_name=True):
        calls["customer"].append(
            {"name": name, "phone": phone, "type": ctype, "id": customer_id}
        )
        return customer_id or 77, customer_id is None, phone

    monkeypatch.setattr(customer_repo, "resolve", fake_customer_resolve)

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
        {"name": "Zarra Resort", "phone": "+998881552557", "type": "b2b", "id": None}
    ]


@pytest.mark.asyncio
async def test_phone_is_taken_from_the_customer_card(chain, monkeypatch):
    """Менеджер диктует продажу постоянному клиенту без номера — берём из CRM.

    «Зарегистрируй продажу 15 гороха ресторан Жасмин» — обычная формулировка, и
    телефон у такого клиента давно записан. Спрашивать его второй раз незачем.
    """

    async def resolve_known(name, phone=None):
        return {"customer": customer_card()}

    monkeypatch.setattr(customer_repo, "resolve", resolve_known)

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
    assert chain["customer"][0]["id"] == 77, "пишем в найденную карточку, не в новую"


@pytest.mark.asyncio
async def test_known_customer_is_not_asked_for_a_phone(chain, monkeypatch):
    """Клиент найден нечётким поиском — вопроса о телефоне быть не должно.

    Именно здесь ломалось наблюдаемое поведение: «Ресторан Жасмин» не находил
    карточку «Жасмин», потому что имя сравнивалось точным `ILIKE :n` без
    процентов. Продажа отвечала «Shaxsiy ma'lumotlar to'liq emas» и заводила
    вторую карточку тому же ресторану.
    """

    async def resolve_by_word(name, phone=None):
        assert "жасмин" in name.lower()
        return {"customer": customer_card(name="Жасмин")}

    monkeypatch.setattr(customer_repo, "resolve", resolve_by_word)

    result = await sales_ops.register_sale(
        {
            "customer_name": "ресторан жасмин",
            "items": [{"product": "горох", "quantity": 43, "unit_price": 15000}],
        }
    )

    assert result["status"] == "ok", result.get("message")
    assert result["data"]["customer_created"] is False


@pytest.mark.asyncio
async def test_several_candidates_ask_instead_of_guessing(chain, monkeypatch):
    """Под запрос подходит несколько карточек — спрашиваем, а не берём первую.

    Молча выбранный «не тот Жасмин» обнаружился бы только при разборе долгов.
    """

    async def resolve_ambiguous(name, phone=None):
        return {
            "candidates": [
                customer_card(id=77, name="Жасмин"),
                customer_card(id=91, name="Ресторан Жасмин"),
            ]
        }

    monkeypatch.setattr(customer_repo, "resolve", resolve_ambiguous)

    result = await sales_ops.register_sale(
        {
            "customer_name": "жасмин",
            "items": [{"product": "горох", "quantity": 25, "unit_price": 15000}],
        }
    )

    assert result["status"] == "clarify"
    assert result["data"]["needs"] == "customer"
    assert [c["id"] for c in result["data"]["candidates"]] == [77, 91]
    assert chain["create"] == [], "до выбора клиента заказ не создаём"
    assert chain["customer"] == [], "и карточку тоже не заводим"


@pytest.mark.asyncio
async def test_picked_customer_is_not_searched_again(chain, monkeypatch):
    """После выбора кнопкой ищем не по имени, а по id — иначе выбор потерялся бы.

    Повторный поиск по тому же имени снова вернул бы список кандидатов, и
    уточнение зациклилось бы на том же вопросе.
    """

    async def resolve_must_not_run(name, phone=None):
        raise AssertionError("после выбора карточки поиск по имени не нужен")

    async def by_id(customer_id):
        assert customer_id == 91
        return customer_card(id=91, name="Ресторан Жасмин")

    monkeypatch.setattr(customer_repo, "resolve", resolve_must_not_run)
    monkeypatch.setattr(customer_repo, "by_id", by_id)

    result = await sales_ops.register_sale(
        {
            "customer_name": "жасмин",
            "customer_id": 91,
            "items": [{"product": "горох", "quantity": 25, "unit_price": 15000}],
        }
    )

    assert result["status"] == "ok"
    assert chain["customer"][0]["id"] == 91


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
    assert chain["customer"] == [], (
        "карточку тоже не заводим: раньше отказ на этом шаге оставлял в базе "
        "клиента без телефона, и следующая попытка с чуть иным написанием "
        "имени добавляла к нему второго такого же сироту"
    )


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


# ── Количество не выдумываем (инцидент 10.08.2026) ──────────────────────
#
# «Продажа ресторан жасмин микрозелень гороха» — количество не звучало вовсе,
# а `_normalize_items` подставляла 1.0. Продажа ушла в базу: доход учтён,
# остаток списан, в чате зелёная галочка. Выдумка, выглядящая как успех,
# хуже честного отказа — отказ хотя бы видно.


@pytest.mark.asyncio
async def test_sale_without_quantity_asks_instead_of_assuming_one(chain, monkeypatch):
    """Не назвали сколько — вопрос, и НИ ОДНОГО заказа в витрине."""

    async def resolve_without_quantity(items):
        return {"resolved": [dict(LINE, quantity=None, total_price=None)]}

    monkeypatch.setattr(sales_ops, "_resolve_items", resolve_without_quantity)

    result = await sales_ops.register_sale(
        {
            "customer_name": "ресторан жасмин",
            "items": [{"product": "микрозелень гороха"}],
        }
    )

    assert result["status"] == "clarify"
    assert result["data"]["needs"] == "quantity"
    assert chain["create"] == [], "заказ создан на выдуманном количестве"
    # В заявке уже сопоставленный товар: при дозаписи «горох» не превратится
    # вдруг в другую позицию каталога.
    assert result["data"]["pending"]["items"][0]["product_id"] == LINE["product_id"]


@pytest.mark.asyncio
async def test_quantity_named_goes_through_without_questions(chain):
    """Количество назвали — работает как раньше, вопроса нет."""
    result = await sales_ops.register_sale(
        {
            "customer_name": "Zarra Resort",
            "phone": "+998881552557",
            "items": [{"product": "горох", "quantity": 10}],
        }
    )
    assert result["status"] == "ok"
    assert len(chain["create"]) == 1


def test_missing_quantity_survives_normalisation():
    """`_normalize_items` не подставляет единицу вместо «не сказали»."""
    items = sales_ops._normalize_items({"product": "горох"})
    assert items[0]["quantity"] is None


# ── Похожий клиент: спросить, а не завести второго ──────────────────────


@pytest.mark.asyncio
async def test_similar_customer_is_asked_about_not_duplicated(chain, monkeypatch):
    """«ресторан жасмин» при существующем «Жасмин» → вопрос, а не дубль.

    Поиск промахнулся (иначе вернул бы карточку), но похожий в базе есть.
    Завести вторую карточку молча — значит развести историю заказов и долги
    одного ресторана на два лица; замечают это на сверке, месяцем позже.
    """

    async def one_similar(name, limit=5):
        return [customer_card(id=42, name="Жасмин")]

    monkeypatch.setattr(customer_repo, "similar", one_similar)

    result = await sales_ops.register_sale(
        {
            "customer_name": "ресторан жасмин",
            "items": [{"product": "горох", "quantity": 10}],
        }
    )

    assert result["status"] == "clarify"
    assert result["data"]["needs"] == "customer"
    assert [c["id"] for c in result["data"]["candidates"]] == [42]
    assert chain["create"] == [], "заказ ушёл до ответа руководителя"
    # Вопрос про ОДНОГО похожего звучит иначе, чем про нескольких: «это он?»,
    # а не «выберите из списка».
    assert "Жасмин" in result["message"]


@pytest.mark.asyncio
async def test_truly_new_customer_is_created_without_questions(chain):
    """Ничего похожего нет — заводим молча. Уточняем, только когда не уверены."""
    result = await sales_ops.register_sale(
        {
            "customer_name": "Ресторан Навруз",
            "phone": "+998901234567",
            "items": [{"product": "горох", "quantity": 5}],
        }
    )
    assert result["status"] == "ok"
    assert chain["similar"] == ["Ресторан Навруз"]


# ── Продажа без товара и вопрос о цене ──────────────────────────────────
#
# Оба случая — из той же переписки, где «Клиент <имя>, <номер>,
# ЗАРЕГИСТРИРУЙ» ушло в register_sale с выдуманной позицией «микрозелень».


@pytest.mark.asyncio
async def test_sale_without_items_asks_what_was_sold():
    """Позиций нет — спрашиваем «что продали», а не падаем и не выдумываем.

    `items` перестал быть обязательным в схеме инструмента именно ради этого:
    пока он требовался, модель обязана была назвать хоть какой-нибудь товар,
    даже когда речь шла о заведении клиента.
    """
    result = await sales_ops.register_sale(
        {"customer_name": "Ахмад Каримов", "items": []}
    )
    assert result["status"] == "clarify"
    assert "Что именно продали" in result["message"]


def test_items_is_not_required_by_the_sale_tool():
    """Схема инструмента не должна вынуждать модель выдумывать позицию."""
    from shared import tools as tool_registry

    tool = tool_registry.by_name("register_sale")
    assert tool is not None
    assert "items" not in tool.required
    assert "customer_name" in tool.required


@pytest.mark.asyncio
async def test_unknown_product_says_it_needs_a_price(monkeypatch):
    """«Товара нет в каталоге. Назовите цену» — с пометкой, чего ждут.

    Ключа `needs` здесь не было вовсе, поэтому `sale_ui.remember_open` писал
    пустую строку: ответить на этот вопрос текстом было нечем, а в клавиатуре
    кнопки ввода цены нет, пока цена неизвестна. Работала только «✖️ Отмена».
    """

    async def nothing_found(name):
        return {}

    monkeypatch.setattr(sales_ops.catalog_repo, "resolve", nothing_found)

    result = await sales_ops.register_sale(
        {
            "customer_name": "Ресторан Жасмин",
            "items": [{"product": "санго-2", "quantity": 5}],
        }
    )
    assert result["status"] == "clarify"
    assert result["data"]["needs"] == "price"
    assert "Назовите цену" in result["message"]


@pytest.mark.asyncio
async def test_ambiguous_product_needs_a_product_not_a_price(monkeypatch):
    """Товар нашёлся, но не один — спрашиваем ТОВАР, а не цену."""

    async def two_candidates(name):
        return {
            "candidates": [
                {"id": "p_m", "name": "Руккола", "price": 15000, "unit": "лоток"},
                {"id": "p_b", "name": "Руккола", "price": 25000, "unit": "100 г"},
            ]
        }

    monkeypatch.setattr(sales_ops.catalog_repo, "resolve", two_candidates)

    result = await sales_ops.register_sale(
        {
            "customer_name": "Ресторан Жасмин",
            "items": [{"product": "руккола", "quantity": 5}],
        }
    )
    assert result["status"] == "clarify"
    assert result["data"]["needs"] == "product"
