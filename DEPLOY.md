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

## 2a. Обновление на дробные продажи — ничего вручную не нужно

Выкатка сама приводит базу в порядок: контейнер `db-push` выполняет
`prisma db push`, а сразу за ним два идемпотентных заполнителя
(`backfill-sold-at.ts`, `backfill-pos-sales.ts`). Отдельных шагов нет.

**Почему на это стоит посмотреть, если будете менять схему.** Колонка
`stock_movements.sold_at` (деловая дата операции) объявлена НУЛЕВОЙ и без
`@default(now())` — намеренно. Прод накатывает схему без участия человека, с
`--accept-data-loss`. Объяви такую колонку с дефолтом — и
`ADD COLUMN ... DEFAULT now()` проставит момент деплоя **всем существующим
строкам**: история продаж схлопнется в один день, молча и без единой ошибки.
Инструкция в этом файле такого не остановит, потому что читать её на выкатке
некому. Добавление нулевой колонки существующие строки не трогает, а значения
им проставляет заполнитель следующей командой.

То же правило действует для любой новой обязательной колонки в живой таблице.

Проверить состояние базы можно в любой момент — скрипт только читает:

```bash
node scripts/db-preflight-sales.mjs
```

Расширение `crm_orders.order_number` с VarChar(20) до VarChar(32) применяется
обычным `db push`. До него номер заказа витрины (23 символа) в колонку не
влезал, вставка зеркала падала, ошибка гасилась внутри `/ingest/order` — и **ни
один заказ с сайта не доезжал до CRM офиса**. После выкатки убедитесь, что
новые заказы там появляются.

## 2в. Выкатка останавливается, если схема удаляет данные

Перед `db push` выкатка печатает SQL, который собирается применить, и
останавливается, если в нём есть `DROP TABLE` или `DROP COLUMN`
(`deploy/schema-diff.sh`).

**Зачем, если снимок базы и так снимается.** Снимок — это путь назад, а
чтобы им воспользоваться, потерю надо сначала заметить; замечали её по
жалобе. `--accept-data-loss` стоит на команде всегда и потому ничего не
сообщает: переименовали поле в `schema.prisma` — Prisma видит «одной
колонки не стало, другая появилась» и удаляет первую вместе с данными.

`DROP CONSTRAINT` и `DROP INDEX` выкатку не останавливают: они меняют
правила, а не данные, и в обычной правке схемы их бывает много.

**Если удаление намеренное** — задайте в репозитории переменную
(Settings → Variables, не Secrets) `ALLOW_SCHEMA_DATA_LOSS` = `1` и
перезапустите выкатку. После неё переменную уберите: она разрешает
удаление всем последующим выкаткам, а нужна была одной.

**Если это переименование** — переносите данные отдельным шагом
(заполнителем, как `backfill-sold-at.ts`), а не полагайтесь на `push`.

## 2b. Общие секреты: задаются в GitHub, а не на сервере

`INGEST_SECRET` и `DGIS_API_KEY` лежат в **Settings → Secrets and variables →
Actions**. Выкатка сама дописывает их в `/opt/microgreen/.env` перед подъёмом
контейнеров, поэтому переустановка сервера больше не теряет значения.

```
INGEST_SECRET   # openssl rand -base64 32
DGIS_API_KEY    # dev.2gis.ru — тот же ключ для лидов и для карты клиентов
```

**Выкатка не проедет с пустым `INGEST_SECRET` или `BOT_SECRET`** — проверка
стоит до скачивания образов и возвращает ненулевой код.

Почему так строго. `web_office` при `ENVIRONMENT=production` отвечает **401 на
каждый** `/ingest/*`, если секрет пуст (`_check_ingest_secret`). Витрина этот
отказ гасит намеренно — падение офиса не должно срывать покупателю заказ, — и
сайт выглядит совершенно здоровым. 18.08.2026 выяснилось, что так и было:
секрет пуст, и **ни один заказ с сайта не попадал в CRM**. Вместе с ним не
работали синхронизация статусов, карточки клиентов, геокодирование карты и
управление ботами из админки. Обнаружилось случайно — по кнопке на карте,
которая ходит в ту же дверь.

С тех пор отказ моста ещё и поднимает оповещение владельцу (вкладка сигналов),
а не только строку в аудите.

### Догнать пропущенное

Заказы, оформленные пока мост лежал, сами не догонят: `/ingest/order`
вызывается один раз, при оформлении. После починки секрета:

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps   -e OFFICE_INGEST_URL=http://web_office:8050/ingest/order   db-push sh -c "npx tsx packages/database/prisma/backfill-crm-orders.ts --dry-run"
```

`--dry-run` показывает расхождение и ничего не шлёт; без него — досылает.
Скрипт идемпотентен (зеркало узнаёт дубль по маркеру `[webapp:<номер>]`) и
передаёт настоящую дату заказа, иначе вся история легла бы в CRM одним днём.

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
