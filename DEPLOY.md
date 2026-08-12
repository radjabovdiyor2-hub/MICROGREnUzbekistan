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
- Порты event-bus ботов фиксированы (8081–8093), см. `docker-compose.prod.yml`.
  Здесь значилось «8081–8092», и 8093 терялся: `EVENT_ENDPOINTS` включает
  `("mg_franchise", 8093)`, поэтому firewall по старому диапазону обрывал
  HTTP-fallback Event Bus до franchise_bot, когда Redis недоступен.

## 4. Авто-деплой через GitHub Actions (по push в main)

Workflow `.github/workflows/deploy.yml` при каждом push в `main` (или вручную через
Actions → Deploy to server → Run workflow) заходит на сервер по SSH и делает
`git pull` + `docker compose up -d --build`.

Добавьте секреты репозитория (GitHub → Settings → Secrets and variables → Actions → New):
- `SSH_HOST` — IP/домен сервера
- `SSH_USER` — пользователь (root/deploy)
- `SSH_KEY` — приватный SSH-ключ (весь файл, с BEGIN/END). Публичный ключ добавьте на
  сервер в `~/.ssh/authorized_keys`. **Не вставляйте ключ/пароль в переписку — только в GitHub Secrets.**
- `DEPLOY_PATH` — путь к репо на сервере (напр. `/opt/microgreen`)
- `SSH_PORT` — необязательно (по умолчанию 22)

Разово на сервере: `git clone`, `git checkout main`, заполнить `.env`-файлы (их нет в git),
один раз запустить деплой. Дальше — автоматически.

## 5. Откат (Rollback)

Для отката на старую версию без пересборки образов:
`MG_TAG=sha-<старый-sha> docker compose -f docker-compose.prod.yml up -d`
