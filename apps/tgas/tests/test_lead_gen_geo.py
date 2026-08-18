"""
Координаты лидов: у каждого источника свой формат, и один из них перевёрнут.

СЛУЧАЙ, РАДИ КОТОРОГО ЭТИ ТЕСТЫ НАПИСАНЫ

`collect_from_2gis` с самого начала запрашивала поле `items.point` — оно
перечислено в параметре `fields` запроса, — но парсер его выбрасывал: в
таблице `customers` не было куда положить. Карта клиентов в админке из-за
этого начиналась с пустого экрана, хотя точные координаты сотен заведений
приезжали к нам даром при каждом сборе лидов.

Теперь координаты сохраняются, и здесь закреплено главное: **порядок осей**.
2ГИС и Google называют оси явно (`lat`/`lon`, `lat`/`lng`), а Яндекс отдаёт
GeoJSON, где координаты идут как [ДОЛГОТА, ШИРОТА] — наоборот. Пара вроде
41.31 / 69.24 валидна в обе стороны, поэтому перестановка ничего не роняет:
она молча уносит ташкентский ресторан в Индийский океан.
"""

from __future__ import annotations

from shared.lead_gen import (
    point_from_dgis,
    point_from_google,
    point_from_yandex,
)

# Плов Центр на Амира Темура: широта 41.31, долгота 69.24.
TASHKENT_LAT = 41.3111
TASHKENT_LON = 69.2401


class TestDgis:
    def test_берёт_явно_названные_оси(self):
        item = {"point": {"lat": TASHKENT_LAT, "lon": TASHKENT_LON}}
        assert point_from_dgis(item) == (TASHKENT_LAT, TASHKENT_LON)

    def test_без_точки_возвращает_none(self):
        assert point_from_dgis({}) is None
        assert point_from_dgis({"point": {}}) is None
        assert point_from_dgis({"point": None}) is None

    def test_строки_приводятся_к_числам(self):
        item = {"point": {"lat": "41.3111", "lon": "69.2401"}}
        assert point_from_dgis(item) == (TASHKENT_LAT, TASHKENT_LON)

    def test_мусор_вместо_числа_не_ломает_сбор(self):
        assert point_from_dgis({"point": {"lat": "рядом", "lon": "с базаром"}}) is None


class TestGoogle:
    def test_читает_geometry_location(self):
        item = {"geometry": {"location": {"lat": TASHKENT_LAT, "lng": TASHKENT_LON}}}
        assert point_from_google(item) == (TASHKENT_LAT, TASHKENT_LON)

    def test_без_геометрии_возвращает_none(self):
        assert point_from_google({}) is None
        assert point_from_google({"geometry": {}}) is None


class TestYandex:
    def test_переворачивает_geojson_обратно(self):
        """Яндекс отдаёт [долгота, широта] — мы обязаны вернуть (широта, долгота)."""
        feature = {"geometry": {"coordinates": [TASHKENT_LON, TASHKENT_LAT]}}
        assert point_from_yandex(feature) == (TASHKENT_LAT, TASHKENT_LON)

    def test_не_читает_geojson_как_есть(self):
        """Прямое чтение дало бы (69.24, 41.31) — точку вне Узбекистана."""
        feature = {"geometry": {"coordinates": [TASHKENT_LON, TASHKENT_LAT]}}
        lat, lon = point_from_yandex(feature)
        assert lat < lon, "широта Узбекистана всегда меньше его долготы"

    def test_неполные_координаты_отбрасываются(self):
        assert point_from_yandex({"geometry": {"coordinates": [69.24]}}) is None
        assert point_from_yandex({"geometry": {"coordinates": []}}) is None
        assert point_from_yandex({}) is None


class TestГраницыСтраны:
    """
    Точка вне Узбекистана — это не «далёкий ресторан», а перепутанные оси
    или мусор провайдера. Сохранять её нельзя: пин посреди океана выглядит
    на карте как настоящие данные и порождает решения на основе выдумки.
    """

    def test_перепутанные_оси_отсекаются_границами(self):
        # Ровно та же пара, но записанная наоборот: широта 69 не существует
        # в Узбекистане, и это единственный признак, по которому видно ошибку.
        assert point_from_dgis({"point": {"lat": TASHKENT_LON, "lon": TASHKENT_LAT}}) is None

    def test_москва_не_проходит(self):
        assert point_from_dgis({"point": {"lat": 55.75, "lon": 37.62}}) is None

    def test_нулевой_остров_не_проходит(self):
        assert point_from_dgis({"point": {"lat": 0, "lon": 0}}) is None

    def test_самарканд_проходит(self):
        assert point_from_dgis({"point": {"lat": 39.6542, "lon": 66.9597}}) == (
            39.6542,
            66.9597,
        )
