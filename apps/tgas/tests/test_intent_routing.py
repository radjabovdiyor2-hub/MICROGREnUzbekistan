"""
Распознавание намерения в сообщениях владельца.

ЗАЧЕМ ЭТИ ТЕСТЫ

10.08.2026 владелец надиктовал: «Принимаю на работу агента по продажам…
Поставь этот вопрос на общее заседание. Пускай все всё изучат и дадут мне
один единый ответ». Офис попытался опубликовать пост в Instagram.

Ошибки были в способе сравнения, а не в списках слов:

  · «пост» ⊂ «Поставь» — сработала контентная ветка;
  · «опрос» ⊂ «вопрос» — сработало принудительное перенаправление в контент;
  · «заседание» не значилось среди триггеров совещания, хотя сам механизм
    совещания готов и работает.

Ни один тест этого поймать не мог: списки слов проверялись глазами, а
подстрочное сравнение выглядит правильным, пока не подставишь конкретную
фразу. Поэтому здесь именно фразы — те, что владелец реально говорит.
"""

from __future__ import annotations

import pytest

from shared.utils import contains_any, first_match

# Списки берём из рабочего кода, а не переписываем: копия разошлась бы с
# оригиналом молча, и тест стал бы охранять несуществующее поведение.
from bots.stepan_bot.handlers.team_meeting import (
    MEETING_TRIGGERS,
    is_execution_command,
    is_meeting_request,
)

CONTENT_ACTIONS = {
    "story": "publish_story",
    "сторис": "publish_story",
    "stories": "publish_story",
    "сториз": "publish_story",
    "post": "publish_post",
    "пост": "publish_post",
    "публикуй": "publish_story",
    "опубликуй": "publish_story",
    "meme": "generate_meme",
    "мем": "generate_meme",
}

# Слова принудительного перенаправления в контент — копия из
# assistant._handle_task. Держим синхронной: расхождение проверяет
# test_safety_words_match_handler.
SAFETY_WORDS = [
    "опрос",
    "poll",
    "викторин*",
    "мем",
    "сторис",
    "stories",
    "пост",
    "публикац*",
    "контент*",
]

INCIDENT = "Поставь этот вопрос на общее заседание. Пускай все всё изучат и дадут мне один единый ответ"


# ── Та самая фраза ──────────────────────────────────────────────────────
def test_incident_phrase_is_a_meeting_not_a_post():
    """Просьба вынести вопрос на заседание — совещание, и только оно."""
    assert is_meeting_request(INCIDENT.lower()) is True
    assert first_match(INCIDENT, CONTENT_ACTIONS) is None
    assert contains_any(INCIDENT, SAFETY_WORDS) is False


@pytest.mark.parametrize(
    "phrase",
    [
        "Поставь этот вопрос на заседание",
        "Поставь задачу отделу продаж",
        "Новая поставка кокосового субстрата",
        "Свяжись с поставщиком лотков",
        "Теплица работает постоянно",
        "Задай вопрос клиенту про доставку",
    ],
)
def test_post_is_not_found_inside_other_words(phrase):
    """«пост» и «опрос» — целые слова, а не куски «поставки» и «вопроса».

    Каждая фраза здесь при подстрочном сравнении уходила бы в публикацию.
    """
    assert first_match(phrase, CONTENT_ACTIONS) is None
    assert contains_any(phrase, SAFETY_WORDS) is False


# ── Настоящие просьбы публиковать по-прежнему работают ──────────────────
@pytest.mark.parametrize(
    "phrase,expected",
    [
        # «пост» стоит в словаре раньше «опубликуй» и выигрывает — это и
        # правильно: разница между ними видна только в названии действия,
        # обработчик у отдела контента один (bus_publish_story).
        ("Опубликуй пост про рукколу", "publish_post"),
        ("Сделай пост о новом урожае", "publish_post"),
        ("Выложи сторис с базиликом", "publish_story"),
        ("Нужны сторисы на завтра", "publish_story"),
        ("Сделай мем про микрозелень", "generate_meme"),
    ],
)
def test_real_publishing_requests_still_recognised(phrase, expected):
    assert first_match(phrase, CONTENT_ACTIONS) == expected


@pytest.mark.parametrize(
    "phrase",
    [
        "Проведи опрос среди клиентов",
        "Нужна публикация в инстаграме",
        "Сделай викторину для подписчиков",
        "Подготовь контент на неделю",
    ],
)
def test_content_routing_still_fires_on_real_content(phrase):
    assert contains_any(phrase, SAFETY_WORDS) is True


# ── Совещание ───────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "phrase",
    [
        "Поставь вопрос на общее заседание",
        "Собери планёрку по закупкам",
        "Проведи летучку с отделами",
        "Пускай все изучат и дадут один ответ",
        "Нужно общее решение по зарплате агента",
        "Обсудите между собой и дайте решение",
        "Почему падают продажи",
    ],
)
def test_meeting_is_recognised(phrase):
    assert is_meeting_request(phrase.lower()) is True


@pytest.mark.parametrize(
    "phrase",
    [
        "Сколько заказов сегодня",
        "Добавь товар руккола за 25000",
        "Покажи остатки на складе",
    ],
)
def test_ordinary_questions_do_not_summon_a_meeting(phrase):
    """Совещание — дорогая операция: десяток вызовов модели на каждый созыв.

    Ложный созыв стоит денег и времени, поэтому обычные вопросы должны
    проходить мимо.
    """
    assert is_meeting_request(phrase.lower()) is False


def test_execution_command_survives_word_endings():
    """«Выполняй» и «Делайте» — те же команды, что «выполни» и «делай».

    Раньше список хранил точные формы, и «Выполняй» не распознавалось вовсе:
    сообщение уходило в общий AI, который выдумывал задачу вплоть до
    настоящей публикации.
    """
    for phrase in ("Делай", "Делайте", "Выполняй", "Выполните", "Запускай", "Приступайте"):
        assert is_execution_command(phrase.lower()) is True, phrase


def test_long_message_is_not_an_execution_command():
    """Длинное содержательное сообщение — не короткая команда «делай»."""
    long_text = (
        "Делай так: сначала посчитай себестоимость партии редиса, "
        "потом сравни с ценой продажи и скажи, где мы теряем деньги"
    )
    assert is_execution_command(long_text.lower()) is False


# ── Списки не должны разойтись с рабочим кодом ──────────────────────────
def test_safety_words_match_handler():
    """Копия SAFETY_WORDS выше обязана совпадать с той, что в обработчике."""
    import inspect

    from bots.stepan_bot.handlers import assistant

    source = inspect.getsource(assistant._handle_task)
    for word in SAFETY_WORDS:
        assert f'"{word}"' in source, f"«{word}» пропало из _handle_task"


def test_meeting_triggers_cover_the_words_owner_uses():
    """Слова, на которых система уже один раз ошиблась, обязаны остаться."""
    for word in ("заседани*", "планёрк*", "летучк*", "пускай все", "единый ответ"):
        assert word in MEETING_TRIGGERS


# ── Публикация не уходит без подтверждения ──────────────────────────────
@pytest.mark.asyncio
async def test_publishing_from_assistant_asks_before_posting(monkeypatch):
    """Голосовая просьба опубликовать создаёт ЗАЯВКУ, а не публикацию.

    Раньше отсюда шёл прямой send_task в отдел контента, и он выкладывал в
    Instagram сразу. Тот же инструмент через реестр объявлен risky=True с
    карточкой ✅/❌ — одно действие, две двери, и одна была без охраны.
    10.08.2026 публикацию остановила только ошибка импорта.
    """
    from shared import approvals
    from bots.stepan_bot.handlers import assistant

    sent = []
    requested = []

    async def fake_send_task(**kwargs):
        sent.append(kwargs)
        return "bus-1"

    async def fake_request(bot, chat_id, kind, payload, summary, **kwargs):
        requested.append({"kind": kind, "payload": payload, "summary": summary})
        return "token-1"

    import shared.bot_bus as bot_bus

    monkeypatch.setattr(bot_bus, "send_task", fake_send_task)
    monkeypatch.setattr(approvals, "request", fake_request)

    class FakeMsg:
        bot = object()

        class chat:
            id = 42

        def __init__(self):
            self.answers = []

        async def answer(self, text, **kwargs):
            self.answers.append(text)

    message = FakeMsg()
    await assistant._handle_task(
        message,
        {
            "department": "content",
            "title": "Опубликуй пост про рукколу",
            "description": "Свежая руккола в наличии",
        },
    )

    assert len(requested) == 1, "заявка на подтверждение не создана"
    assert requested[0]["kind"] == "content_publish"
    assert requested[0]["payload"]["action"] == "publish_post"
    assert sent == [], "публикация ушла до подтверждения владельца"


@pytest.mark.asyncio
async def test_publishing_happens_only_after_approval(monkeypatch):
    """А по нажатию «Одобрить» — публикуется ровно то, что было в заявке."""
    from bots.stepan_bot.handlers import assistant

    sent = []

    async def fake_send_task(**kwargs):
        sent.append(kwargs)
        return "bus-2"

    async def fake_get_result(task_id, timeout=120):
        return {"status": "done", "result": {"message": "Сторис опубликован"}}

    import shared.bot_bus as bot_bus

    monkeypatch.setattr(bot_bus, "send_task", fake_send_task)
    monkeypatch.setattr(bot_bus, "get_result", fake_get_result)

    text = await assistant._confirm_content_publish(
        {"action": "publish_story", "topic": "руккола"}, None
    )

    assert sent[0]["action"] == "publish_story"
    assert sent[0]["params"] == {"topic": "руккола"}
    assert "опубликован" in text.lower()
