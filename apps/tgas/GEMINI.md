# apps/tgas — AI Office (11 Autonomous Bots)

## What this is

«Microgreen Uzbekistan» — набор независимых Telegram-ботов (aiogram 3), каждый из которых играет роль
AI-сотрудника (Sales, Support, Marketing, HR, Finance, PM, Analytics, Content, Stepan/помощник CEO,
DevOps, QA, R&D, n8n_bridge) для бизнеса по продаже микрозелени/гидропоники. Боты используют одну общую
CRM-базу Postgres и координируются через самописные event bus + task bus, а не через готовый фреймворк.
FastAPI-дашборд (`web_office/`) даёт read-view над той же БД.

Весь код (докстринги, логи, промпты) на русском — придерживайтесь этого стиля при правках существующих модулей.

## 🚫 CRITICAL CONSTRAINTS (Never do this)

- NEVER use SQLAlchemy ORM models (Base) for database queries. ALWAYS use raw SQL via `sqlalchemy.text()` and `get_session_ctx()`.
- NEVER bypass the Event Bus. If bot A needs to trigger bot B, publish an event via HTTP POST.
- NEVER invent new Event names. Use existing constants in `shared/event_bus.py`.
- NEVER create raw OpenAI/Gemini clients. ALWAYS use the `AIEngine` wrapper from `shared/ai_engine.py`.
- NEVER write logs, comments, or docstrings in English. The language of this module is Russian.
- NEVER create a new `Settings()` instance. Import the singleton: `from shared.config import settings`.

## Запуск

**Инфраструктура (Postgres + Redis, нужна каждому боту):**
```
docker compose up -d postgres redis
```

**Запуск одного бота локально** (каждый — самостоятельный процесс/entrypoint):
```
python -m bots.sales_bot.main
python -m bots.stepan_bot.main
# ... и так далее для hr_bot, finance_bot, marketing_bot, support_bot, pm_bot, analytics_bot,
#     content_bot, devops_bot, qa_bot, rnd_bot, n8n_bridge
```

**Запуск веб-дашборда:**
```
python -m uvicorn web_office.main:app --host 0.0.0.0 --port 8050
```

**Весь стек через Docker:**
```
docker compose up -d --build
```
Все контейнеры ботов собираются из одного корневого `Dockerfile` и различаются только `command:` (какой
модуль запускать).

## Архитектура

### Структура одного бота
Каждый бот в `bots/<name>_bot/` устроен одинаково:
```
bots/<name>_bot/
├── main.py          # entrypoint: собирает Bot/Dispatcher, подключает роутеры, event bus, scheduler, слушатель bot-bus
├── states.py        # FSM-состояния aiogram
├── handlers/        # Router'ы aiogram (список all_routers экспортируется из handlers/__init__.py)
└── keyboards/       # билдеры inline-клавиатур
```
Более лёгкие сервисные боты (`devops_bot`, `qa_bot`, `rnd_bot`, `n8n_bridge`) — это однофайловый `main.py`
вообще без Telegram `Dispatcher`: это чистые воркеры event-bus/bot-bus или простые aiohttp
webhook-приёмники.

### Общая библиотека (`shared/`)

| Модуль | Назначение |
|--------|-----------|
| `config.py` | Единственный `Settings` (pydantic-settings), грузится из `.env`; используйте модуль-синглтон `settings` |
| `database.py` | Async SQLAlchemy 2.0 (asyncpg). Бизнес-логика через `sqlalchemy.text()` + `get_session_ctx()` |
| `ai_engine.py` | `AIEngine` — обёртка над LLM API; хранит русско-узбекский системный промпт и таблицу стоимости токенов |
| `prompts.py` | Общий `TEAM_CONTEXT`, добавляется перед системным промптом каждого бота |
| `event_bus.py` | HTTP POST broadcast — шлёт на `/event` каждого бота (карта host:port жёстко прописана) + webhook n8n |
| `bot_bus.py` | Файловая JSON-очередь задач в `bus_tasks/` — целевой запрос/ответ между ботами |
| `order_utils.py` | Атомарная генерация order_number через `pg_advisory_xact_lock` |
| `roll_call.py` | Единый обработчик переклички для всех ботов |
| `group_orchestrator.py` | Router aiogram для ответов на @-упоминания в групповом чате |
| `scheduler.py` | `BotScheduler` — cron/interval-задачи для каждого бота |
| `brand.py` | Фирменный стиль: зелёный `#10B981` + золотой `#FFB800`, шрифты Inter/Outfit |
| `lead_gen.py` | Сбор B2B-лидов (рестораны) из 2ГИС с дедупликацией |
| `instagram*.py` | Публикация в Instagram Graph API (посты, Stories, Reels, DM, аналитика) |

### Модель межботового взаимодействия

Два независимых канала, обычно нужны оба:

1. **Event bus** — «что-то произошло, кому надо — отреагирует» (broadcast, fire-and-forget):
   - `ORDER_CREATED` от Sales → слушают Finance/PM/Analytics
   - `TASK_CREATED` / `TASK_COMPLETED` — координация задач

2. **Bot bus** — «сделай вот это конкретное и скажи результат» (целевой вызов, ждём результат):
   - Stepan делегирует `get_balance` в Finance через `send_task()`/`get_result()`

Боту, который должен участвовать в делегированных задачах, нужны оба: обработчик `event_bus.on(...)` на
`TASK_CREATED` *и* словарь обработчиков действий bot_bus в `start_listener()`.

**Маршрутизация задач по `department`.** Каждый бот в `handle_task_created` фильтрует по своему отделу.
Значения: sales/support/finance/hr/marketing/pm/analytics/content. Отделы **operations / production /
logistics** своего бота НЕ имеют — их принимает **PM** (COO).

### B2B лид-пайплайн (ежедневный цикл)

1. **03:00** `collect_leads_nightly` (marketing) → `shared.lead_gen` собирает рестораны из 2ГИС
2. **10:00** `b2b_outreach` (marketing) берёт 15 свежих лидов → email КП / задача Sales на обзвон
3. Ответы → Sales (квалификация → заказ), метрики → Analytics, стоимость → Finance

⚠️ Telegram-бот не может писать первым — холодный контакт только через email / телефон / IG DM.

### Порты (фиксированные, используются в event_bus и docker-compose)

```
stepan=8081  sales=8082  support=8083  hr=8084  finance=8085
marketing=8086  pm=8087  analytics=8088  content=8089
qa=8090  rnd=8091  devops=8092
```

### База данных

Единая база Postgres, основные таблицы: `customers`, `products`, `orders`, `order_items`, `interactions`,
`tasks`, `finances`, `employees`, `followups`, `inventory`. Все боты читают/пишут в одну БД.

## Handling Mistakes

- If inter-bot communication fails, check `docker-compose.yml` to ensure the target bot's Event Bus port matches the routing table in `event_bus.py` (8081-8092).
- If a bot process dies, verify that it is calling `await event_bus.start_listening(port)` at the end of `main.py` to keep the loop alive.
- If order numbers conflict, verify `shared/order_utils.py` is being used (not raw SELECT MAX).
- `.env` содержит секреты (токены ботов, API-ключи) — никогда не коммитьте и не выводите.
