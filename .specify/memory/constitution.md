# Microgreen Uzbekistan Constitution

## Core Principles

### I. Монорепозиторий с жёсткими границами модулей

Проект — Turborepo монорепо. Три приложения, одна shared-библиотека пакетов:

| Модуль | Стек | Роль | Размер |
|--------|------|------|--------|
| `apps/web` | Next.js 16.3, React 19, TailwindCSS v4, Prisma | PWA: витрина, каталог, корзина, админка, журнал FRESH WEEKLY, 29 API-групп, 119 route-файлов, 275 компонентов | ~66KB globals.css, 79 Prisma-моделей |
| `apps/bot` | Python, aiogram 3, Gemini | Telegram-бот витрины: заказы, AI-агроном | HTTP → `apps/web/api/*` |
| `apps/tgas` | Python, aiogram 3, aiohttp, Redis | AI Office: 12 автономных ботов + n8n_bridge. Event Bus (Redis Pub/Sub + HTTP fallback), порты 8081-8093 | 64 shared-модулей, ~400KB main.py суммарно |
| `packages/database` | Prisma ORM, PostgreSQL | Схема (79 моделей, 2381 строки), миграции, сиды | schema.prisma — единый источник DDL |

**Запреты:**
- Прямой импорт между модулями запрещён. Всё через HTTP API или Event Bus.
- `apps/web` — единственный владелец каталога. `apps/tgas` — единственный владелец CRM/задач.
- Ручной DDL (SQL) запрещён. Только `npx prisma db push` / `npx prisma generate`.

### II. Strict TypeScript + Typed Python

**TypeScript (apps/web):**
- strict mode. Нет `any`, `@ts-ignore`, `eslint-disable`, пустого `catch`.
- Нет default-экспортов кроме Next.js page/layout.
- Нет barrel-файлов (`index.ts` re-exports).
- `const` arrow для компонентов. Деструктуризация props в сигнатуре.
- `'use client'` — только для интерактивных компонентов.
- Проверка: `npm run lint` (ESLint 9) + `npm run build` (Next.js typecheck).
- Тесты: Vitest (unit) + Playwright (e2e).

**Python (apps/tgas, apps/bot):**
- Type hints на всех сигнатурах. async/await везде.
- `sqlalchemy.text()` для SQL. ORM-модели (Base) запрещены.
- AI-вызовы — только через `shared/ai_engine.py` (AIEngine). Прямые OpenAI/Gemini клиенты запрещены.
- f-strings для форматирования. Логирование через `logging`, не `print`.

### III. Design System — единый источник истины

Цепочка: `design-system/tokens/tokens.json` → `npm run tokens:build` → `build/tokens.css` + `build/theme.css` → `globals.css` (@import).

- W3C DTCG формат. Совместим с Figma (Tokens Studio).
- Шрифты: Inter (body), Outfit/SF Pro Display (display), Playfair Display (editorial).
- Cascade layers: `@layer theme, base, components, utilities`. Tailwind v4 utilities в слое `utilities`.
- Захардкоженные цвета — дефект. Только CSS-переменные: `--brand-primary`, `--bg-primary`, `--text-primary`.
  Переменная обязана существовать в `design-system/build/tokens.css`: `var(--border-primary)`
  не объявлена нигде, и три рамки в админке брали цвет текста вместо `var(--border)`.
  Два исключения: `theme-color` в `app/layout.tsx` (спецификация требует литеральный
  hex — переменную браузер не прочитает) и файлы `*.stories.tsx` шаблонов, которые
  намеренно воспроизводят чужой визуальный язык и к нашим токенам не относятся.
- Mobile-first. `clamp()` для адаптивной типографики.
- Тёмная тема: `[data-theme="dark"]`.
- Анимации — CSS transitions. JS-анимации (Framer Motion) — только для complex choreography.
- `prefers-reduced-motion` — соблюдать. Анимация ≤ 0.01ms при активации.

### IV. Event-Driven Architecture (AI Office)

12 ботов + 1 мост. Единый реестр: `shared/bot_registry.py` (BotInfo dataclass).
Здесь значилось «13 ботов», при том что таблица ниже перечисляет двенадцать:
документ противоречил сам себе. Каталогов в `apps/tgas/bots/` — двенадцать
плюс `n8n_bridge`, который ботом не является. `check_bot_roster.py` этого не
ловил: он сверяет шесть источников с `ALL_BOTS`, то есть внутреннюю
согласованность, а не заявленное в документах число.

**Порты (фиксированы):**

| Бот | Порт | Telegram | Отдел |
|-----|------|----------|-------|
| stepan_bot | 8081 | ✅ | pm |
| sales_bot | 8082 | ✅ | sales |
| support_bot | 8083 | ✅ | support |
| hr_bot | 8084 | ✅ | hr |
| finance_bot | 8085 | ✅ | finance |
| marketing_bot | 8086 | ✅ | marketing |
| (8087 — резерв pm_bot) | — | — | — |
| analytics_bot | 8088 | ✅ | analytics |
| content_bot | 8089 | ✅ | content |
| qa_bot | 8090 | ❌ | qa |
| rnd_bot | 8091 | ❌ | rnd |
| devops_bot | 8092 | ❌ | devops |
| franchise_bot | 8093 | ❌ | — |
| n8n_bridge | — | ❌ | — |

**Коммуникация:**
- **Event Bus** (Redis Pub/Sub primary, HTTP broadcast fallback): `event_bus.connect()` → `event_bus.on("EVENT", handler)` → `event_bus.start_listening(port, app)`.
- **Bot Bus** (файловая очередь): адресные задачи от Степана. `shared/bot_bus.py` → `start_listener(bot_name, handlers_dict)`.
- Прямые вызовы бот→бот запрещены. Только через Event Bus / Bot Bus.
- Каждый бот: `start_heartbeat(name)`, `scheduler.start()`, bot_bus listener.

### V. Naming & Languages

| Контекст | Язык | Пример |
|----------|------|--------|
| Код (переменные, функции, файлы) | English | `handleOrder`, `formatPrice.ts` |
| UI текст (сайт, бот, Telegram) | Русский + Узбекский (латиница) | «Добавить в корзину» / «Savatga qo'shish» |
| SEO keywords, публичный контент | Узбекский (латиница) | «Mikroyashillik Samarqand» |
| Docstrings, комментарии, логи (apps/tgas) | Русский | `"""Обработка заказа от клиента"""` |
| Компоненты React | PascalCase файл + PascalCase экспорт | `ProductCard.tsx` → `export function ProductCard` |
| CSS-переменные | kebab-case | `--brand-primary` |
| Prisma поля | camelCase → snake_case via `@map()` | `createdAt` → `created_at` |
| DB таблицы | snake_case via `@@map()` | `model Order` → `@@map("orders")` |

### VI. Качество и процесс

1. **Read before write.** Не редактировать файл, не прочитав его в текущей сессии.
2. **No unrequested scope.** Фиксить только то, что просили. Рефакторинг — отдельная задача.
3. **No TODO, no stubs.** Код поставляется готовым или не поставляется.
4. **Компоненты ≤200 строк.** Одна функция — одна ответственность. Одна задача — один файл.
5. **Reuse > Duplicate.** Перед созданием: grep по проекту, есть ли аналог.
6. **Verify.** `npm run lint`, `npm run build`, `python -c "import ast; ast.parse(...)"` — до заявления «готово».
7. **Three strikes.** Ошибка пережила 3 попытки → СТОП, доклад.
8. **No git side effects.** Commit/push — только по явному запросу.
9. **No secrets.** Никогда не печатать/логировать/коммитить `.env`, токены, ключи.

### VII. API — 29 групп, 119 роутов

Перед созданием нового API-роута — обязательно прочитать `apps/web/src/app/api/`. Существующие группы: admin, ai, auth, categories, config, content, events, health, instagram, inventory, leads, magazine, marketing, menu, metrics, notify, orders, payment, products, promo, push, referral, reviews, subscriptions, support, telegram, upload, users, whatsapp.

Здесь значилась ещё и `sms` — группы с таким именем нет и не было, а витринный
бот слал в неё `POST /api/sms` и получал 404. Список сверять с каталогом, а не
дописывать по памяти.

Дублирование API-роута — дефект.

## Deployment

- **Production:** `docker-compose.prod.yml` — 12 ботов + n8n_bridge + web_office + web + bot + nginx + postgres + redis.
- **Сеть:** `mg_net` (Docker bridge). Наружу только nginx (443).
- **Web:** `127.0.0.1:3002:3000`, nginx проксирует с `microgreenuzbekistan.com`.
- **Deploy:** `./deploy.sh` (все) или `./deploy.sh web` / `./deploy.sh sales content stepan` (выборочно).
- **Мониторинг:** `docker-compose.monitoring.yml` (опционально).

## Key Files (прочитать перед работой)

| Файл | Что содержит |
|------|-------------|
| `packages/database/prisma/schema.prisma` | 79 моделей, 2381 строки — полная схема БД |
| `apps/web/src/app/globals.css` | Design System v1.0 (2696 строк) |
| `apps/web/design-system/tokens/tokens.json` | Дизайн-токены W3C DTCG |
| `apps/tgas/shared/bot_registry.py` | Реестр всех 12 ботов и моста (порты, имена, отделы) |
| `apps/tgas/shared/config.py` | Pydantic Settings — все env-переменные |
| `apps/tgas/shared/event_bus.py` | Event Bus (Redis Pub/Sub + HTTP fallback) |
| `apps/tgas/shared/ai_engine.py` | AIEngine wrapper (35KB — единственный AI-клиент) |
| `apps/tgas/shared/bot_bus.py` | Bot Bus — адресная файловая очередь |

## Governance

Конституция главнее всех остальных практик. При конфликте между конституцией и скоростью — конституция побеждает. Изменения требуют обоснования и обновления версии.

**Version**: 1.0.0 | **Ratified**: 2026-07-31 | **Last Amended**: 2026-07-31
