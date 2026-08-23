"""
Перезапуск бота: адресуется конкретному боту и не требует Docker.

ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ПРОВЕРКА

Владелец видел в «Здоровье ботов», что бот не отвечает, и не мог ничего
сделать: перезапуск жил только в SSH. Очевидный путь — дать боту сокет
Docker — означал бы root на хосте для контейнера, которым управляет
языковая модель. Комментарий в `docker-compose.prod.yml` такой доступ
обещает, но в `volumes:` его нет.

Вместо этого бот выходит сам, а контейнер поднимает `restart: unless-stopped`.
Здесь проверяется, что механизм именно такой: обработчик СНАЧАЛА отвечает и
только потом выходит (иначе вызывающий не узнает, что команда принята), и
что перезапуск нельзя адресовать чему угодно.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

from shared import bot_registry, self_restart

ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.asyncio
async def test_handler_answers_before_exiting(monkeypatch):
    """Ответ уходит сразу, выход — потом.

    Ответ по шине записывается ПОСЛЕ возврата из обработчика. Выйди бот
    сразу — вызывающий ждал бы до таймаута, и команда выглядела бы не
    сработавшей при том, что бот честно перезапустился.
    """
    exited: list[int] = []
    monkeypatch.setattr(self_restart.os, "_exit", lambda code: exited.append(code))
    monkeypatch.setattr(self_restart, "GRACE_SECONDS", 0)

    result = await self_restart.handler("finance_bot")({"reason": "тест"})

    assert result["status"] == "ok"
    assert "finance_bot" in result["message"]
    # На момент ответа выход ещё НЕ случился.
    assert exited == []

    # А после паузы — случился, и штатным кодом: иначе `unless-stopped`
    # поднимет контейнер, но в журнале это будет выглядеть падением.
    await asyncio.sleep(0.05)
    assert exited == [0]


@pytest.mark.asyncio
async def test_handler_survives_empty_params(monkeypatch):
    """Команда без причины — обычное дело, а не повод упасть."""
    monkeypatch.setattr(self_restart.os, "_exit", lambda code: None)
    monkeypatch.setattr(self_restart, "GRACE_SECONDS", 0)

    assert (await self_restart.handler("qa_bot")(None))["status"] == "ok"
    assert (await self_restart.handler("qa_bot")({}))["status"] == "ok"


def test_every_bot_with_a_bus_listener_can_restart():
    """Кнопка есть у всех — значит и обработчик должен быть у всех.

    Экран «Здоровье ботов» рисует карточку каждому боту реестра. Бот без
    обработчика ответил бы «Неизвестное действие», и кнопка врала бы ровно
    у того бота, с которым что-то не так.
    """
    missing = []
    for bot in bot_registry.BOTS:
        main = ROOT / "bots" / bot.name / "main.py"
        if not main.exists():
            continue
        source = main.read_text(encoding="utf-8")
        # Слушатель шины есть, а перезапуска в нём нет.
        if "start_listener" in source and "restart_self" not in source:
            missing.append(bot.name)

    assert missing == [], (
        "у этих ботов нет обработчика перезапуска, а кнопка в админке есть: "
        + ", ".join(missing)
    )


def test_restart_is_not_in_the_fixed_whitelist():
    """У перезапуска исполнитель не фиксирован — он равен цели.

    Попади `restart_self` в `ADMIN_BOT_ACTIONS`, офис отправлял бы его
    ОДНОМУ боту из таблицы независимо от того, кого просили перезапустить.
    """
    source = (ROOT / "web_office" / "main.py").read_text(encoding="utf-8")

    block = re.search(r"ADMIN_BOT_ACTIONS:\s*dict\[str,\s*str\]\s*=\s*\{(.*?)\}", source, re.S)
    assert block, "не нашёл ADMIN_BOT_ACTIONS"
    assert "restart_self" not in block.group(1)

    # И при этом перезапуск разрешён отдельной веткой — иначе кнопка
    # получала бы «действие не разрешено».
    assert 'RESTART_ACTION = "restart_self"' in source
    assert "if action == RESTART_ACTION:" in source


def test_restart_target_is_limited_to_the_registry():
    """Имя бота уходит в путь файла очереди — принимать чужое нельзя."""
    source = (ROOT / "web_office" / "main.py").read_text(encoding="utf-8")
    branch = source.split("if action == RESTART_ACTION:", 1)[1][:600]

    assert "from shared.bot_registry import BOTS" in branch
    assert "known" in branch and "неизвестный бот" in branch
