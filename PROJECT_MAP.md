# PROJECT_MAP

Status: PHASE_3_SYSTEM_MAPPING

## Основные директории
- `apps/web`: Next.js фронтенд (Storefront витрина).
- `apps/bot`: Storefront Telegram Bot (декомпозирован на пакеты: `agronomist`, `shop`, `unified`, `ai_service`, `crosspost`, `ecosystem`).
- `apps/tgas`: AI-офис (CRM, шины событий и 11 ботов tgas).
- `packages/database`: Prisma-схема для Storefront (витрина).

## Структура AI-офиса (`apps/tgas`)
- `web_office`: FastAPI-дэшборд и мост интеграции с витриной (порт 8050).
- `shared/`: Общие модули (bot_bus, event_bus, config, database, scheduler).
- `database/init.sql`: DDL для базы данных офиса.
- `bots/`: Индивидуальные AI-боты (Stepan, Sales, Support, HR, Finance, QA, R&D, Marketing, Content, Analytics, DevOps) + мост `n8n_bridge`.

## Инфраструктура
- **PostgreSQL**: Единый инстанс, две БД (`microgreen` для офиса, `microgreen_db` для витрины).
- **Redis**: Общий инстанс для кэша и Pub/Sub.
- Docker Compose: `docker-compose.prod.yml` включает все 15 сервисов.

## Execution Paths (Phase 3)

### HTTP Integration: Order Ingest
`Внешний API-клиент (Storefront) → POST http://localhost:8050/ingest/order → DNS (localhost) → Port 8050 → Route /ingest/order → Validation (auth X-Ingest-Secret, JSON body) → web_office (main.py) → DB Insert (orders table) → event_bus.publish(ORDER_CREATED) → HTTP 200 OK Response`

### Event Bus: ORDER_CREATED
`web_office → ORDER_CREATED → Payload (order_id, order_number, total_amount) → Transport: HTTP POST (direct aiohttp broadcast to bot endpoints) → Destination: mg_stepan:8081, mg_sales:8082, etc. → Route: /event → Handlers: on_any_event (stepan_bot), pm_on_order_created, finance_on_order_created → Side effects (Creates tasks in DB for delivery/production, publishes TASK_CREATED)`

### Database Operations: Task Creation
`stepan_bot / pm_on_order_created → INSERT INTO tasks (title, assignee, department, status, priority) RETURNING id → parameters (order_number, items) → Transaction auto-commit → schema (tasks) → consumer (bot logic continuing to publish TASK_CREATED)`

### Event Bus: TASK_CREATED & TASK_COMPLETED
`stepan_bot / notifications.py → TASK_CREATED → Payload (task_id, department, description) → Transport: HTTP POST → Destination: all bots → Handlers (e.g. handle_task_created in sales_bot) → Validation (department == sales) → AI response generation → Telegram bot.send_message → [MANUAL COMPLETION EXPECTED] → User interaction → TASK_COMPLETED → stepan_bot (handle_task_completed) → DB UPDATE tasks SET status='done'`

### N8N Webhooks Integration
"External N8N instance (host machine) -> POST mg_{bot}:{port}/n8n-webhook -> Action Handled (e.g., csat_survey_check) -> Task Created / Broadcasted"
