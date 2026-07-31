# Implementation Plan: Единая память Стёпана поверх каналов

**Branch**: `001-stepan-shared-memory` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-stepan-shared-memory/spec.md`

## Summary

Разговор владельца с ассистентом сейчас живёт в двух местах и умирает вместе с ними: в админке — в состоянии React-компонента, в Telegram — в FSM-состоянии aiogram. Нужно одно хранилище, к которому оба канала обращаются как к общему источнику.

Подход: таблица разговора в схеме Prisma (единственный владелец DDL), запись и чтение из `apps/web` напрямую через Prisma, а из `apps/tgas` — по HTTP в `apps/web` с заголовком `x-bot-secret`. Оба механизма в проекте уже есть и работают: `isAuthorized` принимает `BOT_SECRET` для server-to-server, а Стёпан уже так вызывает журнальные кроны. Новых способов связи между модулями не появляется.

## Technical Context

**Language/Version**: TypeScript 5 (strict) в `apps/web`, Python 3.10+ в `apps/tgas`

**Primary Dependencies**: Next.js 16.2 App Router, Prisma ORM, aiogram 3, SQLAlchemy (только на стороне tgas и только для собственных доменов), aiohttp

**Storage**: PostgreSQL, единая база. Схема — `packages/database/prisma/schema.prisma`, 55 моделей

**Testing**: Vitest (unit) в `apps/web`; в `apps/tgas` автотестов нет — проверка запуском бота против dev-`.env` и `python -m py_compile`

**Target Platform**: Linux-контейнеры в `docker-compose.prod.yml`, общая сеть `mg_net`

**Project Type**: Монорепо Turborepo: веб-приложение + парк Python-ботов + общий пакет БД

**Performance Goals**: рост задержки ответа ассистента не более 10% (SC-003). Чтение хвоста истории — одним запросом по индексу

**Constraints**: прямые импорты между модулями запрещены; ручной SQL DDL запрещён; объём истории, передаваемой модели, ограничен по стоимости; при недоступности хранилища ассистент обязан сказать об этом вслух (FR-007)

**Scale/Scope**: один владелец, несколько администраторов; порядок сотен сообщений в месяц; два канала

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Требование | Как соблюдается |
|---|---|---|
| I. Границы модулей | Прямой импорт между модулями запрещён, связь только HTTP/Event Bus | Telegram-сторона ходит в `apps/web` по HTTP с `x-bot-secret`. Прямого SQL из `apps/tgas` в таблицу разговора нет |
| I. Владение DDL | Ручной SQL DDL запрещён, только `prisma db push` | Модель объявляется в `packages/database/prisma/schema.prisma`, миграция — `npm run db:push` |
| II. Strict TypeScript | Нет `any`, `@ts-ignore`, пустых `catch`, default-экспортов | Роуты и клиент пишутся строго типизированными; ошибки хранилища пробрасываются наружу, а не глотаются |
| II. Typed Python | Type hints на всех сигнатурах, async, логирование через `logging` | Клиент памяти в `apps/tgas/shared/` с аннотациями и `logger` |
| III. Design System | Захардкоженные цвета — дефект | Изменения в `AdminStepan.tsx` используют существующие CSS-переменные |
| V. Naming | Код английский, UI-текст русский и узбекский | Поля модели camelCase → snake_case через `@map()`, таблица через `@@map()` |
| VI. Качество | Read before write, без TODO и заглушек, компоненты ≤200 строк | `AdminStepan.tsx` сейчас 303 строки — при правке логика загрузки истории выносится в отдельный модуль, а не наращивает компонент |
| VII. API | Дублирование роута — дефект | Новый подпуть внутри существующей группы `/api/admin/stepan`, отдельной группы не заводим |

**Результат гейта: пройден.** Нарушений, требующих обоснования, нет — раздел Complexity Tracking не заполняется.

Отдельно зафиксировано: в репозитории есть прецеденты прямого SQL из `apps/tgas` в таблицы, объявленные Prisma (`tasks`, `storefront_outbox`). Они противоречат принципу I и учтены как существующий долг в `docs/AUDIT-2026-07.md`. Настоящая фича этот долг не наследует и не расширяет.

## Project Structure

### Documentation (this feature)

```text
specs/001-stepan-shared-memory/
├── plan.md              # Этот файл
├── research.md          # Phase 0: принятые решения
├── data-model.md        # Phase 1: сущности и поля
├── quickstart.md        # Phase 1: как проверить, что работает
├── contracts/           # Phase 1: контракты интерфейсов
│   └── memory-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — создаётся командой /speckit-tasks
```

### Source Code (repository root)

```text
packages/database/prisma/
└── schema.prisma                       # + модели разговора и сообщения

apps/web/src/
├── lib/stepan/
│   ├── memory.ts                       # НОВОЕ: чтение и запись истории через Prisma
│   └── brain.ts                        # правка: контекст берётся из памяти
├── app/api/admin/stepan/
│   ├── route.ts                        # правка: сохранение обмена, ошибка хранилища наружу
│   └── memory/route.ts                 # НОВОЕ: GET истории, POST сообщения (для tgas)
└── components/admin/
    ├── AdminStepan.tsx                 # правка: история грузится с сервера
    └── useStepanHistory.ts             # НОВОЕ: загрузка и состояние, чтобы компонент не рос

apps/tgas/
├── shared/
│   ├── assistant_memory.py             # НОВОЕ: HTTP-клиент памяти
│   └── config.py                       # правка: базовый URL витрины для server-to-server
└── bots/stepan_bot/handlers/
    └── assistant.py                    # правка: контекст из общей памяти вместо FSM
```

**Structure Decision**: Раскладка следует существующим границам монорепо. Владение памятью отдаётся `apps/web`, потому что там живёт Prisma — единственный законный владелец DDL. `apps/tgas` становится потребителем по HTTP. Логика доступа в каждом модуле собрана в один файл (`lib/stepan/memory.ts` и `shared/assistant_memory.py`), чтобы не расползлась по вызовам, как это случилось с четырьмя способами достучаться до ИИ-офиса из витрины.

## Complexity Tracking

> Не заполняется: Constitution Check пройден без нарушений.
