# 02 RISK REGISTER

| Risk | Description | Level | Status |
|------|-------------|-------|--------|
| `DB_DATA_LOSS` | Usage of `--accept-data-loss` in CI/CD `prisma db push` could wipe tables on drift. | Critical | Closed (Removed flag) |
| `BOT_SECRET_EXPOSURE` | Missing `BOT_SECRET` in `.env` bypassed auth check entirely. | High | Closed (Enforced in prod) |
| `ORDER_SYNC_LOSS` | Orders fail to sync to CRM if CRM is down. | High | Closed (Added 3x background retry) |
| `LINT_CI_FAIL` | `next lint --dir src` crashed CI build. | Medium | Closed (Switched to `eslint .`) |
| `ZERO_TEST_COVERAGE` | No automated tests to catch regressions. | Medium | Partially Closed (Added basic API tests) |
| `PRISMA_NO_MIGRATIONS` | `db push` used in production instead of versioned migrations. | Medium | Open / Needs action |
| `DOCKER_SOCK_EXPOSURE` | `mg_devops` container had access to `/var/run/docker.sock`. | High | Closed (Removed volume) |
| `N8N_BASIC_AUTH` | N8N instance lacks basic auth config (`N8N_BASIC_AUTH_ACTIVE=true`). | Medium | Open / Needs user action |
