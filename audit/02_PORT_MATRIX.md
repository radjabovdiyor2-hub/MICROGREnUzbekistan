# 02 PORT MATRIX

| Port | Service | Source File | Internal/External | Protocol | Used By | Exposed To Host | Nginx Route | Health Check | Status | Problem | Fix |
|------|---------|-------------|-------------------|----------|---------|-----------------|-------------|--------------|--------|---------|-----|
| 3000 | web (prod) | `docker-compose.prod.yml` | Internal loopback | HTTP | Nginx/Client | `127.0.0.1:3000` | Yes (likely) | Yes (curl) | TBD | | |
| 3005 | web (dev) | `package.json` | Internal | HTTP | Dev | TBD | No | TBD | TBD | | |
| 8050 | web_office | `docker-compose.prod.yml` | Internal loopback | HTTP | web (via OFFICE_INGEST_URL) | `127.0.0.1:8050` | No | No | TBD | | |
| 5432 | postgres | `docker-compose.prod.yml` | Internal | TCP | All apps | No (in prod) | No | Yes (pg_isready) | TBD | | |
| 6379 | redis | `docker-compose.prod.yml` | Internal | TCP | All apps | No | No | Yes (ping) | TBD | | |
| 80 | nginx | `docker-compose.prod.yml` | External | HTTP | Clients | `0.0.0.0:80` | N/A | No | TBD | Profile edge only | |
| 443 | nginx | `docker-compose.prod.yml` | External | HTTPS | Clients | `0.0.0.0:443` | N/A | No | TBD | Profile edge only | |
| 5678 | n8n | `docker-compose.prod.yml` | External to host | HTTP | `n8n_bridge` | TBD | No | No | TBD | Reaches host.docker.internal | |

*Note: Needs verification via netstat and running services.*
