# 05 DOCKER + NGINX + DEPLOY AUDIT

| Component | Check | Status | Problem | Fix |
|-----------|-------|--------|---------|-----|
| Docker | Container startup order | OK | `depends_on` used correctly for `postgres` and `redis`. | None |
| Docker | Healthchecks | OK | PG, Redis, and Web have healthchecks configured. | None |
| Docker | Volumes (data persistence) | OK | `pg_data`, `redis_data`, `bus_tasks` are mapped. | None |
| Docker | Network isolation | OK | Custom `mg_net` bridge used. `postgres` and `redis` ports are NOT exposed to host. | None |
| Docker | Privileges | WARNING | `mg_devops` mounts `/var/run/docker.sock`. | Allows container breakout. Ensure bot has strict auth. |
| Nginx | Correct proxies | OK | Proxies Next.js via `http://nextjs` (web:3000). | Nginx only starts with `edge` profile. |
| Nginx | HTTPS/SSL | OK | Certbot configured. HSTS, X-Frame-Options enabled. | None |
| Deploy | Scripts safety | CRITICAL | Custom `deploy.js` scripts have hardcoded SSH credentials. | Migrate to SSH keys / CI-CD. |
| Backups | Logic | TBD | Volumes map to `./backups`, but rotation needs check. | Review backup script. |
