"""
Отметка «сообщение обработано» переживает перезапуск.

Опрос директа идёт каждые три минуты и берёт сообщения за последние
десять. Отметки жили в памяти процесса — выкатка внутри этого окна (а
мержей в main бывает по четыре за сутки) стирала их, и те же сообщения
разбирались заново: клиент получал второй ответ, а если в сообщении был
заказ, заказ создавался ВТОРОЙ РАЗ.

Проверка идёт против НАСТОЯЩЕГО Redis, если он доступен: заглушка здесь
доказала бы только то, что я правильно написал заглушку, а всё свойство
держится на атомарности `SET NX`.
"""

from __future__ import annotations

import os

import pytest
import pytest_asyncio

REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/9")


async def _redis():
    import redis.asyncio as redis

    return redis.from_url(REDIS_URL, decode_responses=True)


@pytest_asyncio.fixture
async def live(monkeypatch):
    """Живой Redis или пропуск: молча проверять заглушку — обман."""
    from shared import instagram_dm as dm
    from shared.config import settings

    monkeypatch.setattr(settings, "redis_url", REDIS_URL, raising=False)
    try:
        client = await _redis()
        await client.ping()
    except Exception:
        pytest.skip("Redis недоступен — проверка требует настоящего")

    await client.delete(dm._seen_key("m1"), dm._seen_key("m2"))
    await client.aclose()
    dm._processed_message_ids.clear()
    yield dm

    client = await _redis()
    await client.delete(dm._seen_key("m1"), dm._seen_key("m2"))
    await client.aclose()
    dm._processed_message_ids.clear()


@pytest.mark.asyncio
async def test_mark_is_exclusive(live):
    assert await live._mark_seen("m1") is True, "первую отметку ставим мы"
    assert await live._mark_seen("m1") is False, "вторая отметка — уже не наша"


@pytest.mark.asyncio
async def test_mark_survives_restart(live):
    await live._mark_seen("m1")

    # «Перезапуск процесса»: память чистая, Redis помнит.
    live._processed_message_ids.clear()

    assert await live._already_seen("m1") is True, (
        "после перезапуска сообщение снова считается новым — клиент получит "
        "второй ответ, а заказ создастся дважды"
    )
    assert await live._mark_seen("m1") is False


@pytest.mark.asyncio
async def test_unknown_message_is_not_seen(live):
    assert await live._already_seen("m2") is False
