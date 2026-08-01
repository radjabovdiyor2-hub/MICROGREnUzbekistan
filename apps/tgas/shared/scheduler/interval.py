import asyncio
from typing import Callable, Awaitable

from shared.scheduler.core import _Job

class _IntervalJob(_Job):
    def __init__(
        self,
        name: str,
        func: Callable[[], Awaitable],
        bot_name: str,
        seconds: int,
        initial_delay: int = 30,
    ) -> None:
        super().__init__(name, func, bot_name)
        self.seconds = seconds
        self.initial_delay = initial_delay

    async def loop(self) -> None:
        await asyncio.sleep(self.initial_delay)
        while True:
            await self._run_safe()
            await asyncio.sleep(self.seconds)
