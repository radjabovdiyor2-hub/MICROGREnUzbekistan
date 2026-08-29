"""
📣 ИЗДАТЕЛЬ — один пост, все площадки сразу
=============================================
Публикацией контента владеет офис. Здесь один вход `publish()`, который
раскладывает готовый пост по целям: Instagram — напрямую через Graph API
(`shared/instagram.py`), Telegram-канал и группа — через дверь витрины
`POST /api/telegram/channel`.

ПОЧЕМУ TELEGRAM ЧЕРЕЗ ВИТРИНУ

Токен витринного бота живёт в витрине, а прямых импортов между
приложениями нет (конституция). Второй токен для офиса означал бы второго
бота и второе имя отправителя в канале.

ПОЧЕМУ ЭТО ВООБЩЕ ПОЯВИЛОСЬ

Публикаторов было три: `shared/instagram.py` в офисе и ДВА в витринном
боте — `services/channel_service.py` (живой, шлёт ежедневные посты) и
`services/crosspost_service.py`. Во втором функция `post_new_product`
передавала `Platform.INSTAGRAM`, которого в перечислении нет: первый же
вызов упал бы с AttributeError. Не упал он только потому, что её никто не
звал. Имя `post_daily_tip` при этом существовало в обоих файлах и делало
разное.

КАК КАРТИНКА ПОПАДАЕТ В TELEGRAM

`sendPhoto` принимает ссылку, а генерация отдаёт локальный файл. Поэтому
файл сначала загружается на сайт (`POST /api/upload`), и в канал уходит
его публичный адрес. Тот же приём, что у Instagram: Graph API тоже не
умеет читать наш диск, и `shared/instagram.py` заливает файл заранее.

Если загрузка не удалась, пост выходит ТЕКСТОМ, и в отчёте это сказано
отдельным полем. Молча терять картинку нельзя: пост без неё в ленте
выглядит недоделанным, а «опубликовано» звучит одинаково в обоих случаях.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api").rstrip("/")
CHANNEL_PATH = "/telegram/channel"
TIMEOUT_SECONDS = 10

#: Куда умеет публиковать издатель.
TARGETS = ("instagram", "telegram_channel", "telegram_group")


@dataclass
class Post:
    """Готовый пост. Генерацию текста и картинки делает вызывающий."""

    title: str
    body: str
    #: Путь к файлу ИЛИ URL. В Telegram уходит только URL — см. шапку.
    image: Optional[str] = None
    #: 'feed' — лента Instagram, 'story' — сторис.
    kind: str = "feed"
    #: Тип сообщения для канала: promo | update | news.
    message_type: str = "news"


def _headers() -> Dict[str, str]:
    secret = os.getenv("BOT_SECRET", "")
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["x-bot-secret"] = secret
        headers["Authorization"] = f"Bearer {secret}"
    return headers


def _is_url(value: Optional[str]) -> bool:
    return bool(value) and str(value).startswith(("http://", "https://"))


def _site_url() -> str:
    """Публичный адрес сайта — из него собирается ссылка на загруженный файл."""
    return os.getenv("WEB_URL", "https://microgreenuzbekistan.com").rstrip("/")


async def _upload_to_site(path: str) -> Optional[str]:
    """Залить локальный файл на витрину и получить публичный адрес.

    Возвращает None при любой неудаче — вызывающий обязан решить, что
    делать дальше, и сказать об этом владельцу. Тихо подставлять пост без
    картинки, не сообщая, нельзя.
    """
    if not os.path.isfile(path):
        logger.warning("ИЗДАТЕЛЬ: файла %s нет — картинка не уйдёт", path)
        return None

    headers = {k: v for k, v in _headers().items() if k != "Content-Type"}
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS * 3)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            with open(path, "rb") as handle:
                form = aiohttp.FormData()
                form.add_field("file", handle, filename=os.path.basename(path))
                async with session.post(
                    f"{STOREFRONT_URL}/upload", data=form, headers=headers
                ) as response:
                    if response.status >= 400:
                        logger.error(
                            "ИЗДАТЕЛЬ: витрина не приняла картинку (%s)", response.status
                        )
                        return None
                    body = await response.json()
    except Exception as exc:  # noqa: BLE001
        logger.error("ИЗДАТЕЛЬ: картинка не загрузилась: %s", exc)
        return None

    url = body.get("url")
    return f"{_site_url()}{url}" if url else None


async def _publish_telegram(post: Post, target: str) -> Dict[str, Any]:
    """Один пост в канал или группу через дверь витрины."""
    payload: Dict[str, Any] = {
        "title": post.title,
        "description": post.body,
        "type": post.message_type,
        "target": "group" if target == "telegram_group" else "channel",
    }
    if _is_url(post.image):
        payload["photoUrl"] = post.image
    elif post.image:
        uploaded = await _upload_to_site(post.image)
        if uploaded:
            payload["photoUrl"] = uploaded

    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{STOREFRONT_URL}{CHANNEL_PATH}", json=payload, headers=_headers()
            ) as response:
                body = await response.text()
                if response.status >= 400:
                    logger.error(
                        "ИЗДАТЕЛЬ: витрина отказала (%s): %s", response.status, body[:200]
                    )
                    return {"ok": False, "error": f"витрина ответила {response.status}"}
                lost = bool(post.image) and "photoUrl" not in payload
                return {"ok": True, "with_photo": not lost, "photo_lost": lost}
    except Exception as exc:  # noqa: BLE001 — причина уходит вызывающему
        logger.error("ИЗДАТЕЛЬ: не достучался до витрины: %s", exc)
        return {"ok": False, "error": str(exc)}


async def _publish_instagram(post: Post) -> Dict[str, Any]:
    """Пост в Instagram. Без картинки публикация невозможна — так у Graph API."""
    if not post.image:
        return {"ok": False, "error": "для Instagram нужна картинка"}

    from shared.instagram import post_to_instagram

    try:
        result = await post_to_instagram(post.image, post.body, post_type=post.kind)
        return {"ok": bool(result)} if result else {"ok": False, "error": "Graph API не принял"}
    except Exception as exc:  # noqa: BLE001
        logger.error("ИЗДАТЕЛЬ: Instagram отказал: %s", exc)
        return {"ok": False, "error": str(exc)}


async def publish(post: Post, targets: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    """
    Опубликовать пост во все указанные цели.

    Возвращает отчёт по каждой цели отдельно. Отказ одной площадки НЕ
    отменяет остальные: пост, вышедший в канал и не вышедший в Instagram,
    — это половина результата, а не ноль. Но и «успех» без разбора здесь
    не отдаётся: вызывающий видит, что именно не ушло, и может сказать это
    владельцу.
    """
    report: Dict[str, Dict[str, Any]] = {}
    unknown: List[str] = [t for t in targets if t not in TARGETS]
    if unknown:
        logger.warning("ИЗДАТЕЛЬ: неизвестные цели %s — пропускаю", ", ".join(unknown))

    for target in targets:
        if target == "instagram":
            report[target] = await _publish_instagram(post)
        elif target in ("telegram_channel", "telegram_group"):
            report[target] = await _publish_telegram(post, target)

    return report
