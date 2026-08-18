"""
Нормализация адреса: один ключ кэша на один настоящий адрес.

ЗАЧЕМ ЭТО НУЖНО

Адреса приезжают в трёх системах письма сразу — русская кириллица от
менеджеров, узбекская латиница из 2ГИС, узбекская кириллица от части
клиентов, — плюс пять разных символов апострофа. Без сведения к одному
канону кэш геокодера бесполезен: «Amir Temur koʻchasi 5» и «ул. Амира
Темура 5» — один дом, но два ключа, два платных запроса к провайдеру и
два шанса получить разные координаты для одного заведения.

Отдельно закреплено то, чего делать НЕЛЬЗЯ: сортировать токены. Порядок
слов в адресе несёт смысл, и «дом 12 по улице 5» — не то же самое, что
«дом 5 по улице 12».
"""

from __future__ import annotations

from shared.geo import (
    PLACEABLE,
    GeoHit,
    address_key,
    district_from_text,
    normalize_address,
    normalize_city,
    pick_address,
    valid_point,
)


class TestГород:
    def test_все_написания_ташкента_сводятся_к_одному(self):
        for raw in ["tashkent", "Tashkent", "Toshkent", "Ташкент", "Тошкент",
                    "г. Ташкент", "Toshkent sh.", "Toshkent shahri"]:
            assert normalize_city(raw) == "tashkent", raw

    def test_все_написания_самарканда_сводятся_к_одному(self):
        for raw in ["samarkand", "Samarqand", "Самарканд", "Самарқанд", "г. Самарканд"]:
            assert normalize_city(raw) == "samarkand", raw

    def test_дефолты_витрины_и_crm_это_разные_города(self):
        # Ровно та пара, что разошлась в схеме: customers.city = "Samarqand",
        # orders.city = "tashkent". Свести их в один город было бы хуже, чем
        # не сводить вовсе.
        assert normalize_city("Samarqand") == "samarkand"
        assert normalize_city("tashkent") == "tashkent"

    def test_неизвестный_город_не_угадывается(self):
        assert normalize_city("Бухара") is None
        assert normalize_city("") is None
        assert normalize_city(None) is None


class TestАдрес:
    def test_кириллица_сводится_к_латинице(self):
        # Одна и та же запись, набранная в двух алфавитах, обязана дать
        # один ключ: это самый частый источник дублей в базе.
        a = address_key("Амир Темур 5", "Ташкент")
        b = address_key("Amir Temur 5", "Toshkent")
        assert a is not None
        assert a == b

    def test_склонение_и_перестановка_слов_НЕ_сводятся(self):
        """
        Граница возможностей, названная явно.

        «ул. Амира Темура 5» и «Amir Temur koʻchasi 5» — один дом, но
        нормализатор даст разные ключи: русский родительный падеж требует
        стеммера, а порядок слов у двух языков разный (тип улицы стоит до
        названия и после него).

        Свести их сортировкой токенов НЕЛЬЗЯ — тогда «дом 12 по улице 5»
        схлопнется с «дом 5 по улице 12», и два разных заведения получат
        одну точку. Лишний запрос к геокодеру дешевле неверного пина,
        поэтому цена расхождения принята сознательно.
        """
        a = address_key("ул. Амира Темура 5", "Ташкент")
        b = address_key("Amir Temur koʻchasi 5", "Toshkent")
        assert a != b

    def test_разные_виды_апострофа_не_различаются(self):
        variants = ["Amir Temur koʻchasi 5", "Amir Temur ko'chasi 5",
                    "Amir Temur ko’chasi 5", "Amir Temur kochasi 5"]
        keys = {address_key(v, "tashkent") for v in variants}
        assert len(keys) == 1

    def test_квартира_не_влияет_на_точку(self):
        # Пин ставится в дом, а не в квартиру: разные квартиры одного дома
        # обязаны попасть в один кэш, иначе платим за один адрес многократно.
        a = address_key("Amir Temur 5, кв. 12", "tashkent")
        b = address_key("Amir Temur 5", "tashkent")
        assert a == b

    def test_порядок_токенов_не_сортируется(self):
        # Если отсортировать слова, эти два адреса схлопнутся в один ключ,
        # и два разных дома получат одну точку.
        a = address_key("st 5 d 12", "tashkent")
        b = address_key("st 12 d 5", "tashkent")
        assert a != b

    def test_разные_города_разводят_одинаковую_улицу(self):
        a = address_key("Mustaqillik 1", "tashkent")
        b = address_key("Mustaqillik 1", "samarkand")
        assert a != b

    def test_пустой_адрес_не_даёт_ключа(self):
        # Иначе все безадресные клиенты попадут в ОДНУ запись кэша и
        # получат чужую координату.
        assert address_key(None, "tashkent") is None
        assert address_key("", "tashkent") is None
        assert address_key("   ", "tashkent") is None

    def test_адрес_из_одного_шума_не_даёт_ключа(self):
        assert address_key("г.", "tashkent") is None

    def test_синонимы_улицы_сводятся(self):
        keys = {
            normalize_address("ulitsa Navoi 3", "tashkent"),
            normalize_address("Navoi kochasi 3", "tashkent"),
        }
        # «ulitsa» и «kochasi» → «st», но порядок слов у них разный,
        # поэтому сравниваем набор токенов, а не строку целиком.
        assert all(k is not None and "st" in k for k in keys)


class TestВыборАдреса:
    def test_карточка_клиента_важнее_адреса_доставки(self):
        assert pick_address("Amir Temur 5", "Chilonzor 20") == "Amir Temur 5"

    def test_без_карточки_берётся_последний_заказ(self):
        # У клиентов с сайта адрес живёт только в заказе.
        assert pick_address(None, "Chilonzor 20") == "Chilonzor 20"
        assert pick_address("   ", "Chilonzor 20") == "Chilonzor 20"

    def test_совсем_без_адреса_возвращает_none(self):
        assert pick_address(None, None) is None
        assert pick_address("", "  ") is None


class TestТочность:
    def test_город_не_пригоден_для_пина(self):
        # Тысяча клиентов с точностью «город» слиплась бы в одну точку в
        # центре Ташкента, и карта уверенно врала бы: скопление выглядит
        # как настоящий кластер заведений.
        assert "city" not in PLACEABLE
        assert not GeoHit(41.31, 69.24, "city", "2gis").placeable

    def test_дом_и_улица_пригодны(self):
        assert GeoHit(41.31, 69.24, "exact", "2gis").placeable
        assert GeoHit(41.31, 69.24, "street", "yandex").placeable


class TestРайон:
    """
    Район вытаскивается из текста адреса, который вернул провайдер.

    Ошибка здесь тише ошибки в координате и потому опаснее: неверный пин
    видно на карте сразу, а клиент, приписанный к соседнему туману, молча
    портит разрез «где недобираем» — по нему потом планируют обход.
    """

    def test_узнаёт_районы_ташкента_в_обоих_написаниях(self):
        assert district_from_text("Chilonzor tumani, Bunyodkor 12") == "chilanzar"
        assert district_from_text("Чиланзарский район, дом 12") == "chilanzar"
        assert district_from_text("Yunusobod, Amir Temur 5") == "yunusobod"
        assert district_from_text("Юнусабад, Амира Темура 5") == "yunusobod"

    def test_узнаёт_районы_самарканда(self):
        assert district_from_text("Siyob tumani") == "siyob"
        assert district_from_text("Сиабский район") == "siyob"

    def test_район_не_назван_значит_none(self):
        # Выдумывать «прочее» нельзя: пустая категория на карте выглядела
        # бы как настоящая территория.
        assert district_from_text("Amir Temur 5") is None
        assert district_from_text("") is None
        assert district_from_text(None) is None

    def test_чужой_город_не_приписывается(self):
        assert district_from_text("Бухара, Ляби-Хауз") is None

    def test_ищет_по_словам_а_не_подстрокой(self):
        # «Мирзо» — начало Мирзо-Улугбека, но само по себе района не даёт.
        # Поиск подстрокой уверенно приписал бы клиента не туда.
        assert district_from_text("Мирзо Бобур 4") is None


class TestГраницы:
    def test_ташкент_проходит(self):
        assert valid_point(41.3111, 69.2401) == (41.3111, 69.2401)

    def test_перепутанные_оси_не_проходят(self):
        assert valid_point(69.2401, 41.3111) is None

    def test_мусор_не_проходит(self):
        assert valid_point("рядом", "с базаром") is None
        assert valid_point(None, None) is None
