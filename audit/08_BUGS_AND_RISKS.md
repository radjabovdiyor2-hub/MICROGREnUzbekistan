# 08 BUGS AND RISKS

| Severity | Area | File | Problem | Evidence | Impact | Recommended Fix |
|----------|------|------|---------|----------|--------|-----------------|
| **CRITICAL** | Secrets | `check-env.js`, `fix-server.js`, `deploy_nginx.js`, `ssh_probe.py`, etc. | Hardcoded SSH passwords to the production server. | E.g. `password:'izxir(Kpaqfmsvaamtw8'` and `password="eddogvjzfdug&wAjugg5"` | Total server compromise. | Delete files, migrate to env vars, rotate server password. |
| **MEDIUM** | Architecture | `docker-compose.prod.yml` | PM bot is disabled because of token collision with Stepan. | Comments in compose file. | PM bot features might be unavailable or crammed into Stepan improperly. | Refactor PM logic fully into Stepan or use separate tokens. |
| **MEDIUM** | Deployment | `deploy.js` | Custom, brittle JS deploy scripts instead of CI/CD. | The existence of `deploy_nginx*.js` and `fix-images.js`. | Hard to maintain, prone to failing halfway. | Use GitHub Actions or robust shell script using SSH keys. |
| **LOW** | Integration | `apps/web/src/app/api/orders/route.ts` | Office ingest uses fire-and-forget `fetch` with 4s timeout. | `signal: AbortSignal.timeout(4000)` | Silently fails if office is down, CRM loses sync. | Implement retry queue or background job (e.g. BullMQ). |
