# 06 DONE CHECKLIST

- [x] **Audit Workspace Initialized**: AGENTS.md loaded and project memory files created. (Confirmed)
- [x] **DevOps Socket Fix**: Removed `/var/run/docker.sock` from docker-compose. (Confirmed)
- [x] **DB Safety**: Removed `--accept-data-loss` flag in `.github/workflows/ci.yml`. (Confirmed)
- [x] **Lint Fix**: Updated `package.json` to use `eslint .` directly instead of deprecated `next lint`. (Confirmed)
- [x] **Order Retry**: Background 3x retry loop added to `apps/web/src/app/api/orders/route.ts`. (Confirmed)
- [x] **Tests Init**: Wrote basic unit tests for API and verified via `vitest`. Added to CI pipeline. (Confirmed)
- [x] **BotAuth Strict Mode**: Production environment explicitly returns `401` if `BOT_SECRET` is missing. (Confirmed)
