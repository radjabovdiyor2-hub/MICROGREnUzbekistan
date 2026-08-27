"""
Сводка по сотрудникам приходит при изменении состава, а не каждый день.

ЗАЧЕМ ЭТОТ ТЕСТ

`employee_report` — плановая задача на 10:00, и сообщение уходило тоже
каждый день. Содержание менялось от найма и увольнения, то есть несколько
раз в год: двадцать девять дней из тридцати владелец получал одно и то же.

Это ровно тот случай, ради которого в проекте есть `shared/alert_once.py`
(«пишем при изменении, а не каждый прогон»). Приучившись пролистывать
плановое, человек пролистывает и тревожное — там же, в шапке модуля, это
записано как причина его появления.

Проверяется поведение, а не текст: неизменившийся состав молчит,
изменившийся звучит, а замер для слоя самообучения снимается ВСЕГДА —
он не сообщение, а данные, и пропуск дня испортил бы ряд.
"""

from __future__ import annotations

import pytest


class FakeBot:
    def __init__(self, sent: list[str]) -> None:
        self._sent = sent
        self.session = FakeSession()

    async def send_message(self, chat_id, text, **kwargs):
        self._sent.append(text)


class FakeSession:
    async def close(self) -> None:
        return None


def _install(monkeypatch, hr, sent: list[str], counts: dict[str, int]):
    """Подменить бота, базу и слой самообучения вокруг `employee_report`."""
    monkeypatch.setattr(hr, "Bot", lambda **kwargs: FakeBot(sent))
    monkeypatch.setattr(
        hr.settings, "admin_telegram_ids", [42], raising=False
    )

    class FakeResult:
        def fetchall(self):
            return list(counts.items())

    class FakeDb:
        async def execute(self, *args, **kwargs):
            return FakeResult()

    class FakeCtx:
        async def __aenter__(self):
            return FakeDb()

        async def __aexit__(self, *exc):
            return False

    import shared.database as database

    monkeypatch.setattr(database, "get_session_ctx", lambda: FakeCtx())


@pytest.mark.asyncio
async def test_unchanged_staff_stays_silent(monkeypatch):
    from shared import alert_once
    from bots.hr_bot import main as hr

    alert_once.reset()
    sent: list[str] = []
    _install(monkeypatch, hr, sent, {"active": 5, "on_leave": 1})

    await hr.employee_report()
    assert len(sent) == 1, "первый прогон обязан рассказать состав"

    await hr.employee_report()
    await hr.employee_report()
    assert len(sent) == 1, (
        "состав не менялся, а сообщения шли: плановый отчёт снова стал "
        "ежедневным шумом"
    )


@pytest.mark.asyncio
async def test_changed_staff_is_reported_same_day(monkeypatch):
    from shared import alert_once
    from bots.hr_bot import main as hr

    alert_once.reset()
    sent: list[str] = []

    _install(monkeypatch, hr, sent, {"active": 5, "on_leave": 1})
    await hr.employee_report()

    # Кто-то ушёл в отпуск — это изменение, и ждать недели оно не должно.
    _install(monkeypatch, hr, sent, {"active": 4, "on_leave": 2})
    await hr.employee_report()

    assert len(sent) == 2, "изменение состава не дошло до владельца"
    assert "4" in sent[1]


@pytest.mark.asyncio
async def test_measurement_is_taken_even_when_message_is_skipped(monkeypatch):
    """Замер — данные, а не сообщение: пропуск дня испортил бы ряд."""
    from shared import alert_once, feedback_loop as fl
    from bots.hr_bot import main as hr

    alert_once.reset()
    sent: list[str] = []
    measured: list[str] = []

    async def fake_evaluate(*, bot, metric, current_data, benchmark_data):
        measured.append(metric)

    monkeypatch.setattr(fl.feedback_loop, "evaluate_and_adapt", fake_evaluate)
    _install(monkeypatch, hr, sent, {"active": 5})

    await hr.employee_report()
    await hr.employee_report()

    assert len(sent) == 1, "сообщение всё-таки продублировалось"
    assert len(measured) == 2, (
        "замер снялся не каждый прогон — ряд самообучения получит дыру"
    )
