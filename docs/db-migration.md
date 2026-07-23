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
# 1. Бэкап (обязательно)
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql

# 2. Ручной SQL — настоящий RENAME вместо DROP+ADD
psql "$DATABASE_URL" -f packages/database/prisma/migrations/manual/2026-07-pre-push.sql

# 3. Синхронизация схемы
npm run db:push

# 4. Клиент Prisma
npm run db:generate
```

Если в `magazine_issues` всё же есть нужные строки — раскомментируйте блок бэкапа
внутри SQL-скрипта до шага 3.

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

На временной БД: накатили **старую** схему (`git show HEAD:...schema.prisma`),
залили строки в `magazine_events`, выполнили ручной SQL, затем
`prisma migrate diff` — `magazine_events` из диффа исчез полностью (было
`DROP COLUMN "char_id"`). После `db push` строки остались на месте вместе со
значениями.
