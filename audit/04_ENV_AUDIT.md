# 04 ENV AUDIT

| ENV Key | Required By | Present In .env.example | Present In Docker | Used In Code | Default Exists | Risk | Fix |
|---------|-------------|--------------------------|-------------------|--------------|----------------|------|-----|
| `POSTGRES_PASSWORD` | postgres, web, bots | Yes | Yes | TBD | No | High | Ensure strong secret |
| `DATABASE_URL` | web, db-push, bots | Yes | Yes (constructed) | TBD | No | High | Depends on PG pass |
| `REDIS_URL` | web, bots | Yes | Yes | TBD | No | Medium | |
| `HOST_UPLOADS_DIR` | docker web | Yes | Yes | TBD | Yes (fallback) | Low | Ensure dir exists |
| `INGEST_SECRET` | web, web_office | Yes | Yes | TBD | No (empty ok) | Medium | Better set to random string |
| `BOT_SECRET` | bot, web | Yes | Yes | TBD | No (empty ok) | Medium | Enable for auth |
| `BOT_TOKEN` | bot | Yes | No | TBD | No | High | Required for bot |
| `TELEGRAM_BOT_TOKEN` | web (maybe?) | Yes | No | TBD | No | High | |
| `GEMINI_API_KEY` | bot, web | Yes | No | TBD | No | High | |

*To be updated in Stage 5.*
