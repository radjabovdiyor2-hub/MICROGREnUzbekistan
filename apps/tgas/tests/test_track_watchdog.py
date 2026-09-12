"""
Сторож пишет только тому, у кого сегодня открыта смена.

ЗАЧЕМ ЭТОТ ТЕСТ

Сторож брал всех активных сотрудников с Telegram и напоминал каждому, что
«смена не записывается», — включая тех, у кого выходной, больничный или
работа на складе. Про таблицу смен он не знал ничего.

Ошибка тихая: лишнее сообщение выглядит как работающая система, а не как
поломка. Заметить её можно было только по тому, что напоминания перестают
читать — вместе с нужными.

Теперь состояние смены приходит вместе со сводкой (`state`), и решение
«писать или молчать» вынесено в `track_nudge`, чтобы его можно было
проверить без Telegram и без базы.
"""

from __future__ import annotations

import pytest

from bots.sales_bot.main import TRACK_HINT, owner_alert, plan_watchdog, track_nudge


def person(state: str, silent_min: int | None = None, idle_min: int | None = None) -> dict:
    return {
        "telegramId": "555",
        "name": "Азиз",
        "state": state,
        "silentMin": silent_min,
        "idleMin": idle_min,
    }


def text_of(person_dict: dict) -> str | None:
    """Текст без повода — там, где проверяются слова, а не причина."""
    nudge = track_nudge(person_dict)
    return None if nudge is None else nudge[1]


def test_no_shift_no_message() -> None:
    """Выходной — не повод для напоминания."""
    assert track_nudge(person("off")) is None


def test_ok_state_is_quiet() -> None:
    """Точки идут — сторожу сказать нечего."""
    assert track_nudge(person("ok", 3)) is None


def test_unknown_state_is_quiet() -> None:
    """Витрина ответила незнакомым словом — молчим, а не гадаем."""
    assert track_nudge(person("puzzle")) is None
    assert track_nudge({}) is None


def test_open_shift_without_points_says_shift_is_running() -> None:
    """Смена идёт, а маршрута нет — это и есть повод написать."""
    text = text_of(person("never"))

    assert text is not None
    assert "Смена идёт" in text
    # Прежний текст «Смена не записывается» приходил и человеку без смены;
    # новый утверждает, что смена открыта, — и это утверждение обязано
    # опираться на состояние, а не на список штата.
    assert "Смена не записывается" not in text
    assert TRACK_HINT in text


def test_broken_broadcast_names_the_minutes() -> None:
    """Прервавшаяся трансляция — другой случай и другие слова."""
    text = text_of(person("silent", 42))

    assert text is not None
    assert "прервалась" in text
    assert "42" in text
    assert TRACK_HINT in text


def test_two_states_do_not_share_wording() -> None:
    """Разные состояния — разные сообщения, иначе их не различить."""
    assert text_of(person("never")) != text_of(person("silent", 42))


@pytest.mark.parametrize("state", ["never", "silent"])
def test_hint_mentions_both_ways_to_record(state: str) -> None:
    """У человека может не быть Telegram — второй способ обязан звучать."""
    text = text_of(person(state, 42))

    assert text is not None
    assert "Транслировать" in text
    assert "админку" in text


# ─── Простой: человек на связи, но стоит ────────────────────────────────
#
# Этого случая в коде не существовало вовсе. Всё, что называлось
# молчанием, меряло отсутствие СВЯЗИ — телефон, честно транслирующий с
# дивана, читался как «на связи», и вопроса не возникало.


def test_standing_still_is_asked_about_separately() -> None:
    """Стоит на месте — свой повод и свои слова."""
    reason, text = track_nudge(person("ok", 2, idle_min=40))

    assert reason == "idle"
    assert "40" in text
    assert "не у клиента" in text


def test_standing_still_is_a_question_not_a_charge() -> None:
    """Сорок минут — это вопрос: обед, очередь и поломка выглядят так же."""
    _, text = track_nudge(person("ok", 2, idle_min=40))

    assert "Всё в порядке?" in text
    assert "не отметка о нарушении" in text


def test_idle_and_silence_do_not_share_a_reason() -> None:
    """Повод у простоя свой: по нему считается повтор и эскалация."""
    idle = track_nudge(person("ok", 2, idle_min=40))
    silent = track_nudge(person("silent", 42))

    assert idle is not None and silent is not None
    assert idle[0] != silent[0]
    assert idle[1] != silent[1]


def test_no_idle_no_question() -> None:
    """Не стоит — не спрашиваем."""
    assert track_nudge(person("ok", 2, idle_min=None)) is None
    assert track_nudge(person("ok", 2, idle_min=0)) is None


def test_idle_off_shift_stays_quiet() -> None:
    """Выходной остаётся выходным, даже если телефон лежит на месте."""
    assert track_nudge(person("off", None, idle_min=90)) is None


# ─── Владельцу — вторым и по делу ───────────────────────────────────────


def test_owner_alert_names_person_and_case() -> None:
    reason, _ = track_nudge(person("ok", 2, idle_min=40))
    title, message = owner_alert(person("ok", 2, idle_min=40), reason, delivered=True)

    assert "Азиз" in title
    assert "40" in title
    assert "ничего не изменилось" in message


def test_owner_alert_does_not_blame_the_unreachable() -> None:
    """«Не отреагировал» про того, кто сообщения не видел, — неправда."""
    title, message = owner_alert(person("silent", 42), "silent", delivered=False)

    assert "ничего не изменилось" not in message
    assert "заблокировал" in message
    assert "Азиз" in title


def test_owner_alert_distinguishes_standing_from_silence() -> None:
    """Стоит и молчит — разные поводы и в сигнале владельцу тоже."""
    standing, _ = owner_alert(person("ok", 2, idle_min=40), "idle", delivered=True)
    silent, _ = owner_alert(person("silent", 42), "silent", delivered=True)

    assert standing != silent
    assert "на одном месте" in standing
    assert "трансляция прервалась" in silent


# ─── Порядок: сотрудник, круг ожидания, владелец ────────────────────────


def test_first_pass_writes_to_the_employee_only() -> None:
    """Первый круг — разговор с человеком, без владельца."""
    outbox, escalate = plan_watchdog([person("never")], {}, {})

    assert [row[0] for row in outbox] == ["555"]
    assert escalate == []


def test_owner_hears_only_when_nothing_changed() -> None:
    """Написали, прошёл круг, состояние прежнее — теперь это к владельцу."""
    nudged = {"555": "never"}
    outbox, escalate = plan_watchdog([person("never")], nudged, {})

    # Повторно человеку не пишем: то же сообщение каждые полчаса перестают
    # читать вместе с нужными.
    assert outbox == []
    assert [(row[0], row[1]) for row in escalate] == [("555", "never")]


def test_owner_hears_once_per_reason_per_day() -> None:
    """Владельцу — раз на пару «день + повод», а не каждые полчаса."""
    outbox, escalate = plan_watchdog([person("never")], {"555": "never"}, {"555": "never"})

    assert outbox == []
    assert escalate == []


def test_new_reason_starts_the_conversation_again() -> None:
    """Молчал, потом встал — это другой повод, и говорим снова с человеком."""
    # Владельцу о молчании уже сообщали; простой — новый случай.
    outbox, escalate = plan_watchdog(
        [person("ok", 2, idle_min=40)], {"555": "silent"}, {"555": "silent"}
    )

    assert [(row[0], row[1]) for row in outbox] == [("555", "idle")]
    assert escalate == []


def test_day_off_reaches_neither() -> None:
    """У человека выходной — молчат оба канала."""
    assert plan_watchdog([person("off")], {}, {}) == ([], [])


def test_person_without_telegram_is_skipped() -> None:
    """Без telegram_id писать некуда — и владельцу это не новость."""
    faceless = person("never")
    faceless["telegramId"] = ""

    assert plan_watchdog([faceless], {}, {}) == ([], [])


# ══════════════════════════════════════════════════════════════════════
# Объезд не сдвинулся: вопрос сотруднику среди дня.
#
# ЗАЧЕМ ОТДЕЛЬНО ОТ МОЛЧАНИЯ. Человек может быть полностью на связи и при
# этом не отметить ни одной точки — телефон шлёт крошки, а работа стоит.
# Это третий вопрос, и задавать его надо третьим: если человека не слышно,
# разговор сначала об этом.
#
# ПОЧЕМУ «НОЛЬ ЗА ПОЛСМЕНЫ», А НЕ ДОЛЯ. Доля пересматривала бы решение,
# принятое в `planOutcome.ts`: «половина точек в четыре часа дня — это
# обычный рабочий день, а не срыв».
# ══════════════════════════════════════════════════════════════════════


def field_day(
    *,
    plan_total: int = 8,
    plan_done: int = 0,
    route_total: int = 0,
    route_done: int = 0,
    half: bool = True,
    state: str = "ok",
) -> dict:
    out = person(state)
    out.update(
        planTotal=plan_total,
        planDone=plan_done,
        routeTotal=route_total,
        routeDone=route_done,
        planHalfDay=half,
    )
    return out


def test_no_marks_after_half_a_shift_is_asked_about() -> None:
    reason, text = track_nudge(field_day())
    assert reason == "plan"
    assert "8 точек" in text
    # ВОПРОС, А НЕ ЗАМЕЧАНИЕ: он может ехать и не отмечать.
    assert "?" in text


def test_first_hour_of_a_shift_stays_quiet() -> None:
    """Полсмены ещё не прошло — спрашивать не о чем."""
    assert track_nudge(field_day(half=False)) is None


def test_one_mark_is_enough_to_stay_quiet() -> None:
    """Работа сдвинулась. Доля выполнения среди дня — не наш вопрос."""
    assert track_nudge(field_day(plan_done=1)) is None


def test_delivery_marks_count_too() -> None:
    """У совмещённого агента рейс — та же работа, что и объезд."""
    assert track_nudge(field_day(plan_total=0, route_total=5, route_done=2)) is None


def test_nothing_assigned_nothing_to_ask() -> None:
    """Ни объезда, ни рейса — вопроса нет."""
    assert track_nudge(field_day(plan_total=0, route_total=0)) is None


def test_silence_is_discussed_before_the_plan() -> None:
    """Человека не слышно — говорим про связь, а не про отметки.

    Держит это не порядок проверок, а условие `state == "ok"`: про объезд
    спрашиваем только у того, чьи крошки идут. У молчащего вопрос другой —
    и задавать оба за один прогон значит превратить сторожа в шум.
    """
    quiet = field_day(state="silent")
    quiet["silentMin"] = 40

    reason, _ = track_nudge(quiet)
    assert reason == "silent"


def test_plan_is_discussed_before_standing_still() -> None:
    """Стоит на месте и ничего не отметил — спрашиваем про работу."""
    standing = field_day()
    standing["idleMin"] = 45

    reason, _ = track_nudge(standing)
    assert reason == "plan"


def test_owner_hears_about_the_plan_in_his_own_words() -> None:
    title, body = owner_alert(field_day(), "plan", delivered=True)
    assert "Азиз" in title
    assert "8 точек" in title
    assert "ни одной отметки" in body
