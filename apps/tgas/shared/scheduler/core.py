import logging
from datetime import timedelta, timezone
from typing import Callable, Awaitable

logger = logging.getLogger(__name__)

UZ_TZ = timezone(timedelta(hours=5))

class _Job:
    __slots__ = ("name", "func", "bot_name")

    def __init__(self, name: str, func: Callable[[], Awaitable], bot_name: str) -> None:
        self.name = name
        self.func = func
        self.bot_name = bot_name

    async def _run_safe(self) -> None:
        try:
            logger.info("[%s] ⏳ Задача '%s' запущена", self.bot_name, self.name)
            await self.func()
            logger.info("[%s] ✅ Задача '%s' выполнена", self.bot_name, self.name)
            await self._report("ok")
        except Exception as exc:
            logger.exception("[%s] ❌ Задача '%s' упала: %s", self.bot_name, self.name, exc)
            await self._report("error", str(exc))

    async def _report(self, status: str, error: str | None = None) -> None:
        try:
            from shared.settings_store import record_job_run
            await record_job_run(self.bot_name, self.name, status, error)
        except Exception:
            pass
