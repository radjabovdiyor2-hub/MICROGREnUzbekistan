"""
Оповещения владельца: дедуп заявок, ритм напоминаний и ссылки в админку.

Каждый тест закрывает то, что владелец видел на экране своего телефона:
двадцать заявок, из которых десять — «Удалить задачу #95» от одного бота,
один и тот же дайджест каждый час, и ни одной кнопки, чтобы посмотреть
задачу, о которой спрашивают.

База подменяется заглушкой: проверяется проводка, а не Postgres.
"""

from __future__ import annotations

import re
import types
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest


# ── Заглушка `owner_approvals` ──────────────────────────────────────────
class FakeApprovalStore:
    """Ровно те три запроса, которые делает `shared/approvals.py`."""

    def __init__(self):
        self.rows: list[dict] = []

    def _result(self, value):
        return types.SimpleNamespace(
            fetchone=lambda: value, fetchall=lambda: value or [], scalar=lambda: value
        )

    async def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        params = params or {}

        if "SET duplicate_count = duplicate_count + 1" in sql:
            for row in self.rows:
                if row["status"] == "pending" and row["fingerprint"] == params.get("fp"):
                    row["duplicate_count"] += 1
                    return self._result((row["token"],))
            return self._result(None)

        if sql.startswith("INSERT INTO owner_approvals"):
            self.rows.append(
                {
                    "token": params["tok"],
                    "kind": params["kind"],
                    "summary": params["sum"],
                    "fingerprint": params.get("fp"),
                    "duplicate_count": 0,
                    "status": "pending",
                }
            )
            return self._result(None)

        if "SELECT COUNT(*)" in sql:
            return self._result((len([r for r in self.rows if r["status"] == "pending"]),))

        return self._result(None)

    async def commit(self):
        pass

    @property
    def pending(self) -> list[dict]:
        return [r for r in self.rows if r["status"] == "pending"]


class FakeBot:
    def __init__(self):
        self.messages: list[dict] = []

    async def send_message(self, chat_id, text, **kwargs):
        self.messages.append({"chat_id": chat_id, "text": text, **kwargs})


@pytest.fixture
def store(monkeypatch):
    """Пустая таблица заявок + владелец с известным Telegram ID."""
    import shared.approvals as approvals
    import shared.database as database
    from shared.config import settings

    fake = FakeApprovalStore()

    @asynccontextmanager
    async def fake_session_ctx():
        yield fake

    monkeypatch.setattr(database, "get_session_ctx", fake_session_ctx)
    monkeypatch.setattr(settings, "admin_telegram_ids", [777], raising=False)
    monkeypatch.setattr(settings, "public_web_url", "https://example.test", raising=False)
    # Заявка не должна уходить через запасного бота Стёпана: токена в тестах нет.
    monkeypatch.setattr(approvals, "_fallback_bot", lambda: None)
    return fake


async def _ask(bot, *, task_id=95, reason="Задача удалена по запросу.", tool="delete_task"):
    from shared import approvals

    outcome: dict = {}
    token = await approvals.request(
        bot,
        777,
        "tool",
        {"tool": tool, "args": {"task_id": task_id, "reason": reason}},
        f"Удалить задачу #{task_id} безвозвратно: {reason}",
        bot_name="stepan_bot",
        outcome=outcome,
    )
    return token, outcome


# ── Дедуп ───────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_same_request_ten_times_makes_one_approval(store):
    """Десять просьб об одном действии — одна заявка и одна карточка.

    Именно так копилось то, что владелец увидел в дайджесте: задача висела
    в `todo`, `retry_stuck_tasks` переоткрывал её каждый час, отдел заново
    звал `delete_task`, и каждый раз рождался НОВЫЙ токен — мимо защиты от
    двойного нажатия.
    """
    bot = FakeBot()
    tokens = {(await _ask(bot))[0] for _ in range(10)}

    assert len(store.pending) == 1
    assert len(tokens) == 1, "повторы обязаны отдавать токен уже висящей заявки"
    assert store.pending[0]["duplicate_count"] == 9
    assert len(bot.messages) == 1, "карточка уходит владельцу ровно один раз"


@pytest.mark.asyncio
async def test_reformulated_reason_is_the_same_action(store):
    """Разная формулировка причины не делает действие другим.

    В дайджесте соседствовали «Задача удалена по запросу» и «Удаление
    дублирующих задач» — обе про `delete_task(task_id=95)`. Пока свободный
    текст модели входил бы в отпечаток, дедуп не сработал бы ни разу.
    """
    bot = FakeBot()
    await _ask(bot, reason="Задача удалена по запросу.")
    await _ask(bot, reason="Удаление дублирующих задач.")

    assert len(store.pending) == 1


@pytest.mark.asyncio
async def test_different_task_is_a_different_approval(store):
    """Дедуп не должен склеивать разные задачи: #95 и #96 — две заявки."""
    bot = FakeBot()
    await _ask(bot, task_id=95)
    await _ask(bot, task_id=96)

    assert len(store.pending) == 2


@pytest.mark.asyncio
async def test_model_is_told_the_request_repeats(store):
    """Модель обязана узнать, что уже просила, — иначе повторит вызов."""
    from shared import approvals, tools as tool_registry

    bot = FakeBot()
    tool = tool_registry.by_name("delete_task")
    args = {"task_id": 95, "reason": "дубль"}

    first = await approvals.request_approval(bot, tool, args, bot_name="stepan_bot")
    second = await approvals.request_approval(bot, tool, args, bot_name="stepan_bot")

    assert "УЖЕ отправлена" not in first
    assert "УЖЕ отправлена" in second
    assert "НЕ выполнено" not in second or "не описывай результат" in second


# ── Ссылки в админку ────────────────────────────────────────────────────
def test_every_risky_tool_leads_somewhere():
    """У рискованного действия всегда есть экран, на который можно уйти."""
    from shared import admin_links, tools as tool_registry

    for tool in tool_registry.all_tools():
        if not tool.risky:
            continue
        tab, _ = admin_links.target_for("tool", {"tool": tool.name, "args": {}})
        assert tab and tab != admin_links.FALLBACK_TAB, (
            f"«{tool.name}» ведёт владельца в общую очередь вместо своего экрана"
        )


def test_link_points_at_the_task_in_question(store):
    """Строка про задачу #95 ведёт на вкладку задач и выделяет саму задачу."""
    from shared import admin_links

    payload = {"tool": "delete_task", "args": {"task_id": 95, "reason": "дубль"}}
    assert admin_links.target_for("tool", payload) == ("tasks", "95")

    html = admin_links.link("Удалить задачу #95", "tool", payload)
    assert 'href="https://example.test/admin?tab=tasks&amp;focus=95"' in html


def test_unknown_kind_goes_to_the_queue_not_nowhere(store):
    """Тип без экрана ведёт в очередь заявок, а не оставляет ссылку пустой."""
    from shared import admin_links

    assert admin_links.target_for("что-то новое", {}) == ("approvals", None)


def test_webapp_button_only_in_owner_dm(store):
    """`web_app` в группе Telegram запрещён — там кнопка обычная.

    Карточки подтверждения уходят и в чаты задач. Отправь мы туда `web_app`,
    Telegram отклонил бы ВСЁ сообщение — владелец не увидел бы даже ✅/❌.
    """
    from shared import admin_links

    payload = {"tool": "delete_task", "args": {"task_id": 95}}

    dm = admin_links.open_button("Открыть", "tool", payload, 777)
    group = admin_links.open_button("Открыть", "tool", payload, -1001234567890)
    stranger = admin_links.open_button("Открыть", "tool", payload, 12345)

    assert dm.web_app is not None and dm.url is None
    assert group.url and group.web_app is None
    assert stranger.url and stranger.web_app is None


@pytest.mark.asyncio
async def test_card_offers_a_way_into_the_admin(store):
    """У карточки подтверждения есть третья кнопка — путь на экран действия."""
    bot = FakeBot()
    await _ask(bot)

    keyboard = bot.messages[0]["reply_markup"].inline_keyboard
    buttons = [b for row in keyboard for b in row]
    assert [b.text for b in buttons if b.callback_data] == ["✅ Одобрить", "❌ Отклонить"]

    opener = [b for b in buttons if b.web_app or b.url]
    assert len(opener) == 1
    assert "tab=tasks" in (opener[0].web_app.url if opener[0].web_app else opener[0].url)


# ── Клавиатура дайджеста ────────────────────────────────────────────────
def test_decision_keeps_other_approvals_pressable():
    """Решение по одной строке дайджеста не гасит кнопки двух других.

    На одиночной карточке снять клавиатуру целиком правильно. В дайджесте на
    одном сообщении висят кнопки трёх заявок: погасив их все, «Одобрить» по
    первой строке отправил бы владельца искать остальные по переписке —
    ровно от чего дайджест и уводит.
    """
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

    from shared.approvals import _keyboard_without

    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ 1", callback_data="approve:aaa"),
                InlineKeyboardButton(text="❌ 1", callback_data="reject:aaa"),
            ],
            [
                InlineKeyboardButton(text="✅ 2", callback_data="approve:bbb"),
                InlineKeyboardButton(text="❌ 2", callback_data="reject:bbb"),
            ],
        ]
    )

    left = _keyboard_without(markup, "aaa")
    assert [b.callback_data for row in left.inline_keyboard for b in row] == [
        "approve:bbb",
        "reject:bbb",
    ]
    # Последняя решённая заявка — клавиатуры не остаётся вовсе.
    assert _keyboard_without(left, "bbb") is None


# ── Ритм напоминаний ────────────────────────────────────────────────────
def _pending(hours_old: float, remind_count: int, reminded_hours_ago=None) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "token": "tok",
        "kind": "tool",
        "summary": "Удалить задачу #95 безвозвратно",
        "bot_name": "stepan_bot",
        "chat_id": 777,
        "remind_count": remind_count,
        "created_at": now - timedelta(hours=hours_old),
        "reminded_at": None if reminded_hours_ago is None else now - timedelta(hours=reminded_hours_ago),
        "payload": {"tool": "delete_task", "args": {"task_id": 95}},
        "duplicate_count": 0,
    }


@pytest.fixture
def digest(monkeypatch, store):
    """Дайджест Стёпана с подменённой очередью и ботом."""
    from bots.stepan_bot import main as stepan
    from shared import approvals

    bot = FakeBot()
    monkeypatch.setattr(stepan, "_bot", bot)

    async def _mark(token):
        pass

    monkeypatch.setattr(approvals, "mark_reminded", _mark)

    def _queue(items):
        async def fake_list(limit=20):
            return list(items)

        async def fake_count():
            return len(items)

        monkeypatch.setattr(approvals, "list_pending", fake_list)
        monkeypatch.setattr(approvals, "count_pending", fake_count)

    return types.SimpleNamespace(bot=bot, run=stepan.remind_pending_approvals, queue=_queue)


@pytest.mark.asyncio
async def test_digest_is_silent_right_after_a_reminder(digest):
    """Час назад уже напоминали — второй раз не пишем.

    Шаг отсчитывался от создания заявки: у висящей 115 часов он упирался в
    потолок лестницы (24 ч), возраст был заведомо больше, и условие
    срабатывало на КАЖДОМ часовом прогоне. Владелец получал одно и то же
    полотно круглосуточно — два таких сообщения подряд и видно на скриншоте.
    """
    digest.queue([_pending(hours_old=115, remind_count=4, reminded_hours_ago=1)])
    await digest.run()

    assert digest.bot.messages == []


@pytest.mark.asyncio
async def test_digest_speaks_when_the_step_has_passed(digest):
    """Сутки после последнего напоминания — пора написать снова."""
    digest.queue([_pending(hours_old=115, remind_count=4, reminded_hours_ago=25)])
    await digest.run()

    assert len(digest.bot.messages) == 1


@pytest.mark.asyncio
async def test_digest_lines_are_links_with_buttons(digest):
    """Строка ведёт на свой экран, у трёх старейших есть решение прямо здесь."""
    items = []
    for number in range(5):
        item = _pending(hours_old=100 + number, remind_count=0)
        item["token"] = f"tok{number}"
        item["summary"] = f"Удалить задачу #{90 + number} безвозвратно"
        item["payload"] = {"tool": "delete_task", "args": {"task_id": 90 + number}}
        items.append(item)
    digest.queue(items)

    await digest.run()
    message = digest.bot.messages[0]

    assert message["text"].startswith("⏳ <b>Ждут вашего решения: 5</b>")
    assert message["text"].count('<a href="https://example.test/admin?tab=tasks') == 5

    buttons = [b for row in message["reply_markup"].inline_keyboard for b in row]
    decisions = [b.callback_data for b in buttons if b.callback_data]
    assert decisions == [
        "approve:tok0", "reject:tok0",
        "approve:tok1", "reject:tok1",
        "approve:tok2", "reject:tok2",
    ]
    assert [b for b in buttons if b.web_app or b.url], "кнопка «все заявки» обязана быть"


@pytest.mark.asyncio
async def test_digest_collapses_repeats(digest):
    """Одинаковые заявки — одна строка со счётчиком, а не десять подряд."""
    items = []
    for number in range(10):
        item = _pending(hours_old=115, remind_count=0)
        item["token"] = f"tok{number}"
        items.append(item)
    digest.queue(items)

    await digest.run()
    text = digest.bot.messages[0]["text"]

    assert len(re.findall(r"Удалить задачу #95", text)) == 1
    assert "(просили 10 раз)" in text
    assert "Ждут вашего решения: 10" in text
    # Свёрнутые дубли уже посчитаны в своей строке: обещать «ещё девять»
    # значит отправить владельца искать заявки, которых нет.
    assert "…ещё" not in text
