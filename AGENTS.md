# AGENTS.md — Microgreen Uzbekistan

Кросс-инструментальные правила проекта. Читается Antigravity, Cursor и другими агентами автоматически.
Дисциплина работы — в `.agents/rules/00-protocol.md`. Полный свод правил — `.specify/memory/constitution.md` (при конфликте побеждает конституция).

## Маршруты (главное — не выводи их сам, они уже описаны)

Проект состоит из трёх модулей на двух языках, между ними только HTTP. Ниже сквозные цепочки: если задача касается одной из них, идти по указанным файлам, а не искать заново.

**1. Пульт ИИ в админке** (кнопки «запустить бекап», «снять KPI»)

```
apps/web/src/components/admin/AdminBotControl.tsx   массив BOT_ACTIONS, fetch на строке 88
  → POST /api/admin/bot-action
apps/web/src/app/api/admin/bot-action/route.ts      прокси, таймаут 100 с, заголовок X-Ingest-Secret
  → TGAS_OFFICE_URL (по умолчанию http://localhost:8050)
apps/tgas/web_office/main.py:1456                   @app.post("/api/admin/bot-action")
  → белый список ADMIN_BOT_ACTIONS (main.py:1438) выбирает бота-исполнителя
  → shared/bot_bus.send_task() → ожидание get_result(timeout=90)
apps/tgas/bots/<bot>/main.py                        обработчик действия
```

Контракт: запрос `{action, bot, params}` → ответ `{status: "ok" | "pending" | "error", ...}`. `pending` — не ошибка: задача осталась в очереди (бекап и синк каталога идут дольше таймаута). Поле `bot` из UI — только подсказка, исполнителя выбирает белый список на стороне офиса. Добавил кнопку в UI — обязан добавить действие в `ADMIN_BOT_ACTIONS`, иначе придёт 400.

**2. Перекличка ботов (ROLL_CALL)**

`Event Bus` рассылает `ROLL_CALL` → каждый бот отвечает через общий `apps/tgas/shared/roll_call.py` → `handle_roll_call(bot_name, payload)` шлёт «🟢 <Отдел> на связи!» в `payload.data.chat_id`. Обработчик один на всех — не копировать его в бота.

**3. Заказ с витрины**

`apps/web/src/app/api/orders/route.ts` → Prisma (`packages/database/prisma/schema.prisma`) → уведомление в Telegram. Статусы — `api/orders/status`, карточка заказа — `api/admin/orders/[id]` (под `requireBotAuth`/админом). Публичного `api/orders/[id]` нет: он отдавал адрес и телефон любому, у кого есть id заказа, и вызывающих у него не было.

**4. Событие между ботами**

`shared/event_bus.py`: `event_bus.connect()` → `event_bus.on("EVENT", handler)` → `event_bus.start_listening(port, app)`. Redis Pub/Sub основной, HTTP broadcast — фоллбэк. Адресные задачи — через `shared/bot_bus.py` (файловая очередь): `send_task` → `get_pending_tasks` → `claim_task` → `complete_task`.

## Модули

| Модуль | Стек | Роль |
|--------|------|------|
| `apps/web` | Next.js 16.2, React 19, TailwindCSS v4, Prisma | PWA: витрина, каталог, корзина, админка, журнал FRESH WEEKLY. 26 API-групп |
| `apps/bot` | Python, aiogram 3, Gemini | Telegram-бот витрины, ходит в `apps/web/api/*` по HTTP |
| `apps/tgas` | Python, aiogram 3, aiohttp, Redis | AI Office: 13 ботов + n8n_bridge, порты 8081–8093, веб-дашборд на 8050 |
| `packages/database` | Prisma, PostgreSQL | `schema.prisma` — 55 моделей, единый источник DDL |

Turborepo монорепо, npm workspaces (`apps/*`, `packages/*`).

**Порты ботов:** stepan 8081, sales 8082, support 8083, hr 8084, finance 8085, marketing 8086, (8087 резерв), analytics 8088, content 8089, qa 8090, rnd 8091, devops 8092, franchise 8093. Реестр — `apps/tgas/shared/bot_registry.py`.

## Жёсткие запреты

- **Нет прямых импортов между модулями.** `apps/web` ↔ `apps/bot` ↔ `apps/tgas` общаются только через HTTP API или Event Bus. `apps/web` — единственный владелец каталога, `apps/tgas` — CRM и задач.
- **Нет ручного SQL DDL.** Только `npx prisma db push` / `npx prisma generate` из `packages/database`.
- **Нет захардкоженных цветов.** Только CSS-переменные (`--brand-primary`, `--bg-primary`, `--text-primary`).
- **Нет прямых AI-клиентов в Python.** Все вызовы — через `apps/tgas/shared/ai_engine.py`.
- **Нет прямых вызовов бот→бот.** Только Event Bus или Bot Bus.
- **Нет `any`, `@ts-ignore`, `eslint-disable`, пустого `catch`, `TODO` и заглушек.** Компоненты ≤ 200 строк.
- **Нет секретов в выводе.** `.env`, токены и ключи не печатать, не логировать, не коммитить.
- **Нет git side effects** без явного запроса в этом же ходе: ни commit, ни push, ни reset --hard.

Перед созданием нового API-роута — прочитать `apps/web/src/app/api/` (26 групп: admin, ai, auth, categories, config, content, ecosystem, health, instagram, inventory, leads, magazine, menu, metrics, notify, orders, payment, products, promo, referral, reviews, sms, support, telegram, upload, users). Дублирование роута — дефект.

## Команды

```bash
npm run dev                  # turbo dev, порт 3005
npm run build                # turbo build (включает typecheck Next.js)
npm run lint                 # turbo lint (ESLint 9)
npm run db:push              # prisma db push через turbo

cd apps/web && npm run test           # Vitest
cd apps/web && npm run tokens:build   # пересборка дизайн-токенов
```

`apps/tgas`: автотестов и линтера нет — проверка запуском бота против dev-`.env`. Подробности — `apps/tgas/CLAUDE.md`.

Верификация до заявления «готово»: `npm run lint` + `npm run build` для TypeScript, `python -m py_compile <файлы>` для Python. Прочитать свой диff — это не верификация.

## Языки

Код (переменные, функции, файлы) — English. UI-текст — русский + узбекский (латиница). SEO и публичный контент — узбекский (латиница). Докстринги, комментарии и логи в `apps/tgas` — русский.

## Ключевые файлы

| Файл | Что содержит |
|------|-------------|
| `packages/database/prisma/schema.prisma` | 55 моделей, вся схема БД |
| `apps/web/src/app/globals.css` | Design System v1.0 |
| `apps/web/design-system/tokens/tokens.json` | Дизайн-токены W3C DTCG |
| `apps/tgas/shared/bot_registry.py` | Реестр 13 ботов: порты, имена, отделы |
| `apps/tgas/shared/config.py` | Pydantic Settings — все env-переменные |
| `apps/tgas/shared/event_bus.py` | Event Bus (Redis Pub/Sub + HTTP фоллбэк) |
| `apps/tgas/shared/ai_engine.py` | AIEngine — единственный AI-клиент |
| `apps/tgas/shared/bot_bus.py` | Bot Bus — адресная файловая очередь |

## Документация

`ARCHITECTURE.md` · `CODE_STYLE.md` · `DATABASE.md` · `API.md` · `SECURITY.md` · `RUNBOOK.md` · `DEPLOY.md` · `ROADMAP.md`

## Spec Kit

Установлен Spec Kit 0.15.0, команды `/speckit-*` доступны как скиллы.

Порядок для новой фичи: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Спеки пишутся в `specs/NNN-<name>/`, активная фича — в `.specify/feature.json`.

Кросс-модульные задачи (затрагивающие и `apps/web`, и `apps/tgas`) декомпозировать через `/speckit-plan` и `/speckit-tasks` **до** написания кода. Реализация по готовому `tasks.md` — отдельный шаг, задачи в нём должны быть атомарными: один файл, одна проверяемая правка.
