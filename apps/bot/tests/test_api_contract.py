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
AGRONOMIST = BOT / "handlers/agronomist.py"


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
    assert AGRONOMIST.exists(), f"обработчик не найден: {AGRONOMIST}"
    return AGRONOMIST.read_text(encoding="utf-8")


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
