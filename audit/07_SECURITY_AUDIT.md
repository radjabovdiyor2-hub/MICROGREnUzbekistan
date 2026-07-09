# 07 SECURITY AUDIT

| Area | Risk Type | File | Findings | Impact | Fix |
|------|-----------|------|----------|--------|-----|
| Secrets | Hardcoded SSH Credentials | `check-env.js`, `deploy_nginx*.js`, `fix-*.js`, `build-server.js`, `upload-server.js`, `ssh_probe.py`, `ssh_stop.py` | Literal production SSH IPs (`82.115.50.30`), usernames, and passwords hardcoded. | **CRITICAL**. Anyone with code access gets full root/user shell on prod. | Remove these files / rewrite using env vars. Rotate password NOW. |
| Secrets | `.env` exposure | `.env`, `apps/tgas/.env` | Confirmed they are NOT tracked in git. `.env.example` is safe. | None | N/A |
| Network | Exposed DB | `docker-compose.prod.yml` | Postgres `5432` and Redis `6379` are internal to docker network. N8n exposed via `5678`. | Low | Ensure N8N on `0.0.0.0:5678` is protected by basic auth. |
| Web | CORS | Nginx Config | Nginx has good headers (HSTS, X-Frame-Options). Next.js API relies on Next.js default CORS. | Low | Configure strict CORS for API if accessed cross-origin. |
| Docker | Privilege Escalation | `docker-compose.prod.yml` | `mg_devops` mounts `/var/run/docker.sock`. | High | If devops bot is compromised, entire host is compromised. Ensure strict auth for devops bot commands. |
