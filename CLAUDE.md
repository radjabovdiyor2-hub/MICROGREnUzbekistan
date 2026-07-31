# CLAUDE.md

Guidance для Claude Code при работе в этом репозитории.

**Источник правил проекта — [.specify/memory/constitution.md](.specify/memory/constitution.md)** (конституция Spec Kit, v1.0.0). Этот файл — только вход: карта модулей, запреты и команды. При конфликте побеждает конституция.

## Модули

| Модуль | Стек | Роль |
|--------|------|------|
| `apps/web` | Next.js 16.2, React 19, TailwindCSS v4, Prisma | PWA: витрина, каталог, корзина, админка, журнал FRESH WEEKLY. 26 API-групп |
| `apps/bot` | Python, aiogram 3, Gemini | Telegram-бот витрины, ходит в `apps/web/api/*` по HTTP |
| `apps/tgas` | Python, aiogram 3, aiohttp, Redis | AI Office: 13 ботов + n8n_bridge, порты 8081–8093. Своя [CLAUDE.md](apps/tgas/CLAUDE.md) |
| `packages/database` | Prisma, PostgreSQL | `schema.prisma` — 55 моделей, единый источник DDL |

Turborepo монорепо, npm workspaces (`apps/*`, `packages/*`).

## Жёсткие запреты

- **Нет прямых импортов между модулями.** `apps/web` ↔ `apps/bot` ↔ `apps/tgas` общаются только через HTTP API или Event Bus. `apps/web` — единственный владелец каталога, `apps/tgas` — CRM/задач.
- **Нет ручного SQL DDL.** Только `npx prisma db push` / `npx prisma generate` из `packages/database`.
- **Нет захардкоженных цветов.** Только CSS-переменные (`--brand-primary`, `--bg-primary`, `--text-primary`). Цепочка: `design-system/tokens/tokens.json` → `npm run tokens:build` → `globals.css`.
- **Нет прямых AI-клиентов в Python.** Все вызовы — через `apps/tgas/shared/ai_engine.py`. Прямые OpenAI/Gemini клиенты запрещены.
- **Нет `any`, `@ts-ignore`, `eslint-disable`, пустого `catch`, `TODO` и заглушек.** Компоненты ≤200 строк.
- **Нет секретов в выводе.** `.env`, токены и ключи не печатать, не логировать, не коммитить.
- **Нет git side effects** без явного запроса в этом же ходе.

Перед созданием нового API-роута — прочитать `apps/web/src/app/api/` (26 групп). Дублирование роута — дефект.

## Команды

```bash
npm run dev                  # turbo dev, порт 3005
npm run build                # turbo build (включает typecheck Next.js)
npm run lint                 # turbo lint (ESLint 9)
npm run db:push              # prisma db push через turbo

cd apps/web && npm run test           # Vitest
cd apps/web && npm run tokens:build   # пересборка дизайн-токенов
```

`apps/tgas`: автотестов и линтера нет — проверка запуском бота против dev-`.env`, подробности в [apps/tgas/CLAUDE.md](apps/tgas/CLAUDE.md).

Верификация до заявления «готово»: `npm run lint` + `npm run build` для TS, `python -m py_compile` для Python.

## Языки

Код (переменные, функции, файлы) — English. UI-текст — русский + узбекский (латиница). SEO и публичный контент — узбекский (латиница). Докстринги, комментарии и логи в `apps/tgas` — русский.

## Ключевые файлы

Полная таблица — в [конституции](.specify/memory/constitution.md#L119-L130). Чаще всего нужны:

- `packages/database/prisma/schema.prisma` — вся схема БД
- `apps/web/src/app/globals.css` — Design System v1.0
- `apps/tgas/shared/bot_registry.py` — реестр 13 ботов (порты, отделы)
- `apps/tgas/shared/event_bus.py`, `shared/bot_bus.py` — межботовая связь

## Документация

[ARCHITECTURE.md](ARCHITECTURE.md) · [CODE_STYLE.md](CODE_STYLE.md) · [DATABASE.md](DATABASE.md) · [API.md](API.md) · [SECURITY.md](SECURITY.md) · [RUNBOOK.md](RUNBOOK.md) · [DEPLOY.md](DEPLOY.md) · [ROADMAP.md](ROADMAP.md)

## Spec Kit

Установлен Spec Kit 0.15.0. Для новой фичи: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Спеки пишутся в `specs/NNN-<name>/`, активная фича — в `.specify/feature.json`.
