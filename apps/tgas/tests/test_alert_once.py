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
