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

import pytest
import pytest_asyncio

from shared.config import settings


async def _redis():
    """
    Тот же Redis, что у офиса, а не свой адрес из переменной окружения.

    Отдельную `TEST_REDIS_URL` здесь заводить нельзя, и сторож
    `check_env_declared.py` поймал это сразу: переменная, которую код
    читает, обязана быть объявлена, иначе она становится функцией, молча
    выключенной в проде. Заводить объявление ради теста — плата больше
    пользы: ключи здесь свои и убираются за собой.
    """
    import redis.asyncio as redis

    return redis.from_url(settings.redis_url, decode_responses=True)


@pytest_asyncio.fixture
async def live():
    """Живой Redis или пропуск: молча проверять заглушку — обман."""
    from shared import instagram_dm as dm

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


# ── История разговора переживает выкатку ─────────────────────────────────
#
# Словарь в памяти процесса — тот самый антипаттерн, который в проекте уже
# разбирали у витринного бота: каждая выкатка обнуляла все диалоги. В
# директе это заметнее, чем где-либо: разговор растянут на часы, человек
# продолжает начатое, а бот его не помнит и отвечает «с чистого листа».


@pytest_asyncio.fixture
async def memory():
    from shared import chat_memory

    try:
        client = await _redis()
        await client.ping()
        await client.aclose()
    except Exception:
        pytest.skip("Redis недоступен — проверка требует настоящего")

    await chat_memory.forget("instagram_dm", "17841400000000000")
    yield chat_memory
    await chat_memory.forget("instagram_dm", "17841400000000000")


@pytest.mark.asyncio
async def test_dm_history_survives_restart(memory):
    igsid = "17841400000000000"

    await memory.remember("instagram_dm", igsid, "есть руккола?", "Да, 15 000 сум за лоток")

    # «Перезапуск процесса»: у модуля нет своей памяти, читаем из Redis.
    past = await memory.load("instagram_dm", igsid)

    assert len(past) == 2, "разговор не пережил перезапуск"
    assert past[0]["role"] == "user" and "руккола" in past[0]["content"]
    assert past[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_string_and_numeric_id_are_one_conversation(memory):
    """IGSID приходит строкой, а ключ обязан совпасть с числовым."""
    await memory.remember("instagram_dm", "17841400000000000", "привет", "здравствуйте")

    same = await memory.load("instagram_dm", 17841400000000000)

    assert len(same) == 2, (
        "строковый и числовой идентификатор развели по двум ключам — "
        "история потеряется при смене типа у вызывающего"
    )
