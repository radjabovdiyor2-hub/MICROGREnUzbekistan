# Architecture — Microgreen Uzbekistan

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        INTERNET                                  │
│                           │                                      │
│                      nginx (443)                                 │
│                      ┌────┴────┐                                 │
│               microgreenuzbekistan.com                           │
│                           │                                      │
├───────────────────────────┼──────────────────────────────────────┤
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐  │
│  │              apps/web — Next.js 16 PWA                     │  │
│  │              Port: 3000                                    │  │
│  │                                                            │  │
│  │  Routes:                                                   │  │
│  │  /              → Storefront (catalog, cart, checkout)      │  │
│  │  /catalog       → Product listing                          │  │
│  │  /product/[slug]→ Product detail                           │  │
│  │  /magazine      → FRESH WEEKLY: рубрики, материалы, номера │  │
│  │  /magazine/<рубрика>/<slug> → материал журнала              │  │
│  │  /recipe/[slug] → рецепт (печатный QR) + набор в корзину    │  │
│  │  /admin         → Admin dashboard                          │  │
│  │  /api/*         → 23 API route groups                      │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐  │
│  │              PostgreSQL                                    │  │
│  │              Port: 5432                                    │  │
│  │                                                            │  │
│  │  DB: microgreen_db (Prisma — storefront)                   │  │
│  │  DB: microgreen   (SQLAlchemy — AI office)                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  apps/bot    │  │  apps/game   │  │  apps/tgas           │   │
│  │  Telegram    │  │  Farm Sim    │  │  AI Office           │   │
│  │  Storefront  │  │  Vite+React  │  │  11 Python bots      │   │
│  │  Bot         │  │  TWA         │  │  Event Bus (HTTP)    │   │
│  │  (aiogram)   │  │              │  │  Ports 8081-8093     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
│  ┌──────────────┐                                               │
│  │  Redis       │  Cache + Pub/Sub                              │
│  │  Port: 6379  │                                               │
│  └──────────────┘                                               │
└──────────────────────────────────────────────────────────────────┘
```

## Module Boundaries

| Module | Technology | Responsibility | Talks to |
|--------|-----------|---------------|----------|
| `apps/web` | Next.js, React, TypeScript | Storefront, Admin, Magazine, API | PostgreSQL (Prisma) |
| `apps/bot` | Python, aiogram | Telegram orders, AI agronomist | `apps/web/api/*` |
| `apps/game` | Vite, React, TypeScript | Farm Simulator (Telegram Mini App) | `apps/web/api/game` |
| `apps/tgas` | Python, aiogram, FastAPI | 12 AI employees + n8n_bridge | PostgreSQL (SQLAlchemy), Event Bus |
| `packages/database` | Prisma | Schema, migrations, seed | PostgreSQL |

## Communication Patterns

1. **Web ↔ Database**: Prisma Client (direct)
2. **Bot → Web**: HTTP API calls to `/api/*`
3. **Game → Web**: HTTP API calls to `/api/game`
4. **AI Bots ↔ AI Bots**: Event Bus (HTTP POST to container ports 8081-8093)
5. **AI Bots → Telegram**: aiogram Bot API
6. **Web → AI Bots**: FastAPI endpoint on port 8050 (`/ingest/order`)

## Rules

- Never import across module boundaries directly
- `apps/web` is the single source of truth for product data
- `apps/tgas` is the single source of truth for CRM/tasks
- All inter-service communication goes through HTTP APIs or Event Bus
- Database schema changes go through Prisma only

---

# Diagrams

> Диаграммы для технического Due Diligence (§3, «Infratuzilma va arxitektura
> diagrammalari»). Mermaid рендерится прямо в GitHub — отдельный инструмент
> для просмотра не нужен.

## 1. Инфраструктура и сетевые границы

Ключевое свойство: наружу открыт только nginx. Всё остальное слушает либо
внутреннюю docker-сеть `mg_net`, либо `127.0.0.1` — то есть недоступно из
интернета напрямую.

```mermaid
graph TB
    subgraph internet["Интернет"]
        user["Покупатель<br/>браузер / PWA"]
        tg["Telegram<br/>Bot API"]
        pay["Click.uz / Payme<br/>webhooks"]
    end

    subgraph vps["VPS — Docker Compose"]
        nginx["nginx :80/:443<br/>TLS, Let's Encrypt<br/>rate limit 10 r/s"]

        subgraph mgnet["docker network: mg_net"]
            web["apps/web<br/>Next.js 16<br/>:3000 → 127.0.0.1:3002"]
            office["web_office<br/>FastAPI<br/>127.0.0.1:8050"]
            bots["12 AI-ботов<br/>Event Bus :8081-8093<br/>наружу не публикуются"]
            store["apps/bot<br/>storefront bot"]
            pg[("PostgreSQL 16<br/>+ pgvector<br/>127.0.0.1:5432")]
            redis[("Redis 7<br/>127.0.0.1:6379")]
        end

        subgraph mon["Мониторинг (127.0.0.1)"]
            prom["Prometheus :9090"]
            graf["Grafana :3001"]
        end
    end

    user --> nginx
    pay --> nginx
    nginx --> web
    tg <--> store
    tg <--> bots

    web --> pg
    web --> redis
    web -->|"/ingest/*<br/>X-Ingest-Secret"| office
    store -->|"Bearer BOT_SECRET"| web
    bots --> pg
    office --> pg
    bots <-->|"X-Bot-Secret"| bots

    prom -->|"/api/metrics<br/>Bearer METRICS_TOKEN"| web
    prom --> graf

    classDef exposed fill:#dc2626,stroke:#7f1d1d,color:#fff
    classDef internal fill:#10b981,stroke:#065f46,color:#fff
    class nginx exposed
    class web,office,bots,store,pg,redis,prom,graf internal
```

## 2. Модель доступа

Роль проверяется в `middleware.ts` **до** попадания в обработчик, поэтому
новый маршрут под защищённым префиксом закрыт по умолчанию, а не когда про
него вспомнят.

```mermaid
flowchart TD
    req["Запрос к /api/*"] --> mw{"middleware.ts"}

    mw -->|"путь без правила"| public["Публично<br/>каталог, отзывы, заказ"]
    mw -->|"есть BOT_SECRET"| service["Сервис-к-сервису<br/>боты, cron"]
    mw -->|"защищённый префикс"| cookie{"cookie mg_session<br/>подпись HS256"}

    cookie -->|"нет / истекла"| deny401["401 Unauthorized"]
    cookie -->|"роль SELLER"| seller{"правило требует<br/>ADMIN?"}
    cookie -->|"роль ADMIN"| admin["Полный доступ<br/>/api/admin/*, склад,<br/>товары, загрузки"]

    seller -->|"да"| deny403["403 Forbidden"]
    seller -->|"нет"| pos["Касса, движения склада"]

    login["Вход"] --> pw["Пароль владельца<br/>scrypt + соль<br/>10 попыток / 15 мин"]
    login --> pin["PIN продавца<br/>5 попыток / 15 мин"]
    pw --> issue["Выдать mg_session<br/>httpOnly, 12 ч"]
    pin --> issue

    classDef bad fill:#dc2626,stroke:#7f1d1d,color:#fff
    class deny401,deny403 bad
```

## 3. Оформление и оплата заказа

Переход `PENDING → PAID` — атомарный условный `updateMany`, поэтому
повторная доставка webhook'а не приводит к двойному начислению.

```mermaid
sequenceDiagram
    autonumber
    participant C as Покупатель
    participant W as apps/web
    participant DB as PostgreSQL
    participant P as Click / Payme
    participant O as AI-офис (CRM)
    participant B as Telegram-бот

    C->>W: POST /api/orders
    W->>DB: транзакция: заказ + резерв остатков
    DB-->>W: order_id, PENDING
    W-->>C: ссылка на оплату

    C->>P: оплата
    P->>W: webhook (подпись MD5 / Basic)

    alt подпись неверна или сумма не сходится
        W-->>P: ошибка, money-state не тронут
    else подпись верна
        W->>DB: updateMany PENDING→PAID (идемпотентно)
        alt переход произошёл впервые
            W->>O: /ingest/order (X-Ingest-Secret)
            W->>B: уведомить покупателя
            W->>DB: записать доход
        else повторная доставка
            W-->>P: OK, побочные эффекты пропущены
        end
    end
```

## 4. Взаимодействие AI-сотрудников

Два независимых канала — их легко перепутать, поэтому вынесены отдельно.

```mermaid
graph LR
    subgraph eb["Event Bus — широковещание, ответа не ждём"]
        direction TB
        e1["ORDER_CREATED"] --> fin["Finance"]
        e1 --> pm["PM"]
        e1 --> an["Analytics"]
    end

    subgraph bb["Bot Bus — целевая задача, ждём результат"]
        direction TB
        st["Stepan"] -->|"get_balance"| fin2["Finance"]
        fin2 -->|"результат JSON"| st
    end

    note["Файловая очередь bus_tasks/<br/>общий docker volume"]
    bb -.-> note
```

## 5. Данные

```mermaid
erDiagram
    User ||--o{ Order : "оформляет"
    User ||--o{ Review : "пишет"
    User ||--o{ Address : "имеет"
    Order ||--|{ OrderItem : "содержит"
    Product ||--o{ OrderItem : "входит в"
    Product ||--o{ Review : "получает"
    Product }o--|| Category : "относится к"
    Product ||--o{ StockMovement : "движется"
    Employee ||--o{ StockMovement : "проводит"
    Supplier ||--o{ Debt : "связан с"

    User {
        string id PK
        bigint telegramId UK "обнуляется при удалении данных"
        string phone UK
        Role role "USER|ADMIN|MODERATOR|SELLER"
        int bonusPoints
    }
    Order {
        string id PK
        string status "PENDING|PAID|..."
        int total
    }
    Employee {
        string id PK
        string pin UK "4 цифры, вход в кассу"
        boolean isActive
    }
```

## 6. Внутренняя архитектура Telegram-бота (apps/bot)

Telegram-бот построен по принципу строгой модульности (лимит 200 строк на файл).

```mermaid
graph TD
    subgraph apps_bot["apps/bot (Telegram Storefront)"]
        main["main.py<br/>Точка входа"]
        
        subgraph handlers["Handlers"]
            admin["admin/<br/>Управление, рассылки"]
            agronomist["agronomist/<br/>AI-ассистент, диагностика"]
            shop["shop/<br/>Каталог, корзина, оформление"]
            unified["unified/<br/>Меню, профиль, бонусы"]
        end
        
        subgraph services["Services"]
            ai["ai_service/<br/>Интеграция с AIEngine (LLM)"]
            eco["ecosystem/<br/>Мост к apps/web/api (Mixins)"]
            crosspost["crosspost/<br/>Публикация (TG, Inst)"]
            core_srv["cart_storage.py<br/>trigger_service.py"]
        end
        
        main --> handlers
        handlers --> services
        services --> eco
    end
    
    eco -.->|"HTTP /api/*"| apps_web["apps/web"]
    ai -.->|"AIEngine"| tgas["apps/tgas/shared/ai_engine"]
```
