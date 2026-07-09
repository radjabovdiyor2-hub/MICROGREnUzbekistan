# 00 PROJECT MAP

## Overview
Monorepo using Turborepo for a microgreens storefront, CRM (AI office), and Telegram bots.

## Apps (apps/)
- `apps/web`: Next.js 15+ (App Router) storefront. (Confirmed)
- `apps/bot`: Python-based Telegram bot (storefront mirror). (Confirmed)
- `apps/tgas`: Python FastAPI CRM + virtual office bots. (Confirmed)
- `apps/game`: (Unknown / Needs verification - purpose unclear, looks like a side project or marketing game).

## Packages (packages/)
- `packages/database`: Prisma ORM schema and seed scripts for PostgreSQL. (Confirmed)
- `packages/shared`: Shared utilities/types. (Needs verification)

## Infrastructure
- `nginx/`: Nginx reverse proxy configuration. (Confirmed)
- `docker-compose.prod.yml`: Production services definition. (Confirmed)
- `.github/workflows/ci.yml`: CI/CD deployment pipeline. (Confirmed)
- `deploy/`: Deployment scripts (e.g. `deploy_nginx.js`). (Confirmed)
