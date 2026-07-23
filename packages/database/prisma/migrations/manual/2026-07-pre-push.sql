-- ════════════════════════════════════════════════════════════
-- Подготовка базы ПЕРЕД `npm run db:push`.
--
-- Зачем: в схеме колонка magazine_events.char_id переименована в dish_id.
-- `prisma db push` реализует переименование как DROP COLUMN + ADD COLUMN,
-- то есть молча теряет данные. Этот скрипт делает настоящий RENAME заранее —
-- после него push видит колонку уже правильной и не трогает её.
--
-- Запуск:
--   psql "$DATABASE_URL" -f packages/database/prisma/migrations/manual/2026-07-pre-push.sql
--
-- Скрипт идемпотентен: повторный запуск ничего не сломает.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- 1. Переименование колонки событий (сохраняет историю)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'magazine_events' AND column_name = 'char_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'magazine_events' AND column_name = 'dish_id'
  ) THEN
    ALTER TABLE magazine_events RENAME COLUMN char_id TO dish_id;
    RAISE NOTICE 'magazine_events.char_id -> dish_id: переименовано';
  ELSE
    RAISE NOTICE 'magazine_events: переименование не требуется';
  END IF;
END $$;

-- 2. Страховка на magazine_issues.
-- Таблица мертва (в коде нет ни одного обращения к prisma.magazineIssue),
-- и `db push` её удалит. Если там всё же остались нужные строки —
-- раскомментируйте следующий блок ДО push.
--
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'magazine_issues')
--      AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'magazine_issues_backup')
--   THEN
--     CREATE TABLE magazine_issues_backup AS SELECT * FROM magazine_issues;
--     RAISE NOTICE 'magazine_issues скопирована в magazine_issues_backup';
--   END IF;
-- END $$;

COMMIT;

-- Проверка после запуска (ожидаем прежнее число строк и колонку dish_id):
--   SELECT count(*) FROM magazine_events;
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'magazine_events' ORDER BY 1;
