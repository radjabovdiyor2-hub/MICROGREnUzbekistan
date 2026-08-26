# CLAUDE.md

Guidance для Claude Code при работе в этом репозитории.

**Источник правил проекта — [.specify/memory/constitution.md](.specify/memory/constitution.md)** (конституция Spec Kit, v1.0.0). Этот файл — только вход: карта модулей, запреты и команды. При конфликте побеждает конституция.

## Модули

| Модуль | Стек | Роль |
|--------|------|------|
| `apps/web` | Next.js 16.3, React 19, TailwindCSS v4, Prisma | PWA: витрина, каталог, корзина, админка, журнал FRESH WEEKLY. 30 API-групп, 120 роутов |
| `apps/bot` | Python, aiogram 3, OpenAI | Telegram-бот витрины: AI-продавец, ходит в `apps/web/api/*` по HTTP |
| `apps/tgas` | Python, aiogram 3, aiohttp, Redis | AI Office: 12 ботов + n8n_bridge, порты 8081–8093. Своя [CLAUDE.md](apps/tgas/CLAUDE.md) |
| `packages/database` | Prisma, PostgreSQL | `schema.prisma` — 79 моделей, единый источник DDL |

Turborepo монорепо, npm workspaces (`apps/*`, `packages/*`).

## Жёсткие запреты

- **Нет прямых импортов между модулями.** `apps/web` ↔ `apps/bot` ↔ `apps/tgas` общаются только через HTTP API или Event Bus. `apps/web` — единственный владелец каталога **и заказов**, `apps/tgas` — CRM/задач.
- **Заказ создаёт только витрина.** `POST /api/orders` — единственная дверь; из офиса она открывается через `apps/tgas/shared/storefront_orders.py`. Мимо неё заказ не появится ни на сайте, ни в остатках. Каталог офис читает через `apps/tgas/shared/catalog_repo.py`.
- **База одна, но таблицы двух семейств.** Витрина: `products`, `orders`, `order_items`, `users`. CRM офиса: `crm_products`, `crm_orders`, `crm_order_items`, `crm_employees`, `customers`, `tasks`, `finances`. Путать их — та самая ошибка, из-за которой продажа не регистрировалась.
- **Нет ручного SQL DDL.** Только `npx prisma db push` / `npx prisma generate` из `packages/database`.
- **Нет захардкоженных цветов.** Только CSS-переменные (`--brand-primary`, `--bg-primary`, `--text-primary`). Цепочка: `design-system/tokens/tokens.json` → `npm run tokens:build` → `globals.css`.
- **Нет прямых AI-клиентов в Python.** Движок один — `packages/mg_ai`; приложения ходят в него через свою обёртку: офис через `apps/tgas/shared/ai_engine.py`, витринный бот через `apps/bot/services/ai_service.py`. Обёртка подставляет ключи и учёт расхода, поэтому `AsyncOpenAI` напрямую создавать нельзя — расход уйдёт мимо `ai_usage`.
- **Поставщик AI один — OpenAI, запасного нет.** Схема «OpenAI primary + Gemini fallback» молчала: пустой или неверный `OPENAI_API_KEY` не выключал ИИ, а переводил весь офис на слабую модель одной строкой в логе. Отказ теперь виден — исключением, честной заглушкой и сигналом владельцу. Модель задаётся ОДНИМ значением `OPENAI_MODEL` (пусто = дефолт кода); меняете её — правьте `TOKEN_COSTS` в `packages/mg_ai` и `apps/web/src/lib/ai/usage.ts`, иначе расход считается по ставке наугад. Проверка: `cd apps/tgas && python scripts/check_ai.py`.
- **Нет `any`, `@ts-ignore`, `eslint-disable`, пустого `catch`, `TODO` и заглушек.** Компоненты ≤200 строк.
- **Нет секретов в выводе.** `.env`, токены и ключи не печатать, не логировать, не коммитить.
- **Нет git side effects** без явного запроса в этом же ходе.

Перед созданием нового API-роута — прочитать `apps/web/src/app/api/` (30 групп). Дублирование роута — дефект.

## Команды

```bash
npm run dev                  # turbo dev, порт 3005
npm run build                # turbo build (включает typecheck Next.js)
npm run lint                 # turbo lint (ESLint 9)
npm run db:push              # prisma db push через turbo

cd apps/web && npm run test           # Vitest
cd apps/web && npm run tokens:build   # пересборка дизайн-токенов
```

`apps/tgas`: автотестов и линтера нет, но есть пять статических сверок — прогонять все:

```bash
cd apps/tgas
python -m ruff check --select F .  # мёртвые и неопределённые имена
python -m pytest tests/ -q       # инструменты, исполнитель, цепь продажи, зеркало CRM
python scripts/check_schema.py   # сырой SQL против schema.prisma
python scripts/check_tools.py    # инструменты отделов и делегирование
python scripts/check_bot_roster.py
python scripts/check_prompts.py
python scripts/check_imports.py  # `from shared.X import Y` — Y существует
python scripts/check_types.py    # mypy по «дверям к данным», блокирующая
python scripts/check_soft_delete.py  # удалённый клиент не всплывает в офисе
```

Подробности — в [apps/tgas/CLAUDE.md](apps/tgas/CLAUDE.md).

Из корня репозитория:

```bash
python scripts/check_compose.py        # инварианты развёртывания
python scripts/check_env_declared.py   # переменная, которую код читает, объявлена
python scripts/check_docs_numbers.py   # числа в документах совпадают с кодом
```

Верификация до заявления «готово»: `npm run lint` + `npm run build` для TS, `python -m py_compile`
плюс тесты и сверки выше для Python.

## Языки

Код (переменные, функции, файлы) — English. UI-текст — русский + узбекский (латиница). SEO и публичный контент — узбекский (латиница). Докстринги, комментарии и логи в `apps/tgas` — русский.

## Ключевые файлы

Полная таблица — в [конституции](.specify/memory/constitution.md#L119-L130). Чаще всего нужны:

- `packages/database/prisma/schema.prisma` — вся схема БД
- `apps/web/src/app/globals.css` — Design System v1.0
- `apps/tgas/shared/bot_registry.py` — реестр 12 ботов + мост (порты, отделы)
- `apps/tgas/shared/event_bus.py`, `shared/bot_bus.py` — межботовая связь

## Документация

[ARCHITECTURE.md](ARCHITECTURE.md) · [CODE_STYLE.md](CODE_STYLE.md) · [DATABASE.md](DATABASE.md) · [API.md](API.md) · [SECURITY.md](SECURITY.md) · [RUNBOOK.md](RUNBOOK.md) · [DEPLOY.md](DEPLOY.md) · [ROADMAP.md](ROADMAP.md)

## Spec Kit

Установлен Spec Kit 0.15.0. Для новой фичи: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Спеки пишутся в `specs/NNN-<name>/`, активная фича — в `.specify/feature.json`.
