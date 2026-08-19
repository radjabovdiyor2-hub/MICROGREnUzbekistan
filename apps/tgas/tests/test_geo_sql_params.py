"""
Геокодер: что уходит в SQL параметрами — на заглушках, без БД и сети.

ЗАЧЕМ ЭТОТ ФАЙЛ

Граница Python ↔ Postgres укусила дважды за сутки, и оба раза молча для
компилятора и остальных тестов:

  * `/ingest/order` получал `created_at` СТРОКОЙ, а asyncpg требует datetime —
    падала вся вставка заказа, не только дата;
  * геокодер писал `geocoded_at` как `datetime.now(timezone.utc)`, а колонка
    `customers.geocoded_at` — `timestamp without time zone`. Первый же
    успешно найденный адрес ронял ВЕСЬ проход: «can't subtract offset-naive
    and offset-aware datetimes».

Второй дефект жил незамеченным месяцами, потому что до записи дело не
доходило: сперва не было ключа геокодера, потом пустой `INGEST_SECRET`
отбивал запрос 401-м.

Тест проверяет ПРАВИЛО, а не строку кода: ни один параметр, уходящий в SQL,
не должен быть datetime с часовым поясом. Время в этих таблицах ставит база
(`NOW()`), и значение из Python туда либо не нужно, либо разойдётся с
соседними колонками на величину пояса.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime

import pytest


class Recorder:
    """Заглушка сессии: запоминает SQL и связанные с ним параметры."""

    def __init__(self, rows):
        self._rows = rows
        self.calls: list[tuple[str, dict]] = []

    async def execute(self, statement, params=None):
        query = " ".join(str(statement).split())
        self.calls.append((query, dict(params or {})))
        rows = self._rows if "FROM customers c" in query else []

        class Result:
            def all(self):
                return rows

            # Промах кэша: адрес геокодируется заново, а результат кладётся
            # в geocode_cache — оба запроса тоже попадают в проверку.
            def first(self):
                return None

            def fetchone(self):
                return None

            def scalar(self):
                return None

        return Result()

    async def commit(self):
        pass

    def params_for(self, fragment: str) -> dict:
        for query, params in self.calls:
            if fragment in query:
                return params
        raise AssertionError(f"запрос с «{fragment}» не выполнялся: {self.calls}")


@pytest.fixture
def geocoder(monkeypatch):
    """Один клиент без координат и провайдер, который всегда находит дом."""
    from shared import geo

    recorder = Recorder([(44, "Мирзо Улугбека 16А", "Samarqand", None)])

    @asynccontextmanager
    async def fake_ctx():
        yield recorder

    async def always_finds(_http, _query):
        return geo.GeoHit(39.628401, 66.984097, "exact", "2gis", district="registon")

    monkeypatch.setattr(geo, "get_session_ctx", fake_ctx)
    monkeypatch.setattr(geo, "_providers", lambda: [("2gis", always_finds)])
    # Пауза между обращениями к провайдеру тесту не нужна.
    monkeypatch.setattr(geo, "RATE_LIMIT_SECONDS", 0)
    return geo, recorder


def aware_datetimes(params: dict) -> list[str]:
    """Имена параметров, где лежит datetime с поясом."""
    return [
        name
        for name, value in params.items()
        if isinstance(value, datetime) and value.tzinfo is not None
    ]


@pytest.mark.asyncio
async def test_geocoder_binds_no_timezone_aware_datetimes(geocoder):
    """Ни один параметр прохода не должен нести часовой пояс."""
    geo, recorder = geocoder

    result = await geo.geocode_pass(batch=10)
    assert result["ok"] is True, result
    assert result["placed"] == 1, result

    offenders = [
        (query[:60], names)
        for query, params in recorder.calls
        if (names := aware_datetimes(params))
    ]
    assert not offenders, (
        "datetime с поясом уходит в колонку timestamp without time zone — "
        f"asyncpg уронит весь проход: {offenders}"
    )


@pytest.mark.asyncio
async def test_geocoded_at_is_set_by_database(geocoder):
    """Отметку о геокодировании ставит NOW(), а не Python."""
    geo, recorder = geocoder

    await geo.geocode_pass(batch=10)
    query, params = next(
        (q, p) for q, p in recorder.calls if "UPDATE customers SET latitude" in q
    )

    assert "geocoded_at = NOW()" in query
    # Ни одного параметра-времени: снятие зоны в Python записало бы UTC в
    # колонку, где соседний updated_at пишется местным NOW() той же строкой.
    assert "now" not in params
    assert params["lat"] == 39.628401 and params["prec"] == "exact"


@pytest.mark.asyncio
async def test_coarse_hit_is_not_placed(monkeypatch, geocoder):
    """Точность «город» — не координата, а центр города: пин не ставим.

    Иначе клиенты с адресом «Ташкент» слиплись бы в одну точку, и карта
    уверенно врала бы: скопление выглядит как реальный кластер заведений.
    """
    geo, recorder = geocoder

    async def only_city(_http, _query):
        return geo.GeoHit(41.311081, 69.240562, "city", "2gis")

    monkeypatch.setattr(geo, "_providers", lambda: [("2gis", only_city)])

    result = await geo.geocode_pass(batch=10)
    assert result["too_coarse"] == 1 and result["placed"] == 0
    assert not any("UPDATE customers SET latitude" in q for q, _ in recorder.calls)
