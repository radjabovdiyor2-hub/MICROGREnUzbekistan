#!/bin/bash
# ============================================================================
# deploy_unified.sh — Деплой единой базы данных
# ============================================================================
# Запуск: ssh server "cd /opt/microgreen && bash deploy_unified.sh"
# ============================================================================
set -euo pipefail

echo "🔄 Деплой: единая база данных"
echo "================================"

# 1. Остановить всё
echo "⏹️  Останавливаю все сервисы..."
docker compose -f docker-compose.prod.yml down --timeout 30

# 2. Бэкап обеих баз
echo "💾 Создаю бэкапы..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker start mg_postgres 2>/dev/null || true
sleep 3

docker exec mg_postgres pg_dump -U mg_user microgreen > "backups/microgreen_${TIMESTAMP}.sql" 2>/dev/null || echo "⚠️ microgreen бэкап пропущен (база может не существовать)"
docker exec mg_postgres pg_dump -U mg_user microgreen_db > "backups/microgreen_db_${TIMESTAMP}.sql" 2>/dev/null || echo "⚠️ microgreen_db бэкап пропущен"

echo "✅ Бэкапы: backups/microgreen_${TIMESTAMP}.sql, backups/microgreen_db_${TIMESTAMP}.sql"

# 3. Импорт данных из microgreen_db в microgreen (если microgreen_db существует)
echo "📦 Импорт данных из microgreen_db в microgreen..."
docker exec mg_postgres psql -U mg_user -d microgreen -c "SELECT 1" > /dev/null 2>&1 || {
    echo "❌ База microgreen не доступна"
    exit 1
}

# Проверяем существует ли microgreen_db
if docker exec mg_postgres psql -U mg_user -d microgreen_db -c "SELECT 1" > /dev/null 2>&1; then
    echo "  Переносим таблицы из microgreen_db..."
    
    # Список Prisma-таблиц витрины (web)
    TABLES=(
        "categories" "products" "users" "addresses" "cart_items" "favorites"
        "orders" "order_items" "promo_codes" "reviews" "ai_chats" "promotions"
        "employees" "stock_movements" "suppliers" "debts" "magazine_subscribers"
        "restaurants" "loyalty_cards" "magazine_editions" "restaurant_issues"
        "advertisers" "franchise_journals" "print_subscriptions" "print_orders"
        "magazine_events" "dishes" "guest_photos" "recipes" "recipe_steps"
        "recipe_ingredients" "payme_transactions"
    )
    
    for tbl in "${TABLES[@]}"; do
        if docker exec mg_postgres psql -U mg_user -d microgreen_db -c "SELECT 1 FROM ${tbl} LIMIT 1" > /dev/null 2>&1; then
            # Таблица существует в microgreen_db — копируем данные
            if ! docker exec mg_postgres psql -U mg_user -d microgreen -c "SELECT 1 FROM ${tbl} LIMIT 1" > /dev/null 2>&1; then
                echo "  📋 ${tbl}: будет создана prisma db push"
            fi
        fi
    done
    echo "  ℹ️  Таблицы будут созданы после prisma db push"
else
    echo "  ℹ️  microgreen_db не найдена — новая установка"
fi

docker stop mg_postgres 2>/dev/null || true

# 4. Pull + Build
echo "📥 Обновляю код..."
git pull

# 5. Сначала ТОЛЬКО база — переименование должно пройти ДО `prisma db push`.
#
# Раньше здесь поднимался весь стек разом, а миграция шла шагом ниже. Но в
# стеке есть сервис db-push, и он стартовал первым: prisma db push видел
# офисные `products`/`orders` (ещё не переименованные), считал их своими и
# приводил к схеме витрины с --accept-data-loss. Порядок обязан быть таким:
# postgres → unify_databases.sql → db-push → всё остальное.
echo "🗄️  Поднимаю PostgreSQL..."
docker compose -f docker-compose.prod.yml up -d postgres

echo "⏳ Жду PostgreSQL..."
for i in $(seq 1 30); do
    if docker exec mg_postgres pg_isready -U mg_user -d microgreen > /dev/null 2>&1; then
        echo "  ✅ PostgreSQL готов"
        break
    fi
    sleep 2
done

# 6. Переименование конфликтующих таблиц (идемпотентно, безопасно повторно)
echo "🔧 Запускаю миграцию таблиц..."
docker cp packages/database/prisma/migrations/unify_databases.sql mg_postgres:/tmp/unify_databases.sql
docker exec mg_postgres psql -U mg_user -d microgreen -f /tmp/unify_databases.sql

# 6a. Теперь остальной стек: db-push накатит схему уже на переименованные таблицы
echo "🏗️  Пересобираю и запускаю остальное..."
docker compose -f docker-compose.prod.yml up -d --build

# 7. Если была microgreen_db — перенести данные после prisma db push
if [ -f "backups/microgreen_db_${TIMESTAMP}.sql" ]; then
    echo "📦 Переносим данные из microgreen_db бэкапа..."
    # pg_dump создаёт INSERT'ы — пробуем загрузить, игнорируя конфликты
    docker exec -i mg_postgres psql -U mg_user -d microgreen < "backups/microgreen_db_${TIMESTAMP}.sql" 2>/dev/null || echo "  ⚠️ Частичный импорт (конфликты пропущены)"
fi

# 8. Миграция content_status.json
echo "📄 Мигрирую content_status.json → PostgreSQL..."
docker exec mg_stepan python scripts/migrate_content_status.py 2>/dev/null || echo "  ℹ️  content_status.json отсутствует или уже мигрирован"

# 9. Проверка
echo ""
echo "✅ Деплой завершён!"
echo "================================"
echo "Проверка сервисов:"
docker compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}"
