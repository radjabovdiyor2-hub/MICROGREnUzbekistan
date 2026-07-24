#!/usr/bin/env bash
# ============================================================================
# Microgreen Uzbekistan — деплой на сервер из GitHub
# Использование на сервере:
#   git pull && ./deploy.sh                 # весь стек
#   ./deploy.sh stepan support content web  # только указанные сервисы
# ----------------------------------------------------------------------------
# ВАЖНО: секреты (токены ботов, OpenAI, Instagram Page-токен, пароль БД)
# лежат в .env файлах, которые НЕ в git (в .gitignore). На сервере должны быть:
#   ./.env                 — POSTGRES_PASSWORD, INSTAGRAM_ACCESS_TOKEN (сайт), ...
#   ./apps/tgas/.env       — все *_BOT_TOKEN, OPENAI_API_KEY, INSTAGRAM_ACCESS_TOKEN, FACEBOOK_*
#   ./apps/bot/.env        — токен storefront-бота и т.д.
# Скопируйте *.env.example → .env и заполните реальными значениями (см. README).
# Убедитесь, что CONTENT_BOT_TOKEN и FINANCE_BOT_TOKEN указывают на РАЗНЫЕ боты,
# а INSTAGRAM_ACCESS_TOKEN — свежий долгоживущий Page-токен.
# ============================================================================
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "🔄 Обновляю код из git…"
git pull --ff-only

echo "🏗  Сборка и запуск ($*)…"
$COMPOSE up -d --build "$@"

echo "🔧 Применение лимитов Nginx (100MB)..."
sudo sed -i 's/client_max_body_size [0-9]*[a-zA-Z]*;/client_max_body_size 100M;/g' /etc/nginx/sites-available/* /etc/nginx/sites-enabled/* /etc/nginx/conf.d/* /etc/nginx/nginx.conf 2>/dev/null || true
$COMPOSE exec -T nginx nginx -s reload 2>/dev/null || true
sudo systemctl reload nginx 2>/dev/null || true
sudo service nginx reload 2>/dev/null || true

echo "📋 Статус контейнеров:"
$COMPOSE ps

echo "✅ Готово."
