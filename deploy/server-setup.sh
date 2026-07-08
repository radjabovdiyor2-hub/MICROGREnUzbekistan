#!/usr/bin/env bash
# ============================================================================
#  Microgreen Uzbekistan — server setup + cutover (SHARED host, e.g. 4GB VPS)
#
#  Installs Docker, builds the unified stack, then swaps the live site with
#  ZERO-ish downtime and points the existing system nginx at the container.
#
#  Strictly scoped to Microgreen. NEVER touches mahalu / uziz / oltin-baliq
#  (their PM2 apps, dirs and nginx vhosts are left alone). Keeps
#  ~/microgreen-uploads and the Let's Encrypt certificate.
#
#  Run from the repo root ON THE SERVER:
#      bash deploy/server-setup.sh
#  (non-interactive over SSH: pass SUDO_PASS=... in the environment)
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

sudo_run() { if [ -n "${SUDO_PASS:-}" ]; then echo "$SUDO_PASS" | sudo -S -p '' "$@"; else sudo "$@"; fi; }
D()  { sudo_run docker "$@"; }
DC() { D compose -f docker-compose.prod.yml "$@"; }

UPLOADS=/home/ubuntu/microgreen-uploads
NGINX_SITE=/etc/nginx/sites-available/microgreen
export HOST_UPLOADS_DIR="$UPLOADS"

echo "== 1/7  Docker =="
if ! command -v docker >/dev/null 2>&1; then
  echo "  installing Docker Engine + Compose plugin..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo_run sh /tmp/get-docker.sh
fi
D --version
DC version | head -1 || true

echo "== 2/7  Preserve uploads dir =="
mkdir -p "$UPLOADS"

echo "== 3/7  Build images (old PM2 site keeps serving) =="
DC build

echo "== 4/7  Start the unified stack (web on 127.0.0.1:3000; edge nginx stays OFF) =="
DC up -d --remove-orphans

echo "== 5/7  Repoint the system nginx MICROGREEN vhost -> container (only this vhost) =="
if [ -f "$NGINX_SITE" ]; then
  sudo_run sed -i -E 's#server 127\.0\.0\.1:[0-9]+;#server 127.0.0.1:3000;#' "$NGINX_SITE"
  sudo_run nginx -t && sudo_run systemctl reload nginx
else
  echo "  (microgreen vhost not found — configure the domain -> 127.0.0.1:3000 manually)"
fi

echo "== 6/7  Retire ONLY the Microgreen PM2 apps (neighbours untouched) =="
pm2 delete microgreen-web microgreen-bot 2>/dev/null || true
pm2 save 2>/dev/null || true

echo "== 7/7  Verify =="
sleep 10
DC ps
curl -s -o /dev/null -w "  web(127.0.0.1:3000): %{http_code}\n" http://127.0.0.1:3000 || true
curl -s -o /dev/null -w "  https site:          %{http_code}\n" https://microgreenuzbekistan.com || true
echo
echo "Done. mahalu / uziz / oltin-baliq were not touched."
echo "Two DBs live in one Postgres: microgreen (CRM) + microgreen_db (storefront)."
