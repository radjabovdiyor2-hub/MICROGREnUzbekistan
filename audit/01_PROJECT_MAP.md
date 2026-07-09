# 01 PROJECT MAP

## Overview
Microgreen Uzbekistan — UNIFIED production stack.
Monorepo using Turborepo.
Contains Website (Next.js), a storefront bot, and 13 internal AI bots (tgas, OpenAI), `web_office`, running on PostgreSQL (two databases: `microgreen` and `microgreen_db`) + Redis.

## Apps
1. **web** (`apps/web`): Next.js storefront frontend & API.
   - Entry point: `npm run dev` (port 3005) or Next.js production server (port 3000).
   - Tech: Next.js, Prisma, Tailwind (likely).
2. **bot** (`apps/bot`): Customer-facing storefront bot (aiogram + Gemini).
   - Tech: Python, Aiogram, Gemini.
   - Depends on `web` API (`WEB_API_URL`).
3. **tgas bots** (`apps/tgas/bots`):
   - `stepan_bot` (Stepan manager)
   - `sales_bot`
   - `support_bot`
   - `hr_bot`
   - `finance_bot`
   - `marketing_bot`
   - `pm_bot` (currently disabled/merged with Stepan)
   - `analytics_bot`
   - `content_bot`
   - `qa_bot`
   - `rnd_bot`
   - `devops_bot` (has access to docker socket)
   - `n8n_bridge`
4. **web_office** (`apps/tgas/web_office`): Internal AI office API.
   - Tech: FastAPI / Uvicorn (port 8050).
   - Integrates with storefront `web` for orders.

## Packages
1. **database** (`packages/database`): Shared Prisma schema.
2. **shared** (`packages/shared`): Shared TS/JS configs.

## Infrastructure
- **PostgreSQL**: Stores both `microgreen` (tgas CRM) and `microgreen_db` (storefront).
- **Redis**: Caching and sessions.
- **Nginx & Certbot**: Edge proxy (optional, ports 80/443).
- **Docker Compose**: `docker-compose.prod.yml` and `docker-compose.yml`.
