# 05 FIX PLAN

## Immediate Priority (High/Critical)
- [x] Fix DB Push in CI/CD to prevent data loss.
- [x] Enforce BOT_SECRET in production.
- [x] Fix Lint command crashing CI pipeline.
- [x] Add retry loop to CRM order ingest.
- [x] Instagram Token (RESOLVED)
    - **Problem**: API returns 400 (Invalid token). The provided token was a User Token, not a Page Token.
    - **Root Cause**: Next.js API `graph.instagram.com` endpoint was used, which required basic display token.
    - **Fix**: Updated `route.ts` to use `graph.facebook.com` with the new Page Token and Instagram Business Account ID. The posts are now fetching successfully.

## Medium Priority
- [x] Migrate from `prisma db push` to `prisma migrate deploy` (Requires baseline migration creation).
- [x] Enforce `npm audit` or dependency vulnerability checks in CI/CD.
- [x] Implement N8N Basic Auth on the host machine.
- [x] Enforce strict checking for `INGEST_SECRET` in Python `tgas` CRM (similar to JS fix).

## Low Priority / Tech Debt
- [x] Add more unit and E2E tests (Playwright is installed but unused).
- [x] Refactor SSH deployment scripts in CI/CD into Ansible or cleaner robust scripts.
