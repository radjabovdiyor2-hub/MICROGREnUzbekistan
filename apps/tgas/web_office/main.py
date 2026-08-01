import asyncio
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from shared.event_bus import event_bus
from shared.database import get_session_ctx

from .routers import admin, api, dashboard, ingest, webhooks

# 1. Setup logging & app
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Microgreen AI Office Dashboard")

# 2. CORS and Static Files
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# 3. Include Routers
app.include_router(dashboard.router)
app.include_router(ingest.router)
app.include_router(admin.router)
app.include_router(api.router)
app.include_router(webhooks.router)


# 4. Background tasks
async def _outbox_processor_loop() -> None:
    """Фоновая отправка статусов из outbox на витрину (каждые 10 секунд)."""
    import os
    await asyncio.sleep(5)
    import aiohttp
    from sqlalchemy import text

    STOREFRONT_STATUS_URL = os.getenv("STOREFRONT_STATUS_URL", "")
    INGEST_SECRET = os.getenv("INGEST_SECRET", "")

    while True:
        try:
            if not STOREFRONT_STATUS_URL:
                await asyncio.sleep(10)
                continue

            headers = {"Content-Type": "application/json"}
            if INGEST_SECRET:
                headers["X-Ingest-Secret"] = INGEST_SECRET

            async with get_session_ctx() as session:
                rows = (
                    await session.execute(
                        text(
                            "SELECT id, order_number, status FROM storefront_outbox ORDER BY id ASC LIMIT 50"
                        )
                    )
                ).fetchall()

                if rows:
                    async with aiohttp.ClientSession() as s:
                        for row in rows:
                            outbox_id, ext_number, status = row[0], row[1], row[2]
                            try:
                                resp = await s.post(
                                    STOREFRONT_STATUS_URL,
                                    json={"order_number": ext_number, "status": status},
                                    headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=5),
                                )
                                if resp.status < 500:
                                    await session.execute(
                                        text(
                                            "DELETE FROM storefront_outbox WHERE id = :id"
                                        ),
                                        {"id": outbox_id},
                                    )
                                    await session.commit()
                            except Exception as exc:
                                logger.warning(
                                    "Outbox: синк на витрину не удался (%s): %s",
                                    ext_number,
                                    exc,
                                )
                                break
        except Exception as exc:
            logger.warning("Outbox loop error: %s", exc)
        await asyncio.sleep(10)


async def _catalog_sync_loop() -> None:
    """Фоновая периодическая синхронизация каталога (раз в 30 минут)."""
    from shared.catalog_sync import sync_catalog_from_storefront

    await asyncio.sleep(20)  # дать витрине подняться
    while True:
        try:
            await sync_catalog_from_storefront()
        except Exception as exc:
            logger.warning("Catalog sync loop: %s", exc)
        await asyncio.sleep(1800)


# 5. Startup / Shutdown events
@app.on_event("startup")
async def startup_event() -> None:
    # 1. Event bus
    port = 8050
    await event_bus.connect()
    event_bus.start_listening(port, app)
    logger.info("web_office EventBus started on port %s", port)

    # 2. Schema check (e.g. for storefront_id)
    try:
        from shared.catalog_sync import ensure_schema
        await ensure_schema()
    except Exception as exc:
        logger.warning("Schema ensure failed at startup: %s", exc)

    # 3. Background loops
    asyncio.create_task(_catalog_sync_loop())
    asyncio.create_task(_outbox_processor_loop())


if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 8050))
    uvicorn.run(app, host="0.0.0.0", port=port)
