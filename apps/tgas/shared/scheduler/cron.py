import asyncio
import logging
from datetime import datetime, timedelta
from typing import Callable, Awaitable, Optional

from shared.scheduler.core import _Job, UZ_TZ

logger = logging.getLogger(__name__)

class _CronJob(_Job):
    def __init__(
        self,
        name: str,
        func: Callable[[], Awaitable],
        bot_name: str,
        hour: int,
        minute: int = 0,
        day_of_week: Optional[int] = None,
        day_of_month: Optional[int] = None,
    ) -> None:
        super().__init__(name, func, bot_name)
        self.hour = hour
        self.minute = minute
        self.day_of_week = day_of_week
        self.day_of_month = day_of_month

    def _next_target(self, now: datetime) -> datetime:
        target = now.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)

        if self.day_of_week is not None:
            while target.weekday() != self.day_of_week:
                target += timedelta(days=1)

        if self.day_of_month is not None:
            while target.day != self.day_of_month:
                target += timedelta(days=1)

        return target

    async def _refresh(self) -> bool:
        try:
            from shared.settings_store import get_job_overrides
            cfg = (await get_job_overrides(self.bot_name)).get(self.name)
        except Exception:
            return False
        if not cfg:
            return False

        changed = False
        for attr, col in (
            ("hour", "hour"),
            ("minute", "minute"),
            ("day_of_week", "day_of_week"),
            ("day_of_month", "day_of_month"),
        ):
            value = cfg.get(col)
            if value is not None and getattr(self, attr, None) != value:
                setattr(self, attr, value)
                changed = True

        self.enabled = cfg.get("enabled", True)
        return changed

    async def loop(self) -> None:
        self.enabled = True
        while True:
            now = datetime.now(UZ_TZ)
            target = self._next_target(now)
            logger.info(
                "[%s] ⏰ '%s' следующий запуск через %.0f мин (%s)",
                self.bot_name,
                self.name,
                (target - now).total_seconds() / 60,
                target.strftime("%d.%m %H:%M"),
            )

            rescheduled = False
            while True:
                now = datetime.now(UZ_TZ)
                remaining = (target - now).total_seconds()
                if remaining <= 0:
                    break
                await asyncio.sleep(min(remaining, 60))
                if await self._refresh():
                    logger.info(
                        "[%s] ⚙️ '%s': расписание изменено в админке, пересчитываю",
                        self.bot_name,
                        self.name,
                    )
                    rescheduled = True
                    break

            if rescheduled:
                continue

            if getattr(self, "enabled", True):
                await self._run_safe()
            else:
                logger.info("[%s] ⏸ '%s' выключена в админке — пропуск", self.bot_name, self.name)

            await asyncio.sleep(60)
