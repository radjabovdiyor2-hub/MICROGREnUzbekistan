"""
Оповещения с памятью: пишем при изменении, а не каждый прогон.

ЗАЧЕМ ЭТИ ТЕСТЫ

Владелец получил лавину сообщений и попросил посчитать, сколько ему шлётся.
Считать оказалось чего: тридцать заданий по расписанию пишут ему, и часть
повторяет одно и то же, пока держится условие — CSAT каждые 2 часа (12 раз в
сутки), крупные расходы и статус доставки по 6, аномалия выручки 4,
просроченные платежи 3.

Одиннадцатое «7 заказов без обратной связи» не несёт новой информации, зато
приучает пролистывать не читая — и настоящая тревога тонет вместе с ним.
"""

from __future__ import annotations

import pytest

from shared import alert_once


@pytest.fixture(autouse=True)
def clean():
    alert_once.reset()
    yield
    alert_once.reset()


def test_first_time_speaks():
    assert alert_once.should_send("csat", "7") is True


def test_same_fingerprint_stays_silent():
    """Двенадцать проверок за сутки — одно сообщение, а не двенадцать."""
    assert alert_once.should_send("csat", "7") is True
    for _ in range(11):
        assert alert_once.should_send("csat", "7") is False


def test_changed_fingerprint_speaks():
    alert_once.should_send("csat", "7")
    assert alert_once.should_send("csat", "9") is True


def test_reminder_after_a_day(monkeypatch):
    """Проблема, которая висит сутки, обязана напомнить о себе.

    Иначе «пишем только при изменении» превращается в «замолчали навсегда»:
    условие держится, сообщений нет, и о нём просто забывают.
    """
    clock = {"now": 1_000_000.0}
    monkeypatch.setattr(alert_once.time, "time", lambda: clock["now"])

    assert alert_once.should_send("csat", "7") is True
    clock["now"] += 23 * 3600
    assert alert_once.should_send("csat", "7") is False
    clock["now"] += 2 * 3600
    assert alert_once.should_send("csat", "7") is True


def test_returning_problem_speaks_again():
    """Ушло и вернулось с тем же числом — это НОВОЕ событие.

    Без `resolved` возврат выглядел бы как «ничего не изменилось», и о
    вернувшейся проблеме владелец не узнал бы вовсе.
    """
    assert alert_once.should_send("csat", "7") is True
    alert_once.resolved("csat")
    assert alert_once.should_send("csat", "7") is True


def test_keys_do_not_interfere():
    assert alert_once.should_send("finance.overdue", "1,2") is True
    assert alert_once.should_send("support.csat", "1,2") is True
    assert alert_once.should_send("finance.overdue", "1,2") is False


# ── Память переживает выкладку ───────────────────────────────────────────
#
# Состояние жило только в памяти процесса, и это было записано как
# осознанный размен: «после выкладки бот один раз повторит оповещение».
#
# Размен перестал сходиться, когда на `alert_once` села сводка по
# сотрудникам с недельным окном: мержей в main бывает по четыре за сутки,
# то есть «раз в неделю» превращалось в «при каждой выкатке», и молчание,
# ради которого всё делалось, не наступало никогда.


class FakeRedis:
    """Хеш в памяти. Тот же интерфейс, что нужен `alert_once`."""

    def __init__(self, data=None, fail=False):
        self.data = dict(data or {})
        self.fail = fail
        self.closed = False

    async def hgetall(self, key):
        if self.fail:
            raise ConnectionError("redis недоступен")
        return dict(self.data)

    async def hset(self, key, field, value):
        self.data[field] = value

    async def hdel(self, key, field):
        self.data.pop(field, None)

    async def aclose(self):
        self.closed = True


@pytest.mark.asyncio
async def test_state_survives_restart(monkeypatch):
    """Перезапуск процесса не заставляет повод прозвучать заново."""
    import time as _time

    from shared import alert_once

    store = FakeRedis({"hr:staff": f"5/0/1/6|{_time.time()}"})
    monkeypatch.setattr(alert_once, "_client", lambda: store)

    alert_once.reset()
    loaded = await alert_once.load()

    assert loaded == 1
    # Тот же состав после перезапуска — молчим, как будто не перезапускались.
    assert alert_once.should_send("hr:staff", "5/0/1/6", remind_after_hours=24 * 7) is False
    # Изменившийся — звучит.
    assert alert_once.should_send("hr:staff", "4/0/2/6", remind_after_hours=24 * 7) is True


@pytest.mark.asyncio
async def test_stale_entries_are_dropped_on_load(monkeypatch):
    """Повод месячной давности — мусор, а не «висящая проблема»."""
    import time as _time

    from shared import alert_once

    old = _time.time() - 40 * 24 * 3600
    store = FakeRedis({"support.csat": f"7|{old}"})
    monkeypatch.setattr(alert_once, "_client", lambda: store)

    alert_once.reset()
    loaded = await alert_once.load()

    assert loaded == 0
    assert alert_once.should_send("support.csat", "7") is True


@pytest.mark.asyncio
async def test_unavailable_redis_does_not_silence_alerts(monkeypatch):
    """Redis лежит — работаем по памяти процесса, а не молчим."""
    from shared import alert_once

    store = FakeRedis(fail=True)
    monkeypatch.setattr(alert_once, "_client", lambda: store)

    alert_once.reset()
    loaded = await alert_once.load()

    assert loaded == 0
    # Лишнее оповещение дешевле пропущенного.
    assert alert_once.should_send("support.csat", "7") is True


@pytest.mark.asyncio
async def test_broken_record_is_ignored(monkeypatch):
    """Испорченная запись не роняет загрузку целиком."""
    from shared import alert_once
    import time as _time

    store = FakeRedis({
        "good": f"7|{_time.time()}",
        "broken": "без-времени",
    })
    monkeypatch.setattr(alert_once, "_client", lambda: store)

    alert_once.reset()
    assert await alert_once.load() == 1
