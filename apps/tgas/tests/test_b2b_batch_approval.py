"""
Пакетное одобрение КП отправляет ровно то же и ровно один раз.

ЗАЧЕМ ЭТОТ ТЕСТ

Утренняя пачка B2B-предложений — до пятнадцати карточек, и владелец почти
всегда согласен со всеми. Пятнадцать одинаковых нажатий не были контролем:
из-за них пачка висела неразобранной, а `_fetch_b2b_targets` каждое утро
отбирал тех же лидов заново.

Кнопка «одобрить все» опасна ровно двумя вещами, и обе проверяются здесь:

  • она может отправить ИНАЧЕ, чем одиночная кнопка. Не может: доставка
    одна на оба пути — `b2b_offer.deliver`;
  • она может отправить ДВАЖДЫ тому, кого уже одобрили поштучно.
    Письмо не отзывается, поэтому повторная отправка — не «шум», а
    испорченный контакт. Защита не в памяти обработчика, а в самих данных:
    признак «ждёт решения» — строка `b2b_offer_pending`, отправка переводит
    её в `sent`, и второй заход не находит, что отправлять.

Тест статический: смотрит исходники, инфраструктура и Telegram не нужны.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

TGAS = Path(__file__).resolve().parent.parent
MARKETING = TGAS / "bots" / "marketing_bot"

OFFER = MARKETING / "b2b_offer.py"
MAIN = MARKETING / "main.py"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_single_and_batch_share_one_delivery() -> None:
    """Одиночная кнопка и пакетная зовут одну и ту же доставку."""
    main = _read(MAIN)

    single = main[main.index("async def handle_b2b_approval"): main.index("async def _mark_card")]
    batch = main[main.index("async def handle_b2b_batch"):]
    batch = batch[: batch.index("\nasync def ", 1)]

    assert "b2b_offer.deliver(" in single, (
        "одиночное одобрение перестало звать `b2b_offer.deliver` — значит, "
        "у отправки снова две реализации, и они разойдутся молча"
    )
    assert "b2b_offer.deliver(" in batch, (
        "пакетное одобрение отправляет мимо `b2b_offer.deliver` — оно обязано "
        "делать ровно то же, что и кнопка под карточкой"
    )

    # Ни один из путей не шлёт письмо сам.
    for name, block in (("одиночный", single), ("пакетный", batch)):
        assert "send_b2b_offer_email" not in block, (
            f"{name} обработчик шлёт письмо сам, мимо общей доставки"
        )


def _sql_chunks(path: Path) -> list[str]:
    """
    Собранные SQL-строки файла — так же, как их собирает Python.

    Смотреть на «окно вокруг совпадения» здесь нельзя, и это проверено:
    первая версия теста искала `b2b_offer_pending` в 600 символах после
    UPDATE и оставалась ЗЕЛЁНОЙ, когда сужение убирали, — в окно попадал
    следующий запрос, у которого условие на месте. Тот же класс ошибки,
    что был у сторожа мягкого удаления.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out: list[str] = []
    taken: set[int] = set()

    def flatten(node: ast.AST) -> str | None:
        if isinstance(node, ast.Constant):
            return node.value if isinstance(node.value, str) else None
        if isinstance(node, ast.JoinedStr):
            return "".join(flatten(v) or "?" for v in node.values)
        if isinstance(node, ast.FormattedValue):
            return flatten(node.value)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            left, right = flatten(node.left), flatten(node.right)
            if left is None and right is None:
                return None
            return (left or "") + (right or "")
        return None

    for node in ast.walk(tree):
        if id(node) in taken:
            continue
        text = flatten(node)
        if text is None:
            continue
        out.append(text)
        for inner in ast.walk(node):
            taken.add(id(inner))
    return out


def test_delivery_only_touches_pending_offers() -> None:
    """
    Отправка и отклонение работают ТОЛЬКО по строке «ждёт решения».

    Это и есть защита от повторной отправки: одобрили карточку поштучно —
    строка стала `sent`, и «одобрить все» её уже не увидит.
    """
    chunks = _sql_chunks(OFFER)

    updates = [c for c in chunks if re.search(r"UPDATE\s+interactions", c, re.I)]
    assert updates, "в доставке не осталось ни одного UPDATE — тест ослеп"
    for statement in updates:
        assert "b2b_offer_pending" in statement, (
            "UPDATE по `interactions` не ограничен строкой `b2b_offer_pending`: "
            "повторное нажатие отправит КП второй раз, а письмо не отзывается\n"
            f"Запрос: {statement[:160]}"
        )

    # Выбор кандидатов на отправку — тоже только среди ждущих.
    reads = [c for c in chunks if re.search(r"FROM\s+customers", c, re.I)]
    assert reads, "в доставке не осталось чтений `customers` — тест ослеп"
    for statement in reads:
        assert "b2b_offer_pending" in statement, (
            "доставка берёт клиента без признака «ждёт решения»: она отправит "
            "КП тому, чью карточку уже разобрали\n"
            f"Запрос: {statement[:160]}"
        )


def test_batch_reports_what_failed() -> None:
    """Пакет обязан назвать тех, кому не ушло, а не отчитаться числом."""
    main = _read(MAIN)
    batch = main[main.index("async def handle_b2b_batch"):]
    batch = batch[: batch.index("\nasync def ", 1)]

    assert "failed" in batch, "пакетное одобрение не отделяет неудачи от удач"
    assert "Не получилось" in batch, (
        "владельцу не показывают, кому КП не ушло: пачка выглядела бы "
        "отправленной целиком, а часть заведений осталась бы без письма"
    )
