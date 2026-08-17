"""Контракт между витриной и витринным ботом.

Бот и витрина живут в разных модулях и общаются только по HTTP, поэтому
переименование ключа в ответе роута ничего не ломает при сборке — оно ломает
бота молча, в проде.

Так и случилось: роут отдавал `reply`, обработчик читал `response`, и каждое
текстовое сообщение в личку получало «Ошибка AI». Ни исключения, ни лога —
с точки зрения обоих модулей всё отработало штатно.

Тест читает оба файла как текст: поднимать Next.js ради проверки имён ключей
не нужно, а сравнить их — нужно.
"""

import re
from pathlib import Path

import pytest

BOT = Path(__file__).resolve().parent.parent
WEB = BOT.parent / "web"

CHAT_ROUTE = WEB / "src/app/api/ai/chat/route.ts"
AI_SELLER = BOT / "handlers/ai_seller.py"


def _route_keys(source: str) -> set[str]:
    """Ключи всех ответов роута: и успешного, и аварийного.

    Клиент не выбирает, какая ветка сработает, поэтому объединение — то, на что
    он вправе рассчитывать, только если ключ есть в КАЖДОЙ ветке. Пересечение
    считаем отдельно ниже.
    """
    keys: set[str] = set()
    for body in re.findall(r"NextResponse\.json\(\{(.*?)\}\s*(?:,|\))", source, re.S):
        keys |= _top_level_keys(body)
    return keys


def _route_key_sets(source: str) -> list[set[str]]:
    return [
        _top_level_keys(body)
        for body in re.findall(r"NextResponse\.json\(\{(.*?)\}\s*(?:,|\))", source, re.S)
    ]


def _top_level_keys(body: str) -> set[str]:
    """`{ reply, source: 'x' }` → {'reply', 'source'}. Вложенность не разбираем."""
    keys = set()
    depth = 0
    current = ""
    for ch in body:
        if ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
        if depth == 0 and ch == ",":
            keys.add(current)
            current = ""
        else:
            current += ch
    keys.add(current)

    out = set()
    for part in keys:
        part = part.strip()
        if not part:
            continue
        name = part.split(":", 1)[0].strip().strip("'\"")
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            out.add(name)
    return out


def _required_reads(source: str) -> set[str]:
    """Ключи, которые бот читает БЕЗ значения по умолчанию.

    `ai_result["reply"]` — обязателен: его отсутствие уронит обработчик.
    `ai_result.get("orderCreated", False)` — необязателен: у кода есть запасной
    путь, и молчаливой поломки не будет.
    """
    return set(re.findall(r'ai_result\[\s*[\'"]([A-Za-z_][A-Za-z0-9_]*)[\'"]\s*\]', source))


@pytest.fixture(scope="module")
def route_source() -> str:
    assert CHAT_ROUTE.exists(), f"роут не найден: {CHAT_ROUTE}"
    return CHAT_ROUTE.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def bot_source() -> str:
    assert AI_SELLER.exists(), f"обработчик не найден: {AI_SELLER}"
    return AI_SELLER.read_text(encoding="utf-8")


def test_route_returns_reply_in_every_branch(route_source: str):
    """Текст ответа обязан быть в каждой ветке, включая аварийную."""
    branches = _route_key_sets(route_source)
    assert branches, "не нашли ни одного NextResponse.json — тест ослеп"

    without_reply = [b for b in branches if "reply" not in b and "error" not in b]
    assert not without_reply, (
        "ветка роута отвечает без 'reply' и без 'error': "
        f"{[sorted(b) for b in without_reply]}"
    )


def test_bot_reads_only_keys_the_route_returns(route_source: str, bot_source: str):
    """Главная проверка: обязательные ключи бота приходят от витрины.

    Именно её не хватало, когда бот читал `response`.
    """
    required = _required_reads(bot_source)
    assert required, "обработчик не читает ни одного ключа обязательным — тест ослеп"

    returned = _route_keys(route_source)
    missing = required - returned
    assert not missing, (
        f"бот читает {sorted(missing)}, а роут таких ключей не отдаёт "
        f"(отдаёт {sorted(returned)}). Это молчаливая поломка личных сообщений."
    )


def test_bot_does_not_read_the_old_key(bot_source: str):
    """`response` — имя, которого у витрины никогда не было."""
    assert 'ai_result.get("response"' not in bot_source
    assert "ai_result.get('response'" not in bot_source


def test_ask_ai_error_paths_use_the_same_key(bot_source: str):
    """Аварийные ответы `ask_ai` должны говорить на языке роута.

    Иначе отказ витрины снова превратится в KeyError или в «Ошибка AI».
    """
    body = bot_source.split("async def ask_ai", 1)[1].split("\n\n\n", 1)[0]
    fallbacks = re.findall(r"return \{\s*[\'\"]([A-Za-z_]+)[\'\"]", body)
    assert fallbacks, "у ask_ai не нашлось аварийных веток — тест ослеп"
    assert set(fallbacks) == {"reply"}, (
        f"аварийные ветки ask_ai отдают {sorted(set(fallbacks))}, а обработчик ждёт 'reply'"
    )


# ══════════════════════════════════════════════════════════════════════
# Ниже — сторожа, добавленные после третьего раунда сверки. Все четыре
# поломки, которые они ловят, прожили в проде месяцами: HTTP-граница молчит,
# обе стороны считают, что отработали штатно, и ни ruff, ни vitest, ни пять
# статических сверок офиса сюда не смотрят.
# ══════════════════════════════════════════════════════════════════════

SHOP = BOT / "handlers/shop.py"
FEATURES = BOT / "handlers/features.py"
CONSTANTS = BOT / "shared/constants.py"
CATALOG = BOT / "services/catalog.py"

ORDERS_ROUTE = WEB / "src/app/api/orders/route.ts"
REVIEWS_ROUTE = WEB / "src/app/api/reviews/route.ts"
CATEGORY_SEO = WEB / "src/lib/seo/categories.ts"


def _read(path: Path) -> str:
    assert path.exists(), f"файл не найден: {path}"
    return path.read_text(encoding="utf-8")


def _code_only(source: str) -> str:
    """Исходник без докстрингов и строчных комментариев.

    Проверки ниже ищут слова в КОДЕ. Без очистки они находят те же слова в
    пояснительных комментариях — и тест краснеет на объяснении бага, а не на
    самом баге.
    """
    body = re.sub(r'"""[\s\S]*?"""', "", source)
    body = re.sub(r"'''[\s\S]*?'''", "", body)
    return "\n".join(
        line for line in body.splitlines() if not line.lstrip().startswith("#")
    )



def test_bot_takes_order_number_from_the_route_envelope():
    """Номер заказа — из ответа витрины, а не выдуманный на месте.

    Роут отдаёт `{success, order: {id, orderNumber, …}}`, а обработчик читал
    ключ `orderId` верхнего уровня — его там нет и не было. `.get(..., default)`
    молча возвращал локальный `uuid4()[:8]`, и клиент с менеджером получали
    номер, которого нет ни в одной таблице.
    """
    route = _read(ORDERS_ROUTE)
    shop = _code_only(_read(SHOP))

    assert "orderNumber" in route, "роут перестал отдавать orderNumber — сверьте обе стороны"
    assert 'get("orderId"' not in shop and "get('orderId'" not in shop, (
        "shop.py снова читает orderId — такого ключа в ответе /api/orders нет"
    )
    assert 'get("orderNumber")' in shop, (
        "shop.py должен брать номер заказа из order.orderNumber"
    )


def test_review_payload_carries_what_the_route_requires():
    """Отзыв из бота содержит поля, без которых роут отвечает 400.

    Бот слал `{rating, orderId, telegramId, author}`, а роут требует
    `productId` и автора (сессия, telegramId бота или guestId): 100% отзывов
    получали 400, ошибку глотал `except`, и клиенту всё равно сообщали
    «Спасибо за оценку! +50 бонусов начислено».
    """
    route = _read(REVIEWS_ROUTE)
    features = _code_only(_read(FEATURES))

    assert "productId" in route
    assert '"productId"' in features, (
        "features.py не шлёт productId — отзыв будет отклонён с 400"
    )
    assert '"telegramId"' in features, (
        "features.py не шлёт telegramId — роут не сможет определить автора"
    )
    assert "+50 бонусов начислено" not in features, (
        "бот снова обещает бонусы за отзыв, которых витрина не начисляет"
    )


def test_category_keys_are_real_slugs():
    """Ключи категорий бота существуют в каталоге витрины.

    Здесь были `MICROGREENS`/`BABY_LEAF`/`SALADS`, а витрина фильтрует по
    слагам `microgreens`/`baby-leaf`/`salads`: каждая кнопка категории
    отвечала «Нет товаров».
    """
    constants = _read(CONSTANTS)
    seo = _read(CATEGORY_SEO)

    # Ключи собираем ЛЮБЫЕ, а не только строчные: иначе возврат к
    # `MICROGREENS` просто не попал бы в выборку и тест остался бы зелёным
    # ровно на той поломке, ради которой написан.
    bot_keys = set(re.findall(r'^\s{4}"([^"]+)":', constants, re.M))
    assert bot_keys, "не нашли ключей CATEGORY_LABELS — тест ослеп"

    web_slugs = set(re.findall(r"slug:\s*'([a-z0-9-]+)'", seo))
    assert web_slugs, "не нашли слагов категорий на витрине — тест ослеп"

    missing = bot_keys - web_slugs
    assert not missing, (
        f"категорий {sorted(missing)} на витрине нет — кнопка отдаст пустой список"
    )


def test_catalog_has_a_single_door():
    """Разбор ответа `/api/products` живёт в одном месте.

    Копий было три, и две разбирали конверт неверно: `isinstance(result, list)`
    при ответе `{items, pagination}` давал пустой список ВСЕГДА — и в
    объединённом меню, и в системном промпте AI-продавца, где из-за этого не
    оказывалось ни одного товара и ни одной цены.
    """
    catalog = _code_only(_read(CATALOG))
    assert '"items"' in catalog or "'items'" in catalog, (
        "services/catalog.py перестал разбирать конверт {items, …}"
    )

    for path in (SHOP, FEATURES, BOT / "handlers/unified.py", BOT / "services/ai_service.py"):
        source = _code_only(_read(path))
        assert "/products" not in source, (
            f"{path.name} снова ходит в /api/products мимо services/catalog"
        )
