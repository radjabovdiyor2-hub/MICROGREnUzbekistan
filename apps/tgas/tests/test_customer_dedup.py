"""
Когда о тёзке клиента НАДО спрашивать, а когда нет.

СЛУЧАЙ, РАДИ КОТОРОГО ЭТИ ТЕСТЫ НАПИСАНЫ

16.08.2026, группа «Продажа»: «Зарегистрируй нового клиента Nozi
+998975773203». Бот ответил «Похоже, «Nozi» уже есть: SAMARQAND OSH MARKAZI N1
(#29), Noxat (#28)… повтори с force_new» — и карточка не завелась.

Две причины, обе проверяются здесь:

1. похожесть считалась функцией `word_similarity`, которая сравнивает запрос с
   КУСКОМ слова: у «nozi» и «noxat» общее начало «no» даёт ≈0.4 при пороге 0.3;
2. названный телефон никто не смотрел, хотя у каждого «похожего» был свой
   собственный номер — то есть заведомо другой клиент.
"""

from __future__ import annotations

import types

import pytest

from shared import customer_repo
from shared.tools import crm


# ── Телефон отвечает «нет» окончательно ─────────────────────────────────
@pytest.mark.parametrize(
    "theirs,mine,expected",
    [
        ("+998975773203", "998975773203", True),  # тот же номер, три формата
        ("998 97 577 32 03", "+998975773203", True),
        ("975773203", "+998975773203", True),
        ("+998901112233", "+998975773203", False),  # свой номер, и он другой
        (None, "+998975773203", None),  # судить не по чему
        ("+998901112233", "", None),
    ],
)
def test_same_phone(theirs, mine, expected):
    assert customer_repo.same_phone(theirs, mine) is expected


# ── Похожесть: целые слова против куска слова ───────────────────────────
def test_similar_asks_postgres_for_whole_words():
    """`similar()` обязан сравнивать слова целиком.

    Ошибиться здесь — значит вернуть ровно ту поломку: короткое имя «похоже»
    на всё, что начинается с тех же двух букв.
    """
    sql = str(customer_repo._fuzzy_sql("strict_word_similarity"))
    assert "strict_word_similarity" in sql
    # Обе меры считаются отдельно — иначе непонятно, ЧТО совпало.
    assert "sim_name" in sql and "sim_company" in sql


def _row(customer_id: int, name: str, sim_name: float, sim_company: float = 0.0):
    """Строка выборки нечёткого поиска: 17 полей клиента + две меры похожести."""
    return (
        customer_id, name, None, "+998901112233", None, None,
        "b2b", None, "lead", "Samarqand", 0, 0, 0, None, "office", None, None,
        sim_name, sim_company,
    )


class _Session:
    """Сессия, которая падает на первых N запросах — как Postgres без функции."""

    def __init__(self, fail_times: int, rows: list):
        self.fail_times = fail_times
        self.rows = rows
        self.attempts: list[str] = []
        self.rollbacks = 0

    async def execute(self, stmt, params=None):
        self.attempts.append(str(stmt))
        if len(self.attempts) <= self.fail_times:
            raise RuntimeError('function strict_word_similarity does not exist')
        return types.SimpleNamespace(fetchall=lambda: self.rows)

    async def rollback(self):
        self.rollbacks += 1


@pytest.mark.asyncio
async def test_strict_search_falls_back_to_partial_words():
    """Нет `strict_word_similarity` (pg_trgm старше 9.6) — ищем как раньше.

    И обязательно с откатом: упавший запрос обрывает транзакцию, без
    `rollback` Postgres отверг бы вторую попытку и все следующие SELECT'ы.
    """
    session = _Session(fail_times=1, rows=[_row(28, "Noxat", 0.4)])
    found = await customer_repo._search_fuzzy(
        session, ["nozi"], 5, customer_repo.LOOSE_THRESHOLD, strict=True
    )

    assert session.rollbacks == 1, "после падения запроса не откатили транзакцию"
    assert "strict_word_similarity" in session.attempts[0]
    assert "word_similarity" in session.attempts[1]
    assert [r[0] for r in found] == [28]


@pytest.mark.asyncio
async def test_fuzzy_drops_rows_below_threshold():
    """Порог применяется к лучшей из двух мер, а не к первой попавшейся."""
    session = _Session(
        fail_times=0,
        rows=[_row(29, "Markazi", 0.1, 0.35), _row(30, "Nozima", 0.2, 0.1)],
    )
    found = await customer_repo._search_fuzzy(
        session, ["nozi"], 5, customer_repo.LOOSE_THRESHOLD, strict=True
    )
    assert [r[0] for r in found] == [29]


# ── add_customer: телефон закрывает вопрос до того, как он задан ────────
@pytest.fixture
def crm_stub(monkeypatch):
    """CRM без базы: подставляем ответы поиска и ловим запись."""
    saved: list[dict] = []

    async def upsert(**kwargs):
        saved.append(kwargs)
        return {"id": 42, "name": kwargs.get("name"), "created": True}

    monkeypatch.setattr(customer_repo, "upsert", upsert)
    return {"saved": saved, "monkeypatch": monkeypatch}


def _candidate(customer_id: int, name: str, phone: str):
    return {
        "id": customer_id,
        "name": name,
        "phone": phone,
        "phone_display": phone,
        "customer_type": "b2b",
        "orders_count": 0,
        "score": 0.4,
        "matched_field": "name",
    }


@pytest.mark.asyncio
async def test_new_phone_beats_similar_names(crm_stub):
    """Именно случай Nozi: похожие есть, но у всех СВОИ, другие номера."""

    async def resolve(name, phone=None):
        return {}

    async def similar(name, limit=5):
        return [
            _candidate(29, "SAMARQAND OSH MARKAZI N1", "+998901112233"),
            _candidate(28, "Noxat", "+998907776655"),
        ]

    crm_stub["monkeypatch"].setattr(customer_repo, "resolve", resolve)
    crm_stub["monkeypatch"].setattr(customer_repo, "similar", similar)

    result = await crm.add_customer(
        name="Nozi", phone="+998975773203", customer_type="b2b"
    )

    assert result["ok"] and result["created"], (
        "клиент с новым номером не завёлся — это и есть потерянный 16.08.2026 Nozi"
    )
    assert crm_stub["saved"], "карточка не записана"


@pytest.mark.asyncio
async def test_candidate_without_phone_still_asks(crm_stub):
    """У похожего номера нет — судить не по чему, спрашиваем."""

    async def resolve(name, phone=None):
        return {}

    async def similar(name, limit=5):
        return [_candidate(7, "Жасмин", "")]

    crm_stub["monkeypatch"].setattr(customer_repo, "resolve", resolve)
    crm_stub["monkeypatch"].setattr(customer_repo, "similar", similar)

    result = await crm.add_customer(name="ресторан жасмин", phone="+998975773203")

    assert result["needs"] == "confirmation"
    assert not crm_stub["saved"], "карточка завелась до ответа человека"


@pytest.mark.asyncio
async def test_question_is_addressed_to_a_human(crm_stub):
    """В вопросе — телефоны и человеческие слова, а не инструкция для машины.

    «Повтори с force_new» руководитель выполнить не может: в чате нет ни такой
    кнопки, ни такого языка. Инструкция модели живёт в отдельном ключе.
    """

    async def resolve(name, phone=None):
        return {}

    async def similar(name, limit=5):
        return [_candidate(28, "Noxat", "+998907776655")]

    crm_stub["monkeypatch"].setattr(customer_repo, "resolve", resolve)
    crm_stub["monkeypatch"].setattr(customer_repo, "similar", similar)

    result = await crm.add_customer(name="Nozi")

    question = result["error"]
    assert "force_new" not in question, "машинная инструкция ушла человеку"
    assert "+998907776655" in question, "без телефона тёзку не отличить"
    assert "force_new" in result["hint"], "модели подсказка всё же нужна"
    # Заявка для кнопок: без неё ответить можно будет только заново диктуя всё.
    assert result["data"]["pending"]["name"] == "Nozi"
    assert result["data"]["candidates"][0]["id"] == 28


@pytest.mark.asyncio
async def test_force_new_skips_the_search_entirely(crm_stub):
    """Ответ «нет, это новый» не должен снова упираться в тех же похожих."""

    async def boom(*args, **kwargs):
        raise AssertionError("после force_new поиск похожих не нужен")

    crm_stub["monkeypatch"].setattr(customer_repo, "resolve", boom)
    crm_stub["monkeypatch"].setattr(customer_repo, "similar", boom)

    result = await crm.add_customer(name="Nozi", phone="+998975773203", force_new=True)

    assert result["created"] is True
    assert crm_stub["saved"][0]["match_by_name"] is False
