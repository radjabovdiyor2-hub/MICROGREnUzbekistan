# Roadmap — Microgreen Uzbekistan

## Current Status: Phase 3 — System Integration

The project is a working AgroTech ecosystem with:
- ✅ Next.js PWA storefront (live at microgreenuzbekistan.com)
- ✅ Telegram storefront bot (orders, AI agronomist)
- ✅ Farm Simulator game (Telegram Mini App)
- ✅ AI Office (11 autonomous bots: sales, content, finance, etc.)
- ✅ FRESH WEEKLY magazine (Issue №1 — 12 pages, AR viewer)
- ✅ 12 Pixar-quality 3D characters ("Агро Друзья")
- ✅ Restaurant database (100 restaurants: Tashkent + Samarkand)

---

## Phase 3.1 — Magazine Integration (DONE)

| Task | Status | Files |
|------|--------|-------|
| Magazine page on website (`/magazine`) | ✅ Done | `apps/web/src/app/magazine/` |
| AR Viewer on website (`/magazine/ar`) | ✅ Done | `apps/web/src/app/magazine/ar/` |
| Companions in Farm Simulator | ✅ Done | `apps/game/src/App.tsx` |
| Prisma models (MagazineIssue, Restaurant) | ✅ Done | `schema.prisma` |
| Telegram bot `/magazine` command | ✅ Done | `apps/bot/handlers/magazine.py` |
| Content Bot auto-publish rubrics | ✅ Done | `apps/tgas/bots/content_bot/` |
| Restaurant seed script (100 restaurants → DB) | ✅ Done | `packages/database/prisma/seed-restaurants.ts` |
| PDF generation | ✅ Done | `content/generate_pdf.js` |

## Phase 3.2 — Magazine Monetization (DONE)

| Task | Status |
|------|--------|
| Print-on-demand order flow (Telegram → Order) | ✅ Done |
| Media Kit for advertisers (PDF) | ✅ Done |
| Magazine subscription pricing | ✅ Done |
| Advertiser dashboard in admin | ✅ Done |

## Phase 4 — Growth

| Task | Priority |
|------|----------|
| Telegram channel auto-posting (weekly rubrics) | High |
| Issue №2 (Korean cuisine theme) | High |
| Landing page for magazine (SEO) | Medium |
| AR with real 3D models (.glb) instead of planes | Medium |
| Weekly email digest | Low |
| WhatsApp bot integration | Low |

## Phase 5 — Scale

| Task | Priority |
|------|----------|
| Multi-city expansion (Bukhara, Fergana) | High |
| Franchise module (white-label for other farms) | Medium |
| NFT character collection from game | Low |
| International version (English, Turkish) | Low |

---

## Priorities (RIGHT NOW)

1. Landing page for magazine (SEO)
2. AR with real 3D models (.glb) instead of planes
3. Telegram channel auto-posting (weekly rubrics)
