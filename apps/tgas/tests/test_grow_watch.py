"""
Напоминания о посадках: тексты сводок — на чистых функциях, без БД.

Проверяем то, что решает судьбу партии: правильно ли сводка говорит про
последний день и считает ли убыток. Напоминаний не было вообще — партия
дозревала и списывалась молча, а убыток теперь считается по настоящей
себестоимости, то есть виден в деньгах.
"""

from __future__ import annotations

from shared import grow_watch


def batch(**over):
    b = {
        "id": "b1",
        "crop": "Горошек",
        "trays": 4,
        # Готовая подпись количества: единица зависит от культуры — лотки у
        # микрозелени, стаканчики 63 мм у салата. Сводка не должна описывать
        # партию салата лотками, которых в ней нет.
        "units": "4 лотк.",
        "seed_date": None,
        "cost": 33_600.0,
        "planned_yield": 2000.0,
        "product_name": "Микрозелень гороха",
        "days_left": 5,
    }
    b.update(over)
    return b


def test_salad_batch_is_counted_in_cups_not_trays():
    """Партия салата описывается стаканчиками.

    Салаты растят поштучно в стаканчиках 63 мм, лотков в такой посадке нет
    вовсе — а сводка безусловно писала «лотк.» для любой культуры.
    """
    text_body = grow_watch.morning_text(
        empty_state(ready=[batch(crop="Салат Лолло Росса", units="250 стаканч.")])
    )
    assert "250 стаканч." in text_body
    assert "лотк." not in text_body


def empty_state(**over):
    state = {"ready": [], "urgent": [], "expired": [], "tomorrow": []}
    state.update(over)
    return state


def test_silent_when_nothing_to_report():
    """Пустая сводка не отправляется.

    Ежедневное «посадок нет» приучает пролистывать сообщение не читая —
    и вместе с ним пролистывается день, когда написать было о чём.
    """
    assert grow_watch.morning_text(empty_state()) is None


def test_last_day_is_called_out_explicitly():
    """«Осталось 1 дн.» и «последний день» — разные по действию сообщения."""
    text = grow_watch.morning_text(empty_state(ready=[batch(days_left=1)]))
    assert "последний день" in text
    assert "осталось 1 дн" not in text.lower()


def test_ready_batch_shows_days_left():
    text = grow_watch.morning_text(empty_state(ready=[batch(days_left=4)]))
    assert "Готово к продаже (1)" in text
    assert "осталось 4 дн" in text


def test_expired_reports_real_loss():
    """Убыток — сумма вложенного в партию.

    Раньше на экране всегда стоял «убыток 0 сум»: он считался из costPrice,
    которого до сбора урожая не существует.
    """
    text = grow_watch.morning_text(empty_state(expired=[batch(cost=33_600)]))
    assert "Просрочено (1)" in text
    assert "33 600" in text
    assert "Убыток" in text


def test_tomorrow_is_a_heads_up_not_an_alarm():
    text = grow_watch.morning_text(empty_state(tomorrow=[batch()]))
    assert "Дозреет завтра (1)" in text
    assert "Просрочено" not in text


def test_urgent_message_names_the_stake():
    """Срочное сообщение должно говорить, чем грозит бездействие."""
    text = grow_watch.urgent_text([batch(days_left=1, cost=33_600)])
    assert "Продать сегодня" in text
    assert "33 600" in text
    assert "убытком" in text


def test_urgent_is_silent_without_urgent_batches():
    assert grow_watch.urgent_text([]) is None
