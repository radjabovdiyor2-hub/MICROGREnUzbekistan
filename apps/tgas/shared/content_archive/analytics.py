import logging
from sqlalchemy import text
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

async def get_format_performance_weights_async(formats: list[str]) -> dict[str, float]:
    weights = {fmt: 1.0 for fmt in formats}
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT slot, title, reach FROM content_publications WHERE reach IS NOT NULL"
                ),
            )
            scores: dict[str, list[float]] = {fmt: [] for fmt in formats}
            for row in res.fetchall():
                slot_name, row_title, reach = (
                    row[0],
                    (row[1] or "").lower(),
                    row[2] or 0,
                )
                score = reach
                for fmt in formats:
                    if fmt in slot_name or fmt in row_title:
                        if score > 0:
                            scores[fmt].append(score)

            for fmt, values in scores.items():
                if values:
                    avg = sum(values) / len(values)
                    weights[fmt] = max(0.5, min(2.0, avg / 100.0))
    except Exception as e:
        logger.warning(f"get_format_performance_weights error: {e}")
    return weights

def get_format_performance_weights(formats: list[str]) -> dict[str, float]:
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(
                asyncio.run, get_format_performance_weights_async(formats)
            ).result(timeout=10)
    else:
        return asyncio.run(get_format_performance_weights_async(formats))
