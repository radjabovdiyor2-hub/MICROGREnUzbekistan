"""
Плановые отчёты аналитики приходят одним сообщением.

ЗАЧЕМ ЭТОТ ТЕСТ

Аналитика слала владельцу три ПЛАНОВЫХ отчёта в сутки в разное время:
воронка конверсии в 15:00, воронка B2B в 16:00, KPI дня в 20:00. Ни один из
них не требовал действия прямо сейчас — это картина дня, а не сигнал.

Владелец уже жаловался на лавину сообщений (см. `shared/alert_once.py`), и
три отчёта из пятнадцати-двадцати — заметная её часть. Приучившись
пролистывать плановое, человек пролистывает и тревожное.

Проверяется поэтому не текст отчёта, а ЧИСЛО СООБЩЕНИЙ и то, что аномалия
выручки осталась отдельным, немедленным сигналом.
"""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_three_reports_become_one_message(monkeypatch):
    from bots.analytics_bot import main as analytics

    sent: list[str] = []

    class FakeBot:
        async def send_message(self, chat_id, text, **kwargs):
            sent.append(text)

    async def fake_conversion():
        analytics._daily_parts.append("воронка конверсии")

    async def fake_b2b():
        analytics._daily_parts.append("воронка B2B")

    async def fake_kpi():
        analytics._daily_parts.append("KPI дня")

    monkeypatch.setattr(analytics, "_bot", FakeBot())
    # В тестовой среде список владельцев пуст, и отправка падала бы
    # IndexError внутри `try` — то есть тест проверял бы не то.
    monkeypatch.setattr(analytics.settings, "admin_telegram_ids", [1], raising=False)
    monkeypatch.setattr(analytics, "conversion_funnel", fake_conversion)
    monkeypatch.setattr(analytics, "b2b_funnel_report", fake_b2b)
    monkeypatch.setattr(analytics, "daily_kpi_snapshot", fake_kpi)

    await analytics.daily_digest()

    assert len(sent) == 1, f"плановых сообщений должно быть одно, стало {len(sent)}"
    for part in ("воронка конверсии", "воронка B2B", "KPI дня"):
        assert part in sent[0], f"«{part}» потерялась по дороге"


@pytest.mark.asyncio
async def test_one_broken_report_does_not_kill_the_rest(monkeypatch):
    """Отчёт, который не собрался, не должен уносить с собой остальные."""
    from bots.analytics_bot import main as analytics

    sent: list[str] = []

    class FakeBot:
        async def send_message(self, chat_id, text, **kwargs):
            sent.append(text)

    async def broken():
        raise RuntimeError("база недоступна")

    async def fine():
        analytics._daily_parts.append("KPI дня")

    monkeypatch.setattr(analytics, "_bot", FakeBot())
    # В тестовой среде список владельцев пуст, и отправка падала бы
    # IndexError внутри `try` — то есть тест проверял бы не то.
    monkeypatch.setattr(analytics.settings, "admin_telegram_ids", [1], raising=False)
    monkeypatch.setattr(analytics, "conversion_funnel", broken)
    monkeypatch.setattr(analytics, "b2b_funnel_report", fine)
    monkeypatch.setattr(analytics, "daily_kpi_snapshot", fine)

    await analytics.daily_digest()

    assert len(sent) == 1
    assert "KPI дня" in sent[0]


@pytest.mark.asyncio
async def test_empty_digest_is_silence(monkeypatch):
    """Собрать нечего — не пишем «отчётов нет»: это тоже сообщение."""
    from bots.analytics_bot import main as analytics

    sent: list[str] = []

    class FakeBot:
        async def send_message(self, chat_id, text, **kwargs):
            sent.append(text)

    async def nothing():
        return None

    monkeypatch.setattr(analytics, "_bot", FakeBot())
    # В тестовой среде список владельцев пуст, и отправка падала бы
    # IndexError внутри `try` — то есть тест проверял бы не то.
    monkeypatch.setattr(analytics.settings, "admin_telegram_ids", [1], raising=False)
    monkeypatch.setattr(analytics, "conversion_funnel", nothing)
    monkeypatch.setattr(analytics, "b2b_funnel_report", nothing)
    monkeypatch.setattr(analytics, "daily_kpi_snapshot", nothing)

    await analytics.daily_digest()

    assert sent == []


def test_anomaly_stays_a_separate_signal():
    """Аномалия выручки — сигнал, а не отчёт: ждать до вечера ей нельзя."""
    from pathlib import Path

    source = (Path(__file__).resolve().parent.parent
              / "bots" / "analytics_bot" / "main.py").read_text(encoding="utf-8")

    assert 'name="sales_anomaly"' in source, "аномалия исчезла из расписания"
    assert "_daily_parts" not in source.split('async def sales_anomaly')[1].split('async def')[0], (
        "аномалия попала в вечерний дайджест — о просадке выручки узнают вечером"
    )
