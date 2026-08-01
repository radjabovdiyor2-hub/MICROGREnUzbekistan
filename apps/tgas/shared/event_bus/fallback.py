import asyncio
import logging
import aiohttp

logger = logging.getLogger(__name__)

def run_direct_broadcast(message: dict, source_bot: str, event_type: str, session: aiohttp.ClientSession, background_tasks: set) -> None:
    from shared.bot_registry import EVENT_ENDPOINTS
    bot_endpoints = EVENT_ENDPOINTS
    from shared.config import settings

    _secret = getattr(settings, "event_bus_secret", None)
    _hdrs = {"X-Bot-Secret": _secret} if _secret else {}

    async def send_direct(host, port) -> None:
        try:
            url = f"http://{host}:{port}/event"
            async with session.post(
                url,
                json=message,
                headers=_hdrs,
                timeout=aiohttp.ClientTimeout(total=3),
            ) as resp:
                if resp.status == 200:
                    logger.info(f"Direct EventBus: [{source_bot}] → {host}:{port} ({event_type})")
        except Exception:
            pass

    async def broadcast() -> None:
        try:
            await asyncio.gather(*(send_direct(h, p) for h, p in bot_endpoints))
        except Exception as e:
            logger.error(f"Error during event broadcast: {e}")

    task = asyncio.create_task(broadcast())
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
