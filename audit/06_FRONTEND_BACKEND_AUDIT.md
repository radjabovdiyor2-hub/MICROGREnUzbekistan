# 06 FRONTEND + BACKEND AUDIT

| Feature | Files | Expected Logic | Actual Logic | API Used | Status | Problem | Fix |
|---------|-------|----------------|--------------|----------|--------|---------|-----|
| Auth | `api/auth/telegram/route.ts` | Telegram hash check | Hashes checked with `TELEGRAM_BOT_TOKEN`. | `/api/auth/telegram` | OK | | |
| Orders | `api/orders/route.ts` | Save order, sync to office | Saved to Prisma, fetched to `web_office` via `OFFICE_INGEST_URL`. | `/api/orders` | OK | Fire-and-forget timeout | Use background job |
| Admin | `api/admin/orders/route.ts` | Protect with secret | Protected by `requireBotAuth(request)` which uses `BOT_SECRET`. | `/api/admin/orders` | OK | | |
| Sync | `lib/orderSync.ts` | Sync back from office | Syncs to `STOREFRONT_STATUS_URL` and `OFFICE_STATUS_URL`. | `/api/orders/status` | OK | | |
| WebOffice | `web_office/main.py` | Accept orders | Inserts to `microgreen.orders`, fires `ORDER_CREATED` in Redis EventBus. | `/ingest/order` | OK | | |
