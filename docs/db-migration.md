# Миграция БД под «Живое меню», лояльность и рецепты

Схема накопила изменения за три итерации. Один шаг в ней **разрушительный**, поэтому
просто запустить `db push` нельзя — сначала ручной SQL.

## Что меняется

**Добавляется** (безопасно):
- таблицы `dishes`, `guest_photos`, `loyalty_cards`, `recipes`, `recipe_steps`, `recipe_ingredients`;
- колонки `restaurants.loyalty_goal`, `restaurants.loyalty_reward_percent`.

**Удаляется**:
- таблица `magazine_issues` — мертва, в коде нет ни одного обращения (`prisma.magazineIssue`);
- колонка `magazine_subscribers.issue_id` — ссылалась на удаляемую таблицу.
  Сама таблица `magazine_subscribers` **остаётся**: это живой пайплайн заявок на печать.

**Переименовывается** (⚠️ здесь и была опасность):
- `magazine_events.char_id` → `dish_id`. Prisma при `db push` делает это как
  `DROP COLUMN` + `ADD COLUMN`, то есть теряет историю событий.

## Порядок действий

```bash
# 0. Что сейчас в базе и что именно потеряется (только чтение, ничего не меняет)
node scripts/db-preflight.mjs

# 1. Бэкап (обязательно)
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql

# 2. Ручной SQL — настоящий RENAME вместо DROP+ADD
psql "$DATABASE_URL" -f packages/database/prisma/migrations/manual/2026-07-pre-push.sql

# 3. Синхронизация схемы
npx prisma db push --schema=packages/database/prisma/schema.prisma --accept-data-loss

# 4. Клиент Prisma
npm run db:generate
```

**Почему `--accept-data-loss`.** Prisma видит удаление мёртвой `magazine_issues`
и её колонки `magazine_subscribers.issue_id` и без флага отказывается работать:
`Use the --accept-data-loss flag to ignore the data loss warnings`. Флаг ставится
осознанно — **после** того, как preflight (шаг 0) показал, что в `magazine_issues`
нет нужных строк. Проверено: без флага команда падает, с флагом проходит,
а история `magazine_events` остаётся на месте благодаря шагу 2.

Если в `magazine_issues` всё же есть нужные строки — раскомментируйте блок бэкапа
внутри SQL-скрипта до шага 3.

## Что покажет preflight

| Строка отчёта | Что означает |
|---|---|
| `колонка: char_id → нужен ручной SQL` | шаг 2 обязателен, иначе история событий пропадёт |
| `колонка: dish_id → уже выполнено ✓` | переименование сделано, шаг 2 можно пропустить |
| `magazine_issues: строк 0` | удалять безопасно |
| `magazine_issues: строк N` ⚠ | сначала бэкап таблицы, иначе данные уйдут |
| `ВЕРДИКТ: уже применена` | база в актуальном состоянии, делать нечего |

## Проверка после миграции

```sql
-- история событий сохранена, колонка называется dish_id
SELECT count(*) FROM magazine_events;
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'magazine_events' ORDER BY 1;

-- новые таблицы на месте
SELECT table_name FROM information_schema.tables
 WHERE table_name IN ('dishes','guest_photos','loyalty_cards','recipes','recipe_steps','recipe_ingredients')
 ORDER BY 1;
```

## Почему не `prisma migrate`

`packages/database/prisma/migrations` пуста — проект всю жизнь работает через
`db push`, истории миграций нет. Полноценный переход на `migrate` потребовал бы
бейзлайна живой базы; ради одного переименования это лишний риск. Когда история
миграций понадобится по-настоящему, баз­лайн делается отдельной задачей на спокойную
голову.

## Как это проверялось

На временной БД в docker: накатили **старую** схему, залили 3 строки в
`magazine_events` и 1 в `magazine_issues`, затем:

1. `db-preflight.mjs` → «нужен ручной SQL», предупредил о потере 3 записей и
   о непустой `magazine_issues`;
2. `prisma migrate diff` до скрипта показывал `DROP COLUMN "char_id"`, после
   скрипта `magazine_events` исчез из диффа полностью;
3. `db push` без флага упал с требованием `--accept-data-loss`, с флагом прошёл;
4. после миграции в `magazine_events` те же 3 строки со значениями
   `semurg, anor`, а preflight сказал «уже применена».
