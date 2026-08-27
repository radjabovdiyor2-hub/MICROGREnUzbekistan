"""
Карточка, пролежавшая двое суток, не делает выполненное «ошибкой».

ЗАЧЕМ ЭТОТ ТЕСТ

В офисе две карточки с кнопками живут долго по устройству, а не по
случайности: заявка на подтверждение ждёт решения сколько угодно («ЗАЯВКА
НЕ ИСТЕКАЕТ» в `shared/approvals.py`), а карточка задачи висит, пока
задачу не закроют.

Telegram отдаёт сообщение старше 48 часов как `InaccessibleMessage`: ни
текста, ни `edit_text`, ни `answer`, ни `reply`. Оба обработчика звали эти
методы напрямую — и падали ПОСЛЕ того, как работа сделана:

  · у задачи `callback.message.chat.id` роняло обработчик уже после
    `tasks_repo.set_status(task_id, "done")`. Владелец получал «Ошибка при
    закрытии задачи» на закрытую задачу, нажимал второй раз и видел
    «Задача не найдена»;
  · у заявки падение ловилось, но запасной путь звал `answer` у того же
    недоступного объекта — то есть тоже падал.

Расхождение между сделанным и увиденным дороже самого сбоя доставки,
поэтому доступность проверяется в одном месте (`shared/tg_cards.py`), а
прямые обращения к `callback.message` в этих модулях запрещены.

Тест статический: смотрит исходники, Telegram не нужен.
"""

from __future__ import annotations

import ast
from pathlib import Path

TGAS = Path(__file__).resolve().parent.parent

#: Модули долгоживущих карточек. Здесь прямое обращение к `callback.message`
#: означает падение на карточке старше двух суток.
GUARDED = [
    TGAS / "shared" / "approvals.py",
    TGAS / "shared" / "task_ui.py",
]

#: Общий разбор недоступности — ему обращаться к `message` можно и нужно.
HELPER = TGAS / "shared" / "tg_cards.py"

#: Чего нет у `InaccessibleMessage`. `chat` есть, но добираться до него
#: тоже полагается через помощник — иначе `None` уронит обработчик.
FORBIDDEN = {"edit_text", "html_text", "text", "answer", "reply", "chat"}


def _direct_message_uses(path: Path) -> list[str]:
    """`<что-то>.message.<запрещённое>` — обращения в обход помощника."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[str] = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.Attribute) or node.attr not in FORBIDDEN:
            continue
        inner = node.value
        if isinstance(inner, ast.Attribute) and inner.attr == "message":
            found.append(f"{path.name}:{node.lineno} — .message.{node.attr}")

    return found


def test_long_lived_cards_go_through_the_helper() -> None:
    offenders: list[str] = []
    for path in GUARDED:
        assert path.exists(), f"модуль пропал из проверки: {path}"
        offenders.extend(_direct_message_uses(path))

    assert not offenders, (
        "прямое обращение к `callback.message` в модуле долгоживущей карточки:\n  "
        + "\n  ".join(offenders)
        + "\n\nСообщение старше 48 часов приходит как `InaccessibleMessage` — "
        "этих полей у него нет, и обработчик падает уже ПОСЛЕ того, как "
        "работа сделана. Идите через `shared/tg_cards.py`."
    )


def test_helper_is_the_one_place_that_knows_about_inaccessible_cards() -> None:
    """Разбор недоступности живёт в одном месте, иначе он разойдётся."""
    body = HELPER.read_text(encoding="utf-8")
    assert "isinstance(message, Message)" in body, (
        "помощник перестал отличать доступную карточку от недоступной — "
        "тогда он не помощник, а лишний слой"
    )
    assert "send_message" in body, (
        "у помощника пропал последний рубеж: если карточку нельзя ни "
        "изменить, ни ответить на неё, доложить надо новым сообщением"
    )
