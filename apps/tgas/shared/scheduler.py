"""shared/scheduler.py — Универсальный планировщик фоновых задач для ботов.

Пример использования в main.py бота:
    from shared.scheduler import BotScheduler

    scheduler = BotScheduler("sales_bot")
    scheduler.add_cron(hour=9, minute=0, name="daily_report", func=my_report_func)
    scheduler.add_interval(seconds=3600*4, name="stock_check", func=check_stock)

    async def main():
        ...
        await scheduler.start()
        await dp.start_polling(bot)
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Callable, Awaitable, Optional

logger = logging.getLogger(__name__)

UZ_TZ = timezone(timedelta(hours=5))  # UTC+5 Uzbekistan


class _Job:
    __slots__ = ("name", "func", "bot_name")

    def __init__(self, name: str, func: Callable[[], Awaitable], bot_name: str):
        self.name = name
        self.func = func
        self.bot_name = bot_name

    async def _run_safe(self):
        try:
            logger.info("[%s] ⏳ Задача '%s' запущена", self.bot_name, self.name)
            await self.func()
            logger.info("[%s] ✅ Задача '%s' выполнена", self.bot_name, self.name)
        except Exception as exc:
            logger.exception("[%s] ❌ Задача '%s' упала: %s", self.bot_name, self.name, exc)


class _CronJob(_Job):
    """Задача по расписанию (час:минута каждый день, или по дню недели/месяца)."""

    def __init__(
        self,
        name: str,
        func: Callable[[], Awaitable],
        bot_name: str,
        hour: int,
        minute: int = 0,
        day_of_week: Optional[int] = None,   # 0=Mon ... 6=Sun
        day_of_month: Optional[int] = None,  # 1-31
    ):
        super().__init__(name, func, bot_name)
        self.hour = hour
        self.minute = minute
        self.day_of_week = day_of_week
        self.day_of_month = day_of_month

    async def loop(self):
        while True:
            now = datetime.now(UZ_TZ)
            target = now.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)
            if now >= target:
                target += timedelta(days=1)

            # Skip if day_of_week constraint doesn't match
            if self.day_of_week is not None:
                while target.weekday() != self.day_of_week:
                    target += timedelta(days=1)

            # Skip if day_of_month constraint doesn't match
            if self.day_of_month is not None:
                while target.day != self.day_of_month:
                    target += timedelta(days=1)

            wait = (target - now).total_seconds()
            logger.info(
                "[%s] ⏰ '%s' следующий запуск через %.0f мин (%s)",
                self.bot_name, self.name, wait / 60,
                target.strftime("%d.%m %H:%M"),
            )
            await asyncio.sleep(wait)
            await self._run_safe()
            # Small delay to avoid double-fire
            await asyncio.sleep(60)


class _IntervalJob(_Job):
    """Задача с интервалом (каждые N секунд)."""

    def __init__(
        self,
        name: str,
        func: Callable[[], Awaitable],
        bot_name: str,
        seconds: int,
        initial_delay: int = 30,
    ):
        super().__init__(name, func, bot_name)
        self.seconds = seconds
        self.initial_delay = initial_delay

    async def loop(self):
        await asyncio.sleep(self.initial_delay)
        while True:
            await self._run_safe()
            await asyncio.sleep(self.seconds)


class BotScheduler:
    """Планировщик фоновых задач для конкретного бота."""

    def __init__(self, bot_name: str):
        self.bot_name = bot_name
        self._jobs: list[_Job] = []
        self._tasks: list[asyncio.Task] = []

    def add_cron(
        self,
        *,
        name: str,
        func: Callable[[], Awaitable],
        hour: int,
        minute: int = 0,
        day_of_week: Optional[int] = None,
        day_of_month: Optional[int] = None,
    ):
        """Добавить задачу по расписанию (cron-стиль)."""
        self._jobs.append(
            _CronJob(name, func, self.bot_name, hour, minute, day_of_week, day_of_month)
        )

    def add_interval(
        self,
        *,
        name: str,
        func: Callable[[], Awaitable],
        seconds: int,
        initial_delay: int = 30,
    ):
        """Добавить интервальную задачу."""
        self._jobs.append(
            _IntervalJob(name, func, self.bot_name, seconds, initial_delay)
        )

    async def start(self):
        """Запустить все задачи как asyncio.Tasks."""
        logger.info(
            "[%s] 🚀 Планировщик: запуск %d задач", self.bot_name, len(self._jobs)
        )
        for job in self._jobs:
            task = asyncio.create_task(job.loop(), name=f"{self.bot_name}:{job.name}")
            self._tasks.append(task)

    async def stop(self):
        """Остановить все задачи."""
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        logger.info("[%s] 🛑 Планировщик остановлен", self.bot_name)
