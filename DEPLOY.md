# Деплой Microgreen Uzbekistan на сервер (через GitHub)

Стек: Postgres + Redis + Next.js-сайт (`web`) + storefront-бот (`bot`) + AI-офис
(`stepan/sales/support/hr/finance/marketing/analytics/content/rnd/...`). Всё в
`docker-compose.prod.yml`, собирается из `apps/tgas` (боты) и `apps/web`, `apps/bot`.

## 1. Первый запуск на сервере

```bash
git clone <repo-url> microgreen && cd microgreen
git checkout merge/tgas-monorepo      # ветка с актуальным кодом

# Секреты (НЕ в git!). Скопируйте примеры и заполните реальными значениями:
cp .env.example .env
cp apps/tgas/.env.example apps/tgas/.env
cp apps/bot/.env.example apps/bot/.env      # если есть
# Проверьте ОБЯЗАТЕЛЬНО:
#  - POSTGRES_PASSWORD (в корневом .env) — тот же, что использует БД
#  - OPENAI_API_KEY
#  - все *_BOT_TOKEN РАЗНЫЕ (особенно CONTENT_BOT_TOKEN ≠ FINANCE_BOT_TOKEN)
#  - INSTAGRAM_ACCESS_TOKEN — свежий долгоживущий Page-токен (тип PAGE, never)
#    (одинаковый в корневом .env для сайта и в apps/tgas/.env для ботов)

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

## 2. Обновления (CI/CD руками)

```bash
git pull && ./deploy.sh                       # пересобрать всё
./deploy.sh stepan                            # только Менеджера
./deploy.sh content support analytics rnd     # выборочно
```

## 3. Полезное

- Логи: `docker compose -f docker-compose.prod.yml logs -f stepan`
  (⚠️ `hr` пишет логи в файл: `docker exec mg_hr tail -f hr_debug.log`)
- Обновить Instagram-токен (когда истечёт/отзовут): получить свежий User-токен в
  Graph API Explorer (scopes: instagram_basic, instagram_content_publish,
  instagram_manage_messages, instagram_manage_insights, pages_show_list,
  pages_read_engagement) → `python apps/tgas/run_token_exchange.py <short_token>`
  → скопировать новый `INSTAGRAM_ACCESS_TOKEN` в корневой `.env` и `apps/tgas/.env`
  → `./deploy.sh content support analytics rnd stepan web`.
- Порты event-bus ботов фиксированы (8081–8092), см. `docker-compose.prod.yml`.
