# CUTOVER — going live with the unified stack

`node deploy.js` only **stages + builds** on the server (non-destructive). This
runbook is the **reviewed manual step** that swaps the live stack. Run it on the
server (`ssh ubuntu@82.115.50.30`), in `~/MICROGREnUzbekistan`.

> ⚠️ The unified `docker-compose.prod.yml` reuses the container names `mg_*` and
> creates a **new** Postgres volume (`microgrenuzbekistan_pg_data`). If you just
> start it, you get a **fresh empty database** and the current data is orphaned
> (not deleted — still in the old volume). Choose A or B below.
>
> This never touches the other projects on the box (Mahallu / UzIs). Only `mg_*`
> containers and the `microgreen-*` PM2 apps are affected. The Docker nginx is in
> the `edge` profile and stays OFF — the system nginx keeps owning 80/443.

## 0. Pre-flight
```bash
cd ~/MICROGREnUzbekistan
docker compose -f docker-compose.prod.yml build          # already done by deploy.js
docker ps --format '{{.Names}}\t{{.Status}}' | grep mg_    # note the old stack
docker volume ls | grep pg_data                            # find the OLD pg volume name
```

## 1. Stop the old microgreen stack (graceful, keeps volumes)
```bash
# If the old stack was started from ./apps/tgas (or old ./tgas) compose:
docker compose -f apps/tgas/docker-compose.yml down        # stops old mg_* , KEEPS volume
# microgreen website under PM2 (leaves Mahallu/UzIs PM2 apps alone):
pm2 delete microgreen-web microgreen-bot 2>/dev/null || true
```
If `down` doesn't catch everything, remove the leftover microgreen containers by
name (they are all `mg_*`): `docker rm -f mg_postgres mg_redis mg_stepan ...`

## 2A. Option A — RESET data (fresh DB, seeds run automatically)
Fine for a clean launch / no important data yet.
```bash
docker compose -f docker-compose.prod.yml up -d
# init runs: creates microgreen + microgreen_db, seeds tgas CRM schema,
# db-push applies the Prisma storefront schema into microgreen_db.
```

## 2B. Option B — KEEP existing data (recommended if the old DB has real data)
Reuse the old Postgres volume so nothing is lost.
```bash
# 1) find the old volume from step 0 (e.g. tgas_pg_data)
OLD_VOL=tgas_pg_data
# 2) tell compose to use it as an external volume:
#    edit docker-compose.prod.yml -> volumes: pg_data: { external: true, name: $OLD_VOL }
#    (or: docker volume create microgrenuzbekistan_pg_data && restore a dump into it)
docker compose -f docker-compose.prod.yml up -d
# Because the volume is NOT empty, the init scripts are SKIPPED. So create the
# storefront DB once and push the Prisma schema manually:
docker exec mg_postgres psql -U mg_user -d microgreen \
  -c "CREATE DATABASE microgreen_db OWNER mg_user;" 2>/dev/null || true
docker compose -f docker-compose.prod.yml run --rm db-push
```
(Alternatively `pg_dump` the old DB and restore into the fresh volume — safest.)

## 3. Point the system nginx at the web container
The web container listens on `127.0.0.1:3000`. Make sure the microgreen vhost in
the **system** nginx proxies there (only edit microgreen's server block):
```nginx
# /etc/nginx/sites-available/microgreenuzbekistan  (upstream)
proxy_pass http://127.0.0.1:3000;
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Verify
```bash
docker compose -f docker-compose.prod.yml ps
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000     # 200
docker compose -f docker-compose.prod.yml logs --tail=30 stepan finance
docker exec mg_postgres psql -U mg_user -c '\l' | grep microgreen  # both DBs
```

## Rollback
```bash
docker compose -f docker-compose.prod.yml down     # keeps volumes
# restart the previous stack / PM2 apps as before
```
