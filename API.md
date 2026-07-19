# API — Microgreen Uzbekistan

Base URL: `https://microgreenuzbekistan.com/api`

## API Route Groups (apps/web/src/app/api/)

### Products & Catalog

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (with filters, pagination) |
| GET | `/api/products/[id]` | Product detail |
| GET | `/api/categories` | Category tree |

### Orders & Cart

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Create order |
| GET | `/api/orders` | List user orders |
| POST | `/api/orders/[id]/status` | Update order status (admin) |

### Users & Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/telegram` | Telegram WebApp auth |
| GET | `/api/users/me` | Current user profile |
| POST | `/api/referral` | Apply referral code |

### AI & Content

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/chat` | AI nutritionist chat |
| GET | `/api/content` | Content feed |
| GET | `/api/instagram` | Instagram feed proxy |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Admin stats |
| POST | `/api/admin/products` | CRUD products |
| GET | `/api/inventory` | Stock movements |

### Integrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payment/[provider]` | Payment callbacks (Click, Payme) |
| POST | `/api/notify` | Push notifications |
| POST | `/api/sms` | SMS sending |
| GET | `/api/game/state` | Farm Simulator sync |
| POST | `/api/game/save` | Farm Simulator save |
| POST | `/api/leads` | Lead capture |
| POST | `/api/support` | Support ticket |

## AI Office API (apps/tgas/web_office)

Base URL: `http://localhost:8050` (internal only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ingest/order` | Receive order from storefront → Event Bus |
| GET | `/dashboard` | Web dashboard (FastAPI HTML) |

Auth: `X-Ingest-Secret` header for `/ingest/*` routes.

## Event Bus Events (apps/tgas)

| Event | Payload | Published by | Consumed by |
|-------|---------|-------------|-------------|
| `ORDER_CREATED` | `order_id, order_number, total` | web_office | stepan, sales, finance |
| `TASK_CREATED` | `task_id, department, description` | stepan | all bots |
| `TASK_COMPLETED` | `task_id` | any bot | stepan |
| `MAGAZINE_PUBLISHED` | `issue_id, title` | content_bot | sales, marketing |

## Rules

- All API routes return JSON
- Authentication via Telegram `initData` validation
- Error format: `{ error: string, code: number }`
- Pagination: `?page=1&limit=20`
- Never create new API groups without documenting here first
