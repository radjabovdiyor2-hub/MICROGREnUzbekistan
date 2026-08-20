"""
Справочник заведений: категории, аудитория, дедуп по городу.

ЧТО ЗДЕСЬ ЗАКРЕПЛЕНО И ПОЧЕМУ

До этих правок сбор физически не мог наполнить карту областью:

* `company_type` стоял константой "restaurant" во всех четырёх сборщиках —
  фитнес-клуб, собранный ночной задачей, ложился в базу рестораном;
* `import_leads` писал `city = settings.lead_gen_city` независимо от того,
  по какому городу шёл сбор, — Ургут записывался Самаркандом;
* дедуп по названию шёл по всей базе, и два разных «Кафе Дружба» в разных
  туманах склеивались в одно заведение: второго в базе просто не возникало.

Ни одна из трёх ошибок ничего не роняла. Все три давали неверные данные,
которые выглядят как правда, — поэтому и закреплены тестом.
"""

from __future__ import annotations

import pytest

from shared.lead_gen import (
    SAMARKAND_PLACES,
    VENUE_LABELS_RU,
    VENUE_QUERIES,
    _lead_from_dgis,
    _lead_from_google,
    _lead_from_yandex,
    city_key,
    guess_audience,
    is_same_place,
    meters_between,
    venue_label,
)

# Регистан, Самарканд.
SAMARKAND = (39.6547, 66.9758)


class TestGuessAudience:
    """Пол зала по названию. Догадка, а не факт: помечается 'guess'."""

    @pytest.mark.parametrize(
        "name",
        [
            "Ayollar fitnes klubi",
            "Женский фитнес-клуб «Нафис»",
            "Fitness Lady",
            "Women's Gym Samarkand",
            "Qizlar sport zali",
        ],
    )
    def test_женские_залы_узнаются(self, name):
        assert guess_audience(name) == "female"

    @pytest.mark.parametrize(
        "name",
        ["Erkaklar sport zali", "Мужской тренажёрный зал", "Iron Mens Club"],
    )
    def test_мужские_залы_узнаются(self, name):
        assert guess_audience(name) == "male"

    @pytest.mark.parametrize(
        "name",
        [
            "Fitness House",
            "Sport Complex Registon",
            "Тренажёрный зал на Мирзо Улугбека",
            "",
            None,
        ],
    )
    def test_без_признака_в_названии_догадки_нет(self, name):
        # None — это «не выяснено», и продавец спросит при первом звонке.
        # Выдуманное «смешанный» закрыло бы открытый вопрос молча.
        assert guess_audience(name) is None

    def test_men_внутри_women_не_делает_зал_мужским(self):
        # «men» отдельным маркером перевело бы В МУЖСКИЕ половину женских
        # клубов — оно сидит внутри «women» и десятка узбекских слов.
        assert guess_audience("Women Fitness") == "female"
        assert guess_audience("Development Gym") is None

    def test_оба_признака_разом_это_не_повод_гадать(self):
        assert guess_audience("Ayollar va erkaklar uchun sport zali") is None


class TestVenueQueries:
    """Справочник категорий — зеркало companyTypes.ts."""

    def test_запросы_есть_у_каждой_категории(self):
        for category, queries in VENUE_QUERIES.items():
            assert queries, f"у категории {category} нет ни одного запроса"
            assert all(q.strip() for q in queries), category

    def test_ключевые_категории_на_месте(self):
        # Ровно то, ради чего затевался обход области.
        for category in ("restaurant", "cafe", "toyxona", "fitness"):
            assert category in VENUE_QUERIES

    def test_у_каждой_категории_есть_русская_подпись(self):
        # Без неё КП уходит со словом «заведение» вместо «тойхона».
        for category in VENUE_QUERIES:
            assert category in VENUE_LABELS_RU, category

    def test_тойхона_ищется_и_по_русски_и_по_узбекски(self):
        queries = " ".join(VENUE_QUERIES["toyxona"]).lower()
        assert "тойхона" in queries
        assert "toyxona" in queries

    def test_обход_области_накрывает_четырнадцать_туманов_плюс_город(self):
        assert len(SAMARKAND_PLACES) == 15
        districts = {slug for _, slug in SAMARKAND_PLACES if slug}
        assert {"urgut", "kattaqorgon", "jomboy", "payariq"} <= districts

    def test_слаги_районов_знает_геокодер(self):
        # Иначе сбор пишет в базу район, который geo.py не распознаёт и не
        # проставит сам, а интерфейс покажет сырым слагом. Список районов
        # существует трижды: здесь, в geo._DISTRICTS и в districts.ts —
        # и расходится молча.
        from shared.geo import _DISTRICTS

        known = set(_DISTRICTS.values())
        for _, slug in SAMARKAND_PLACES:
            if slug:
                assert slug in known, f"geo.py не знает район «{slug}»"

    def test_у_города_района_нет(self):
        # В Самарканде их два, и какой именно — знает геокодер по адресу.
        # Проставить один на весь город значило бы соврать половине точек.
        city, district = SAMARKAND_PLACES[0]
        assert "амарканд" in city
        assert district is None


class TestVenueLabel:
    def test_фитнес_называется_с_полом_зала(self):
        assert venue_label("fitness", "female") == "фитнес-клуб (женский)"

    def test_без_аудитории_только_тип(self):
        assert venue_label("toyxona") == "свадебный ресторан (тойхона)"

    def test_неизвестный_тип_это_заведение_а_не_пустота(self):
        assert venue_label(None) == "заведение"
        assert venue_label("вымысел") == "заведение"


class TestCollectorsCarryCategory:
    """`company_type` — параметр, а не константа "restaurant"."""

    def test_2gis_кладёт_переданную_категорию(self):
        lead = _lead_from_dgis(
            {"name": "Ayollar fitnes", "id": "7", "point": {"lat": 39.65, "lon": 66.97}},
            "Urgut",
            "fitness",
            "urgut",
        )
        assert lead["company_type"] == "fitness"
        assert lead["city"] == "Urgut"
        assert lead["district"] == "urgut"
        # Пол зала угадан по названию и честно помечен догадкой.
        assert lead["audience"] == "female"
        assert lead["audience_source"] == "guess"

    def test_google_кладёт_переданную_категорию(self):
        lead = _lead_from_google(
            {"name": "Toy zali Nur", "place_id": "p1"}, "Jomboy", "toyxona", "jomboy"
        )
        assert lead["company_type"] == "toyxona"
        assert lead["district"] == "jomboy"

    def test_yandex_кладёт_переданную_категорию(self):
        feature = {"properties": {"CompanyMetaData": {"name": "Choyxona", "id": "y1"}}}
        lead = _lead_from_yandex(feature, "Urgut", "chaikhana", "urgut")
        assert lead["company_type"] == "chaikhana"
        assert lead["city"] == "Urgut"


class TestCityKey:
    """Ключ дедупа по городу: населённые пункты области — одна зона."""

    def test_районные_центры_сводятся_к_самарканду(self):
        assert city_key("Urgut") == "samarkand"
        assert city_key("Каттакурган") == "samarkand"
        assert city_key("Samarqand") == "samarkand"

    def test_ташкент_это_другая_зона(self):
        assert city_key("Toshkent") == "tashkent"
        assert city_key("Urgut") != city_key("Toshkent")

    def test_неизвестное_написание_не_выдумывается(self):
        # Свести незнакомый город к «самарканду» значило бы склеить дедупом
        # заведения из разных областей.
        assert city_key("Бухара") == "бухара"
        assert city_key(None) == ""


class TestSamePlace:
    """Одноимённые заведения: то же самое или разные."""

    def test_разнесённые_точки_это_разные_заведения(self):
        # «Кафе Дружба» в Ургуте и в Джамбае существуют обе.
        far = (39.40, 67.24)  # Ургут, ~30 км от Регистана
        assert meters_between(SAMARKAND, far) > 1000
        assert is_same_place([SAMARKAND], far) is False

    def test_соседние_точки_это_одна_карточка(self):
        near = (SAMARKAND[0] + 0.001, SAMARKAND[1])  # ~110 м
        assert is_same_place([SAMARKAND], near) is True

    def test_без_координат_считаем_дублем(self):
        # Осторожность дешевле: второй «Ресторан Registon» портит и обзвон,
        # и отчёт, а пропущенное заведение вернётся следующим сбором.
        assert is_same_place([SAMARKAND], None) is True
        assert is_same_place([None], SAMARKAND) is True

    def test_хватает_одной_близкой_из_нескольких(self):
        far = (39.40, 67.24)
        near = (SAMARKAND[0] + 0.001, SAMARKAND[1])
        assert is_same_place([far, SAMARKAND], near) is True
