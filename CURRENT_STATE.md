# CURRENT_STATE

Status: VERIFIED_PHASE_9

Этот файл содержит текущий подтверждённый статус проекта.

## Текущее состояние
- Проект разделен на две базы данных (Storefront и AI Office). Обе базы крутятся в одном экземпляре PostgreSQL.
- Настроен `docker-compose.prod.yml`, включающий 15 сервисов (БД, кэш, миграции, web, storefront bot и 11 внутренних## В процессе (In Progress)
- Ничего (Аудит Фазы 9 завершён)

## Выполненная работа (Completed Work)
- Фаза 1: Инвентаризационный аудит (Завершено)
- Фаза 2: Аудит конфигурации (Завершено)
- Фаза 3: Аудит БД и миграций (Завершено)
- Фаза 4.1: Исправление багов в ботах (Завершено)
- Фаза 4.2: Интеграция N8N Webhooks (Завершено)
- Фаза 9: Логический аудит индивидуальных бизнес-ботов (Завершено)
  - Выявлен и устранен баг двойной записи (Double-write) доходов в `finances` (Sales Bot и Finance Bot).
  - Выявлена и устранена ошибка `IndentationError` / `SyntaxError` во всех ботах, вызванная скриптом автозамены.
  - Устранена ошибка цикличного импорта `task_ui_router` (`RuntimeError: Router is already attached`), вызванная патчем Phase 4.
  - Боты пересобраны и запущены в `docker-compose.prod.yml`.
  - Подтверждено использование `timezone(timedelta(hours=5))` для UTC+5 в `scheduler.py`.

## Следующие шаги (Next Actions)
- Фаза 10: Интеграционное тестирование E2E или Аудит Безопасности.
2. **EB-1 (Race Condition)**: В `shared/bot_bus.py` внедрён атомарный захват задач. Статус: `LINUX VALIDATION BLOCKED` (Windows concurrency partially verified).
3. **PORT-1 (Inconsistent AIOHTTP)**: Унифицирован запуск серверов через `event_bus.start_listening(PORT, app)`. Все боты (8081-8092) запускают AIOHTTP серверы корректно.
4. **LOGIC-1 (Fake Task Completion)**: Исправлена ошибка, из-за которой боты мгновенно закрывали `TASK_CREATED` события. ИИ теперь не закрывает задачи автоматически.
5. **LOGIC-2 (Silent DB Tasks)**: В `shared/notifications.py` добавлены публикации `TASK_CREATED` для задач производства, жалоб и HR.
6. **LOGIC-3 (Fire-and-forget Drop)**: Добавлен `_background_tasks` для предотвращения сборки мусора во время `send_direct`.

## Выявленные новые риски (по результатам Phase 3)
- Ошибка несоответствия конфигурации: В `config.py` ожидается `microgreen_uz` (по умолчанию), а Docker использует `microgreen` (Было исправлено в Phase 2).
- Регистрация DDL-таблиц: `storefront_outbox` создается как в `init.sql`, так и в runtime `web_office` (создание через SQLAlchemy) (Было исправлено в Phase 2).
- Отсутствие UI для ручного закрытия задач: После отключения "Fake Task Completion", пользователи не имеют кнопок для отправки `TASK_COMPLETED` (требуется доработка UI ботов).

## Непроверенные компоненты
- Взаимодействие N8N (External Webhooks).
- Prisma DB Push to `microgreen_db`.
