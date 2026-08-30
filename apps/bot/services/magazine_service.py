"""Текущий номер журнала — из витрины, а не из кода бота.

ПОЧЕМУ ЭТОТ МОДУЛЬ ПОЯВИЛСЯ. Номер знали два места, и оба врали по-своему:
в `handlers/magazine.py` текстом стоял «Выпуск #2, корейская кухня,
пибимпаб», а PDF отдавался по слагу из переменной `MAGAZINE_ISSUE_SLUG` —
то есть читателю рассказывали про один номер, а присылали другой. Слаг при
этом менялся руками при каждом выпуске.

Теперь источник один — карточка номера в базе витрины (`/api/magazine/current`).
Витрина недоступна — честно возвращаем None: бот скажет, что номер сейчас не
отдать, вместо того чтобы прислать чужой файл.
"""

import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
CACHE_TTL = 300  # 5 минут: номер выходит раз в недели, чаще спрашивать незачем


@dataclass
class MagazineIssue:
    number: int
    slug: str
    title_ru: str
    title_uz: Optional[str]
    summary_ru: Optional[str]
    summary_uz: Optional[str]
    topics: list[str]
    restaurant_name: Optional[str]
    cover_url: Optional[str]
    web_url: Optional[str]
    pdf_url: Optional[str]
    magazine_url: str


_cache: Optional[MagazineIssue] = None
_cache_time: float = 0.0


async def fetch_current_issue() -> Optional[MagazineIssue]:
    """Свежий опубликованный номер. None — витрина не ответила или номеров нет."""
    global _cache, _cache_time

    now = time.time()
    if _cache and (now - _cache_time) < CACHE_TTL:
        return _cache

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{WEB_API_URL}/magazine/current", timeout=3.0)
            if response.status_code == 404:
                logger.info("[MagazineService] Опубликованных номеров нет")
                return None
            response.raise_for_status()
            data = response.json()

        issue = MagazineIssue(
            number=int(data.get("number", 0)),
            slug=str(data.get("slug", "")),
            title_ru=str(data.get("titleRu", "FRESH WEEKLY")),
            title_uz=data.get("titleUz"),
            summary_ru=data.get("summaryRu"),
            summary_uz=data.get("summaryUz"),
            topics=list(data.get("topics") or []),
            restaurant_name=data.get("restaurantName"),
            cover_url=data.get("coverUrl"),
            web_url=data.get("webUrl"),
            pdf_url=data.get("pdfUrl"),
            magazine_url=str(data.get("magazineUrl", "https://microgreenuzbekistan.com/magazine")),
        )
        _cache = issue
        _cache_time = now
        return issue

    except Exception as e:  # noqa: BLE001 — любая сетевая беда читается одинаково
        logger.error("[MagazineService] Не удалось получить номер: %s", e)
        return None
