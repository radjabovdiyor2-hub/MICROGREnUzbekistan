import asyncio
import logging
from typing import Callable, Awaitable, Optional

from shared.scheduler.core import _Job
from shared.scheduler.cron import _CronJob
from shared.scheduler.interval import _IntervalJob

logger = logging.getLogger(__name__)

class BotScheduler:
    def __init__(self, bot_name: str) -> None:
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
    ) -> None:
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
    ) -> None:
        self._jobs.append(
            _IntervalJob(name, func, self.bot_name, seconds, initial_delay)
        )

    async def _apply_overrides(self) -> list[_Job]:
        try:
            from shared.settings_store import get_job_overrides, register_job
        except Exception:
            return list(self._jobs)

        for job in self._jobs:
            fields = {
                "hour": getattr(job, "hour", None),
                "minute": getattr(job, "minute", None),
                "day_of_week": getattr(job, "day_of_week", None),
                "day_of_month": getattr(job, "day_of_month", None),
                "seconds": getattr(job, "seconds", None),
            }
            kind = "interval" if isinstance(job, _IntervalJob) else "cron"
            await register_job(self.bot_name, job.name, kind, **fields)

        overrides = await get_job_overrides(self.bot_name)
        if not overrides:
            return list(self._jobs)

        runnable = []
        for job in self._jobs:
            cfg = overrides.get(job.name)
            if not cfg:
                runnable.append(job)
                continue

            if cfg.get("enabled") is False:
                logger.info(
                    "[%s] ⏸ Задача '%s' выключена в админке", self.bot_name, job.name
                )
                continue

            for attr, col in (
                ("hour", "hour"),
                ("minute", "minute"),
                ("day_of_week", "day_of_week"),
                ("day_of_month", "day_of_month"),
                ("seconds", "seconds"),
            ):
                value = cfg.get(col)
                if value is not None and hasattr(job, attr):
                    if getattr(job, attr) != value:
                        logger.info(
                            "[%s] ⚙️ '%s': %s %s → %s (из админки)",
                            self.bot_name,
                            job.name,
                            attr,
                            getattr(job, attr),
                            value,
                        )
                    setattr(job, attr, value)

            runnable.append(job)
        return runnable

    async def start(self) -> None:
        jobs = await self._apply_overrides()
        logger.info(
            "[%s] 🚀 Планировщик: запуск %d задач (из %d зарегистрированных)",
            self.bot_name,
            len(jobs),
            len(self._jobs),
        )
        for job in jobs:
            task = asyncio.create_task(job.loop(), name=f"{self.bot_name}:{job.name}")
            self._tasks.append(task)

    async def restart(self) -> None:
        await self.stop()
        try:
            from shared.settings_store import invalidate
            invalidate()
        except Exception:
            pass
        await self.start()

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        logger.info("[%s] 🛑 Планировщик остановлен", self.bot_name)
