"""
Поиск товара «как назвал человек» — на заглушке каталога, без БД.

Оба случая взяты из живой переписки группы «Продажа» 12.08.2026:

  · «Продажа ресторан жасмин МИКРОЗЕЛЕНЬ ГОРОХА» — бот ответил, что товара нет,
    и открыл выбор из 18 позиций. Поиск шёл подстрокой по имени: «микрозелень»
    в названии товара отсутствует (это категория), а «гороха» — родительный
    падеж, подстрокой в «Горох» не входит;
  · «Продажа ресторан жасмин РУККОЛА» — бот не спросил, какая именно, и молча
    взял «Руккола (100 г)», то есть бейби-лист за 25 000 вместо микрозелени за
    15 000. `resolve()` брал `exact[0]` при двух точных совпадениях.

Тёзок в прайсе шесть: Руккола, Базилик, Мангольд, Татсой и обе Мизуны есть и в
микрозелени, и в бейби-листе. Поэтому проверяем не частный случай рукколы, а
правило.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest

from shared import catalog_repo


# Подмножество настоящего прайса: id, name_ru, name_uz, price, stock, слаг
# категории, is_active, единица, описания. Порядок колонок — как в _FIELDS.
CATALOG = [
    ("p_gorokh", "Горох", "No'xat", 15000, 10, "microgreens", True, "лоток", None, None),
    ("p_rukkola_m", "Руккола", "Rukkola", 15000, 10, "microgreens", True, "лоток", None, None),
    ("p_kress", "Кресс-салат", "Kress-salat", 15000, 10, "microgreens", True, "лоток", None, None),
    ("p_gorchica", "Горчица", "Xantal", 15000, 10, "microgreens", True, "лоток", None, None),
    ("p_sango", "Редис Санго", "Sango turp", 15000, 10, "microgreens", True, "лоток", None, None),
    ("p_rukkola_b", "Руккола", "Rukkola", 25000, 10, "baby-leaf", True, "100 г", None, None),
    ("p_shpinat", "Шпинат", "Ismaloq", 25000, 10, "baby-leaf", True, "100 г", None, None),
    ("p_ayserg", "Айсберг", "Aysberg", 30000, 10, "salads", True, "кг", None, None),
]


class FakeSession:
    """Отвечает на SQL каталога так же, как ответил бы Postgres.

    Разбирается ровно то, чем пользуется catalog_repo: ILIKE ANY по имени,
    фильтр по слагу категории и выборка всей категории целиком (её читает
    морфологический проход). Нечёткий проход pg_trgm заглушка не изображает —
    он и на живой базе включается только там, где расширение установлено.
    """

    def __init__(self, rows=CATALOG):
        self.rows = rows
        self.queries: list[str] = []

    async def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        self.queries.append(sql)
        params = params or {}

        if "word_similarity" in sql:
            raise RuntimeError("pg_trgm не установлен")

        rows = [r for r in self.rows if r[6]]

        category = params.get("cat")
        if category:
            rows = [r for r in rows if r[5] == category]

        patterns = self._patterns(statement, params)
        if patterns is not None:
            rows = [r for r in rows if self._matches(r, patterns)]

        class Result:
            def __init__(self, data):
                self._data = data

            def fetchall(self):
                return self._data

            def fetchone(self):
                return self._data[0] if self._data else None

        return Result(rows)

    @staticmethod
    def _patterns(statement, params):
        """Значения ILIKE-паттернов, если запрос вообще фильтрует по имени."""
        collected: list[str] = []
        for bind in getattr(statement, "_bindparams", {}).values():
            if isinstance(bind.value, (list, tuple)) and bind.key != "vars":
                collected.extend(str(v) for v in bind.value)
        if not collected:
            return None
        return collected

    @staticmethod
    def _matches(row, patterns) -> bool:
        haystack = f"{row[1] or ''}\n{row[2] or ''}".lower()
        for pattern in patterns:
            needle = pattern.strip("%").lower()
            if needle and needle in haystack:
                return True
        return False


@pytest.fixture
def catalog(monkeypatch):
    session = FakeSession()

    @asynccontextmanager
    async def fake_ctx():
        yield session

    monkeypatch.setattr(catalog_repo, "get_session_ctx", fake_ctx)
    return session


# ── Случай 1: падеж и слово-категория ────────────────────────────────────

@pytest.mark.asyncio
async def test_genitive_finds_nominative(catalog):
    """«гороха» находит «Горох» — падеж не должен прятать товар."""
    found = await catalog_repo.find("гороха")
    assert [p["id"] for p in found] == ["p_gorokh"]


@pytest.mark.asyncio
async def test_category_word_plus_genitive(catalog):
    """Тот самый запрос из переписки: «микрозелень гороха».

    Раньше отвечал пустотой: «микрозелень» искалось в НАЗВАНИИ товара, где его
    нет ни у одной из 34 позиций, а «гороха» не входит подстрокой в «Горох».
    """
    outcome = await catalog_repo.resolve("микрозелень гороха")
    assert outcome.get("product"), f"товар не найден: {outcome}"
    assert outcome["product"]["id"] == "p_gorokh"
    assert outcome["product"]["unit"] == "лоток"


@pytest.mark.asyncio
async def test_category_word_disambiguates_twins(catalog):
    """«микрозелень рукколы» — это ОДНА руккола, вопрос задавать не о чем."""
    outcome = await catalog_repo.resolve("микрозелень рукколы")
    assert outcome.get("product"), f"товар не найден: {outcome}"
    assert outcome["product"]["id"] == "p_rukkola_m"
    assert outcome["product"]["price"] == 15000


@pytest.mark.asyncio
async def test_loanword_category_survives_morphology(catalog):
    """«бейби руккола» — это бейби-лист, а не выбор из двух тёзок.

    Морфология портит заимствования: pymorphy3 разбирает «бейби» как форму
    глагола «бейбить», а «беби» как «бести». Поэтому слово-категория ищется и
    в исходном виде, а не только в нормальной форме.
    """
    outcome = await catalog_repo.resolve("бейби руккола")
    assert outcome.get("product"), f"категория не распознана: {outcome}"
    assert outcome["product"]["id"] == "p_rukkola_b"
    assert outcome["product"]["price"] == 25000


@pytest.mark.asyncio
async def test_bare_category_word_offers_the_category(catalog):
    """«микрозелень» одним словом — это ВЫБОР, а не «товара нет в каталоге».

    Третий случай из той же переписки. Слово-категория без имени товара
    проходило все пять проходов впустую, и отдел продаж отвечал «Товара
    «микрозелень» нет в каталоге. Назовите цену — заведу его в магазин и CRM»,
    то есть предлагал завести товар с названием целой категории. Ответить на
    это было нечем: кнопки ввода цены нет, пока цена неизвестна, — и продажу
    отменили.
    """
    outcome = await catalog_repo.resolve("микрозелень")
    assert "candidates" in outcome, f"категория не раскрыта: {outcome}"
    ids = {c["id"] for c in outcome["candidates"]}
    assert ids == {"p_gorokh", "p_rukkola_m", "p_kress", "p_gorchica", "p_sango"}
    assert all(c["category_slug"] == "microgreens" for c in outcome["candidates"])


@pytest.mark.asyncio
async def test_bare_category_word_does_not_hide_a_real_product(catalog):
    """«салат» — сначала товар «Кресс-салат», и только потом категория.

    Раскрытие категории стоит ПОСЛЕ поиска по имени намеренно: иначе слово
    «салат» превратилось бы в фильтр и увело от товара, который так и зовут.
    """
    outcome = await catalog_repo.resolve("салат")
    assert outcome.get("product"), f"товар не найден: {outcome}"
    assert outcome["product"]["id"] == "p_kress"


@pytest.mark.asyncio
async def test_category_word_in_product_name_is_not_a_filter(catalog):
    """«Кресс-салат» — имя товара, а не «что-то из категории салатов».

    Проход по целому запросу идёт ДО отделения категории именно ради этого:
    иначе слово «салат» увело бы поиск в категорию салатов, где кресса нет.
    """
    outcome = await catalog_repo.resolve("кресс-салат")
    assert outcome.get("product"), f"товар не найден: {outcome}"
    assert outcome["product"]["id"] == "p_kress"


# ── Случай 2: тёзки ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_twins_ask_instead_of_guessing(catalog):
    """«руккола» — две позиции в разных категориях, нужен выбор.

    Здесь бралась первая по `ORDER BY p.name_ru`, а у тёзок этот порядок
    произволен: продажа уходила бейби-листом за 25 000 вместо микрозелени за
    15 000 — не тот товар, не та цена, не тот остаток.
    """
    outcome = await catalog_repo.resolve("руккола")
    assert "product" not in outcome, "молча выбран один из тёзок"

    candidates = outcome.get("candidates") or []
    assert {c["id"] for c in candidates} == {"p_rukkola_m", "p_rukkola_b"}
    # Кандидаты должны отличаться на вид — иначе выбор бессмысленен.
    assert {c["unit"] for c in candidates} == {"лоток", "100 г"}


@pytest.mark.asyncio
async def test_single_exact_match_still_resolves(catalog):
    """У товара без тёзки вопрос не появляется."""
    outcome = await catalog_repo.resolve("шпинат")
    assert outcome.get("product", {}).get("id") == "p_shpinat"


# ── Что нельзя сломать ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_translit_and_layout_still_work(catalog):
    """Транслит и исправленная раскладка жили здесь до морфологии."""
    for query in ("санго", "sango", "cfyuj"):
        found = await catalog_repo.find(query)
        assert [p["id"] for p in found] == ["p_sango"], f"«{query}» не нашёл Санго"


@pytest.mark.asyncio
async def test_unknown_product_is_not_invented(catalog):
    """Товара нет — так и говорим. Догадка здесь дороже отказа."""
    assert await catalog_repo.resolve("вертолёт") == {}


@pytest.mark.asyncio
async def test_morph_requires_all_words(catalog):
    """«горох» не должен вытягивать «Горчицу» только потому, что она рядом."""
    found = await catalog_repo.find("гороха")
    assert all(p["id"] != "p_gorchica" for p in found)


@pytest.mark.asyncio
async def test_stub_has_no_fuzzy_fallback(catalog):
    """Заглушка обязана падать на pg_trgm — как база без расширения.

    Отвечай она строками, проверки выше проходили бы через нечёткий проход и
    про морфологию не доказывали бы ничего.
    """
    await catalog_repo.find("микрозелень гороха")
    assert any("word_similarity" not in q for q in catalog.queries)
    with pytest.raises(RuntimeError):
        await catalog.execute("SELECT word_similarity(:v, x)")
