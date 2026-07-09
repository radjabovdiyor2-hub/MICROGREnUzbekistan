# 03 INTEGRATIONS

## Database
- PostgreSQL accessed via Prisma ORM (`packages/database`). (Confirmed)

## Internal APIs
- Storefront (`apps/web`) -> CRM (`apps/tgas` web_office): Uses `OFFICE_INGEST_URL` (e.g. `http://web_office:8050/ingest/order`). Authenticated via `INGEST_SECRET`. (Confirmed)
- Telegram Bot (`apps/bot`) -> Storefront (`apps/web`): Bot queries storefront API for catalog/orders. Authenticated via `BOT_SECRET`. (Confirmed)

## External Services
- Telegram Bot API: Used for customer bot and admin notifications. Token in `TELEGRAM_BOT_TOKEN`. (Confirmed)
- N8N: Workflow automation. Port 5678 exposed. (Confirmed)
- Redis: Pub/Sub and cache for Python bots. (Confirmed)
