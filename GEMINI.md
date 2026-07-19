# Project

This project must always look like it was written by one senior engineer.

## Stack

- Next.js 16 (App Router, RSC)
- React 19
- TypeScript (strict mode)
- TailwindCSS (via globals.css design system)
- Prisma ORM + PostgreSQL
- aiogram 3 (Telegram bots, Python)
- FastAPI (AI Office dashboard)
- Redis (cache, pub/sub)
- Docker Compose (production)

## Architecture

- **Monorepo** (Turborepo workspaces)
- **Feature First** — each app is self-contained (`apps/web`, `apps/bot`, `apps/game`, `apps/tgas`)
- **Reusable Components** — shared UI in `src/components/`, shared logic in `packages/`
- **Strict TypeScript** — no `any`, no implicit types
- **Event-Driven** — AI bots communicate via HTTP Event Bus, not direct calls

## Folder Structure

```
MICROGREnUzbekistan/
├── apps/
│   ├── web/          # Next.js PWA (storefront + admin + magazine)
│   ├── bot/          # Telegram storefront bot (Python/aiogram)
│   ├── game/         # Farm Simulator mini-app (Vite + React)
│   └── tgas/         # AI Office — 11 autonomous bots
├── packages/
│   ├── database/     # Prisma schema + migrations
│   └── shared/       # Shared TypeScript utilities
├── content/          # Magazine HTML, images, restaurant database
├── nginx/            # Production reverse proxy config
└── docker-compose.prod.yml
```

## Rules

No hacks.

No TODO.

No temporary fixes.

Always refactor duplicated code.

Always optimise.

Always think long-term.

Prefer composition over inheritance.

Keep components under 200 lines whenever possible.

Every function has one responsibility.

Every file has one purpose.

Never invent APIs — use existing patterns from `apps/web/src/app/api/`.

Never remove working code without explanation.

## Conventions

- **Russian** for user-facing text, comments, docstrings in `apps/tgas`
- **English** for variable names, function names, file names everywhere
- **Uzbek Latin** for SEO keywords and public-facing content on the website
- CSS variables from `globals.css` — never hardcode colors
- Prisma field names: `camelCase` in code, `snake_case` in database via `@map()`

## Key Files to Read First

| File | What it tells you |
|------|------------------|
| `PROJECT_MAP.md` | System architecture and execution paths |
| `DEPLOY.md` | How to deploy and update production |
| `apps/tgas/CLAUDE.md` | AI Office architecture, bot structure, event bus |
| `packages/database/prisma/schema.prisma` | Complete database schema |
| `apps/web/src/app/page.tsx` | Website homepage structure |
| `apps/web/src/app/globals.css` | Design system tokens |

## Handling Mistakes

If you are about to create a new API route — STOP. Read `apps/web/src/app/api/` first. There are 23 existing route groups.

If you are about to edit the database — STOP. Read `packages/database/prisma/schema.prisma` and `DATABASE.md` first.

If you are about to modify an AI bot — STOP. Read `apps/tgas/CLAUDE.md` first. Every bot follows the same structure.

If you are about to change CSS — STOP. Read `apps/web/src/app/globals.css` first. Never hardcode colors.

If you encounter a build error — read the error message fully before attempting a fix.

If you encounter a Prisma error — run `npx prisma generate` before trying anything else.

If you encounter a Docker error — check `docker-compose.prod.yml` for port conflicts first.

## Commands

```bash
# Development
cd apps/web && npm run dev          # Start Next.js dev server
cd apps/game && npm run dev         # Start Farm Simulator dev server

# Database
cd packages/database && npx prisma db push       # Apply schema changes
cd packages/database && npx prisma generate       # Regenerate client
cd packages/database && npx prisma db seed         # Seed data

# Deploy (production server)
./deploy.sh                         # Rebuild all
./deploy.sh web                     # Rebuild only web
./deploy.sh content sales stepan    # Rebuild specific bots

# AI Office (local)
cd apps/tgas && python -m bots.sales_bot.main     # Run single bot
cd apps/tgas && docker compose up -d               # Run all bots
```

## Documentation Index

Before making changes, read the relevant document:

- `ARCHITECTURE.md` — System architecture and module boundaries
- `CODE_STYLE.md` — Naming conventions and formatting rules
- `DATABASE.md` — Schema, relations, migration rules
- `API.md` — API endpoints and contracts
- `ROADMAP.md` — Current priorities and planned features
- `DEPLOY.md` — How to deploy and update production
