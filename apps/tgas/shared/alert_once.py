"""
🔔 ОПОВЕЩЕНИЯ С ПАМЯТЬЮ — «пиши, когда изменилось», а не «пиши каждый раз».

ЗАЧЕМ ЭТОТ МОДУЛЬ СУЩЕСТВУЕТ

Проверки по расписанию не помнили, о чём уже сообщали, и повторяли одно и то
же, пока держалось условие:

  · CSAT — каждые 2 часа, то есть 12 одинаковых сообщений в сутки;
  · крупные расходы и статус доставки — по 6;
  · аномалия выручки — 4;
  · просроченные платежи — 3.

Одиннадцатое «7 заказов без обратной связи» не несёт ни грамма новой
информации, зато приучает пролистывать сообщения не читая — и настоящая
тревога тонет вместе с ними.

Правильный образец уже был в этом же проекте: `bot_health_check` бегает
каждые 5 минут, но пишет только при ИЗМЕНЕНИИ состава упавших ботов
(`_last_down_bots` в bots/stepan_bot/main.py).

КАК ПОЛЬЗОВАТЬСЯ

    if alert_once.should_send("support.csat", f"{count}"):
        await bot.send_message(admin_id, f"{count} заказов без обратной связи")

    ...а когда повода нет:

    alert_once.resolved("support.csat")

Отпечаток — короткая строка, описывающая суть сообщения. Изменился отпечаток
(было 7 заказов, стало 9) — пишем. Не изменился — молчим, но раз в сутки всё
равно напоминаем: висящая проблема не должна исчезнуть из виду совсем.

`resolved` обязателен. Без него условие, которое ушло и вернулось с тем же
отпечатком, будет принято за «ничего не изменилось» и промолчит.

СОСТОЯНИЕ ПЕРЕЖИВАЕТ ВЫКЛАДКУ

Раньше оно жило только в памяти процесса, и это было записано как
осознанный размен: «после выкладки бот один раз повторит оповещение».
Размен перестал сходиться, когда сюда добавились НЕЧАСТЫЕ поводы — сводка
по сотрудникам подтверждается раз в неделю. Мержей в main бывает по
четыре за сутки, то есть недельное окно превращалось в «при каждой
выкатке», и молчание, ради которого всё делалось, не наступало никогда.

Хранилище — Redis, а не таблица: он в проекте уже есть и уже переживает
рестарты (FSM aiogram, незакрытые заявки на продажу), миграции не нужно,
а строка живёт часы. Состояние читается ОДИН РАЗ при старте планировщика
(`BotScheduler.start`) и дописывается фоном при каждом решении.

Redis недоступен — работаем как раньше, по памяти процесса: лишнее
оповещение дешевле пропущенного. Отказ виден в логе.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

#: Через сколько часов напомнить, если условие держится и не меняется.
DEFAULT_REMIND_HOURS = 24

#: ключ → (отпечаток, момент последней отправки)
_seen: Dict[str, Tuple[str, float]] = {}

#: Ключ хеша в Redis. Один на весь офис: имена поводов уже разведены по
#: ботам самими вызывающими («support.csat», «hr:staff»).
_REDIS_KEY = "alert_once:seen"

#: Записи старше этого при загрузке отбрасываются. Повод, о котором не
#: вспоминали месяц, — это не «висящая проблема», а мусор.
_STALE_AFTER_S = 30 * 24 * 3600


def _client():
    """Клиент Redis. Импорт ленивый: модуль зовут и там, где его нет."""
    import redis.asyncio as redis

    from shared.config import settings

    return redis.from_url(settings.redis_url, decode_responses=True)


async def load() -> int:
    """
    Прочитать состояние из Redis. Зовётся один раз при старте планировщика.

    Возвращает число загруженных поводов. Отказ Redis — не ошибка: работаем
    по памяти процесса, как раньше, и говорим об этом в лог.
    """
    client = _client()
    try:
        stored = await client.hgetall(_REDIS_KEY)
    except Exception as exc:  # noqa: BLE001
        logger.warning("ALERT_ONCE: состояние не прочитано (%s) — начинаю с чистого", exc)
        return 0
    finally:
        try:
            await client.aclose()
        except Exception as exc:  # noqa: BLE001
            logger.warning("ALERT_ONCE: соединение не закрылось: %s", exc)

    now = time.time()
    loaded = 0
    for key, raw in (stored or {}).items():
        fingerprint, _, at = str(raw).rpartition("|")
        try:
            moment = float(at)
        except ValueError:
            continue
        if now - moment > _STALE_AFTER_S:
            continue
        _seen[key] = (fingerprint, moment)
        loaded += 1

    logger.info("ALERT_ONCE: загружено поводов: %d", loaded)
    return loaded


async def _write(key: str, value: Optional[str]) -> None:
    client = _client()
    try:
        if value is None:
            await client.hdel(_REDIS_KEY, key)
        else:
            await client.hset(_REDIS_KEY, key, value)
    except Exception as exc:  # noqa: BLE001
        # Не записали — после выкладки повод прозвучит второй раз. Это
        # ровно то поведение, что было до Redis, и оно приемлемо.
        logger.warning("ALERT_ONCE: «%s» не сохранён: %s", key, exc)
    finally:
        try:
            await client.aclose()
        except Exception as exc:  # noqa: BLE001
            logger.warning("ALERT_ONCE: соединение не закрылось: %s", exc)


def _save_later(key: str, value: Optional[str]) -> None:
    """
    Дописать решение в Redis, не задерживая вызывающего.

    `should_send` остаётся СИНХРОННОЙ намеренно: её зовут в тридцати трёх
    местах внутри `if`, и превращение в `await` переписало бы каждое ради
    записи, отказ которой ничего не ломает.

    Нет запущенного цикла (тесты, скрипты) — просто не пишем.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_write(key, value))


def should_send(
    key: str, fingerprint: str, remind_after_hours: int = DEFAULT_REMIND_HOURS
) -> bool:
    """Стоит ли писать владельцу про `key` с таким содержимым.

    True — если сообщение новое, изменилось или пора напомнить.
    """
    now = time.time()
    previous = _seen.get(key)
    fresh = str(fingerprint)

    if previous is None or previous[0] != fresh:
        _seen[key] = (fresh, now)
        _save_later(key, f"{fresh}|{now}")
        return True

    if now - previous[1] >= max(1, int(remind_after_hours)) * 3600:
        _seen[key] = (fresh, now)
        _save_later(key, f"{fresh}|{now}")
        logger.info("ALERT_ONCE: напоминание по «%s» — условие держится", key)
        return True

    return False


def resolved(key: str) -> None:
    """Повода больше нет — забыть, чтобы возврат проблемы снова прозвучал."""
    _seen.pop(key, None)
    _save_later(key, None)


def reset() -> None:
    """Забыть всё. Нужно тестам, чтобы соседние проверки не влияли друг на друга."""
    _seen.clear()
