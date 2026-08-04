"""
Опознание клиента: телефон и название — без БД, на чистых функциях.

Каждая проверка соответствует наблюдавшейся поломке: в админке лежали «Жасмин»,
«Ресторан Жасмин» и «Jasmina» — три карточки одного ресторана, — а продажа
каждый раз заводила четвёртую и заново спрашивала телефон.

То, что здесь можно проверить без базы, — именно причина: правило «тот же
номер» и правило «то же название». Сам поиск проверяется цепью продажи
(test_sale_chain) и вручную против живой базы.
"""

from __future__ import annotations

import pytest

from shared import customer_repo, phone


# ── Телефон: четыре исторических формата — один клиент ────────────────────


@pytest.mark.parametrize(
    "written",
    [
        "+998979799797",  # sales_ops
        "998979799797",  # instagram_dm
        "979799797",  # api/auth/register — последние 9 цифр
        "+998 97 979-97-97",  # 2ГИС и ручной ввод
        "+998 (97) 979 97 97",
    ],
)
def test_every_historical_format_is_the_same_customer(written):
    """Пять способов записать один номер должны совпасть по ключу поиска.

    Пока форматов было четыре, а сравнение шло строкой, «надёжный» поиск по
    телефону промахивался — и зеркало заводило ресторану вторую карточку.
    """
    assert phone.normalize(written) == "+998979799797"
    assert phone.match_tail(written) == "979799797"


def test_quantity_is_not_a_phone():
    """«97 гороха» — это количество, а не номер.

    Нормализатор обязан вернуть None: пустая строка в `customers.phone`
    выглядела бы как «телефон есть» и ломала бы сопоставление.
    """
    assert phone.normalize("97 гороха") is None
    assert phone.normalize("") is None
    assert phone.normalize(None) is None


def test_display_never_swallows_a_broken_number():
    """Нераспознанное показываем как есть — иначе руководитель увидит пустоту
    вместо испорченных данных и не поймёт, что чинить."""
    assert phone.format_display("+998979799797") == "+998 97 979-97-97"
    assert phone.format_display("не телефон") == "не телефон"


# ── Название: родовые слова не различают клиентов ─────────────────────────


def test_generic_words_are_dropped_from_the_search():
    """«Ресторан Жасмин» ищется по «жасмин».

    Это ровно тот случай из админки: карточка называлась «Жасмин», менеджер
    диктовал «ресторан жасмин», а сравнение шло точным `ILIKE :n` без
    процентов — то есть равенством строк. Совпадения не было никогда.
    """
    assert customer_repo._significant_words("Ресторан Жасмин") == ["жасмин"]
    assert customer_repo._significant_words("Jasmina Restaurant") == ["jasmina"]
    assert customer_repo._significant_words("SAMARQAND OSH MARKAZI N1") == [
        "samarqand",
        "osh",
    ]


def test_query_of_only_generic_words_matches_nothing():
    """«ресторан» не должен возвращать половину базы — различать тут нечем."""
    assert customer_repo._significant_words("ресторан") == []
    assert customer_repo._significant_words("кафе") == []


def test_patterns_cover_both_alphabets():
    """Кириллица и латиница ищутся одним запросом: «Jasmina» находит «Жасмин».

    Варианты написания даёт shared/text_match — тот же механизм, что уже
    работал для товаров и не был подключён к клиентам.
    """
    patterns = customer_repo._patterns(["жасмин"])
    assert "%жасмин%" in patterns
    assert any("jasmin" in p for p in patterns), patterns

    back = customer_repo._patterns(["jasmin"])
    assert any("жасмин" in p for p in back), back
