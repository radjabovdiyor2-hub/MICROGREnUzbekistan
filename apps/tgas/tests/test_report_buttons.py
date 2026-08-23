"""
Доклад без кнопки — тупик.

ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ

В офисе шестьдесят пять задач по расписанию и девяносто с лишним мест,
которые пишут владельцу. Кнопка была ровно у двух — у карточки заявки и у
дайджеста Стёпана. Остальное приходило плоским текстом, включая сообщения,
которые прямо требуют действия: «решите сами или удалите», «требуется
внимание», «убедитесь, что на счету достаточно средств», «потребуется
ручной перезапуск».

Общая дверь при этом клавиатуру нести НЕ УМЕЛА: у `alert_admins` и
`notify_admin` в сигнатуре не было `reply_markup` вовсе. Поэтому первый
тест — про саму дверь, а последний — про то, что тупики не вернулись.

Сеть и Telegram подменены: проверяется проводка, а не Bot API.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from shared import admin_links
from shared.notifications import alert_admins, notify_admin, send_report

ROOT = Path(__file__).resolve().parent.parent


class FakeBot:
    """Запоминает, что и с какой клавиатурой ушло."""

    def __init__(self, fail: bool = False):
        self.sent: list[dict] = []
        self.fail = fail

    async def send_message(self, chat_id, text, **kwargs):
        if self.fail:
            raise RuntimeError("Telegram недоступен")
        self.sent.append({"chat_id": chat_id, "text": text, **kwargs})


@pytest.fixture
def owner(monkeypatch):
    """Владелец с известным Telegram ID — Mini App разрешён только ему."""
    monkeypatch.setattr(admin_links.settings, "admin_telegram_ids", [777], raising=False)
    from shared.config import settings as cfg

    monkeypatch.setattr(cfg, "admin_telegram_ids", [777], raising=False)
    monkeypatch.setattr(admin_links.settings, "public_web_url", "https://example.uz", raising=False)
    return 777


@pytest.mark.asyncio
async def test_report_carries_button_to_its_screen(owner):
    """Доклад уходит с кнопкой на названный экран."""
    bot = FakeBot()
    ok = await send_report(bot, owner, "Просрочены платежи", admin_tab="debts")

    assert ok
    markup = bot.sent[0]["reply_markup"]
    assert markup is not None, "доклад ушёл тупиком — без кнопки"
    button = markup.inline_keyboard[0][0]
    assert "tab=debts" in (button.web_app.url if button.web_app else button.url)


@pytest.mark.asyncio
async def test_report_without_screen_has_no_button(owner):
    """Не назвали экран — кнопки нет, а не кнопка в никуда."""
    bot = FakeBot()
    await send_report(bot, owner, "Просто к сведению")
    assert bot.sent[0]["reply_markup"] is None


@pytest.mark.asyncio
async def test_report_survives_dead_telegram(owner):
    """Недоставленный доклад возвращает False, а не роняет расписание."""
    assert await send_report(FakeBot(fail=True), owner, "текст", admin_tab="stats") is False


@pytest.mark.asyncio
async def test_alert_admins_accepts_screen(owner):
    """Аварийная рассылка тоже несёт кнопку — раньше не умела вовсе."""
    bot = FakeBot()
    delivered = await alert_admins(bot, "Боты не отвечают", admin_tab="bot_health")

    assert delivered == 1
    assert bot.sent[0]["reply_markup"] is not None
    # Ссылка под аварией не должна раскрываться карточкой сайта в пол-экрана.
    assert bot.sent[0]["disable_web_page_preview"] is True


@pytest.mark.asyncio
async def test_notify_admin_accepts_screen(owner):
    bot = FakeBot()
    await notify_admin(bot, [owner], "Новая заявка", admin_tab="employees")
    assert bot.sent[0]["reply_markup"] is not None


@pytest.mark.asyncio
async def test_mini_app_only_in_owner_private_chat(owner):
    """В группе кнопка обычная: `web_app` там отклонит ВСЁ сообщение."""
    bot = FakeBot()
    await send_report(bot, -1001234567890, "Заказ без суммы", admin_tab="orders")

    button = bot.sent[0]["reply_markup"].inline_keyboard[0][0]
    assert button.web_app is None
    assert button.url and "tab=orders" in button.url


@pytest.mark.asyncio
async def test_focus_reaches_the_record(owner):
    """Ссылка ведёт в конкретную запись, а не просто на экран."""
    bot = FakeBot()
    await send_report(bot, owner, "Задача зависла", admin_tab="tasks", focus="95")

    button = bot.sent[0]["reply_markup"].inline_keyboard[0][0]
    assert "focus=95" in button.web_app.url


# ── Сторож: сообщения, требующие действия, обязаны его давать ──────────

#: Обороты, которыми доклад требует что-то сделать. Если они есть в тексте,
#: у сообщения обязана быть кнопка — иначе это требование без способа его
#: выполнить.
DEMANDS = [
    "решите сами",
    "требуется внимание",
    "убедитесь",
    "оформите вручную",
    "потребуется ручной",
    "запланируйте",
]

#: Файлы, за которыми следим: планировщики и обработчики событий ботов.
WATCHED = sorted(ROOT.glob("bots/*/main.py"))


def _sending_calls(source: str) -> list[str]:
    """Куски вызовов отправки — по одному на вызов."""
    return re.findall(r"send_message\((?:[^()]|\([^()]*\))*\)", source, re.S)


def test_demanding_messages_are_not_dead_ends():
    """Ни один доклад-требование не уходит голым `send_message`.

    Сторож грубый намеренно: он ищет обороты требования внутри вызова
    `bot.send_message`, у которого нет `reply_markup`. Проверять смысл он
    не умеет и не должен — его дело поймать возврат к прежней привычке.
    """
    assert WATCHED, "не найдено ни одного бота — сторож проверяет пустоту"

    guilty: list[str] = []
    for path in WATCHED:
        source = path.read_text(encoding="utf-8")
        for call in _sending_calls(source):
            if "reply_markup" in call:
                continue
            lowered = call.lower()
            for demand in DEMANDS:
                if demand in lowered:
                    guilty.append(f"{path.parent.name}: «{demand}»")
                    break

    assert guilty == [], (
        "доклад требует действия и не даёт кнопки — переведите его на "
        "shared.notifications.send_report с admin_tab: " + "; ".join(guilty)
    )


def test_guard_can_go_red():
    """Сторож обязан уметь краснеть — иначе он ничего не проверяет."""
    fake = 'await bot.send_message(admin_id, "Убедитесь, что всё хорошо")'
    calls = _sending_calls(fake)
    assert calls, "выражение отправки не распознано"
    assert any("убедитесь" in c.lower() for c in calls)
