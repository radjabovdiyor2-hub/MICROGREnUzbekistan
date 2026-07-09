# 03 INTEGRATION MAP

| Flow | Frontend File | API Route | Backend Handler | Env Needed | Port | Nginx Path | Status | Problem | Fix |
|------|---------------|-----------|-----------------|------------|------|------------|--------|---------|-----|
| Web -> Office | TBD | TBD | `web_office` 8050 | `OFFICE_INGEST_URL`, `INGEST_SECRET` | 3000 -> 8050 | Internal | TBD | | |
| Bot -> Web API | TBD | `/api/admin/*` | `web` | `WEB_API_URL`, `BOT_SECRET` | 3000 | Internal | TBD | | |
| Office -> Web | TBD | `/api/orders/status` | `web` | `STOREFRONT_STATUS_URL` | 8050 -> 3000 | Internal | TBD | | |
| Payment -> Web | TBD | `/api/payment/*` | `web` | Payme/Click ENVs | 3000 | TBD | TBD | | |

*To be updated during Stage 4.*
