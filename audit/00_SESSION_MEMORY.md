# 00 SESSION MEMORY

## Initial State
- **Branch:** `merge/tgas-monorepo`
- **Git Status:** Many modified and untracked files, especially in bots and Next.js api routes. `.env` files are ignored (needs verification).
- **Project Structure:** Monorepo (`turbo.json`). Next.js, FastAPI, Python Bots.

## Audit Progress
- [x] Stage 1: Safe Start
- [x] Stage 2: Project Map
- [x] Stage 3: Port Matrix
- [x] Stage 4: Integration Map
- [x] Stage 5: Env Audit
- [x] Stage 6: Docker + Nginx + Deploy Audit
- [ ] Stage 7: Frontend + Backend Audit
- [x] Stage 8: Security Audit (Critical issues found)
- [x] Stage 9: Bugs and Risks
- [x] Stage 10: Fix Plan (Initial drafts)

## Key Findings
1. **Critical Security Leak:** Multiple root-level JS and python scripts contain hardcoded SSH credentials (`82.115.50.30`, `ubuntu`, `izxir(Kpaqfmsvaamtw8`, `eddogvjzfdug&wAjugg5`).
2. **Ports:** 3000 (Next.js web), 8050 (web_office), 5432 (Postgres), 6379 (Redis), 5678 (n8n).
3. **Integration:** Next.js sends orders to `web_office` via `OFFICE_INGEST_URL`. Office syncs back to `STOREFRONT_STATUS_URL`. Bots use `WEB_API_URL`.
4. **Nginx:** Only starts with `edge` profile, meaning by default the project relies on system-level Nginx to proxy to `127.0.0.1:3000`.
