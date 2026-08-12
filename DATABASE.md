# Database — Microgreen Uzbekistan

## Engine

PostgreSQL 15+ via Docker. **Одна база — `microgreen`**, и в ней два семейства
таблиц.

Этот документ описывал две базы (`microgreen_db` для витрины и `microgreen`
для офиса) и называл `products` «зеркалом офиса». Обе вещи неверны с момента
`unify_databases.sql` — и вторая обходилась дорого: `SELECT ... unit FROM
products` с офисными колонками проходил проверку по документации и падал в
живой базе, потому что `products` принадлежит витрине. Регистрация продажи
молча отвечала «не смог записать продажу в БД», прайс-лист приходил пустым, а
модель дописывала цены сама (см. `apps/tgas/shared/catalog_repo.py`).

| Семейство | Владелец | Таблицы | Ключи |
|---|---|---|---|
| Витрина | `apps/web` (Prisma) | `products`, `categories`, `orders`, `order_items`, `users`, `employees` | cuid-строки |
| CRM офиса | `apps/tgas` (raw SQL) | `crm_products`, `crm_orders`, `crm_order_items`, `crm_employees`, `customers`, `interactions`, `tasks`, `finances`, `followups`, `inventory`, `ai_usage` | `serial` |

**Схемой владеет Prisma** — `packages/database/prisma/schema.prisma`, 71 модель.
`apps/tgas/database/init.sql` — исторический файл: он описывает состояние ДО
переименования и в прод не монтируется.

Часовой пояс базы — `Asia/Samarkand`, задан аргументом запуска в compose (на
уже созданном томе переменные окружения `timezone` не перебивают).

## Prisma Schema

### Core Models

| Model | Purpose | Key fields |
|-------|---------|------------|
| `Category` | Product categories (tree) | `nameUz`, `nameRu`, `slug`, `parentId` |
| `Product` | Catalog items | `price`, `costPrice`, `stock`, `sku`, `images[]`, `rating` |
| `User` | Customers | `telegramId`, `phone`, `bonusPoints`, `referralCode` |
| `Order` | Purchase orders | `orderNumber`, `status`, `total`, `bonusUsed`, `promoCode`, `source`, `paymentMethod` |
| `OrderItem` | Line items | `quantity`, `price` (снимок цены НА МОМЕНТ заказа — её ставит сервер по каталогу, не клиент) |

`Product.costPrice` — закупочная цена. Наружу она не уходит: `/api/products`
отдаёт белый список полей (`apps/web/src/lib/products/fields.ts`), и
`costPrice` есть только в ответе сотруднику.

### Business Models

| Model | Purpose |
|-------|---------|
| `CartItem` | Shopping cart (per user) |
| `Favorite` | Wishlist |
| `Review` | Product reviews (1-5 stars), ключ `userId_productId` |
| `PromoCode` | Discount codes (percent / fixed) |
| `Address` | Delivery addresses |
| `AiChat` | AI nutritionist conversation history |
| `GreenBoxSubscription` | Подписка «Зелёная Коробка». **Исполнения нет**: крона, который выбирает `status=ACTIVE AND nextDelivery <= today` и создаёт заказ, не существует ни в одном модуле. Виджет из корзины убран; путь `/api/subscriptions` в кабинете остался как CRUD. |

### Operations Models

| Model | Purpose |
|-------|---------|
| `Employee` | Staff with PIN login |
| `StockMovement` | Inventory tracking (IN/OUT/ADJUSTMENT/RETURN/WRITE_OFF) |
| `Supplier` | Vendor management |
| `Debt` | Accounts payable/receivable |
| `Promotion` | Time-limited promotions with images |

Отмена заказа возвращает остаток компенсирующим движением `IN`, снятие отмены
забирает его обратно движением `OUT` (`apps/web/src/lib/orders/cancel.ts`).
Идемпотентность считается парами, а не наличием одного маркера.

### Magazine Models

| Model | Purpose |
|-------|---------|
| `MagazineEdition` | Общий выпуск журнала (50% контента) |
| `RestaurantIssue` | Персональный выпуск ресторана (вторые 50%) |
| `Restaurant` | Рестораны-партнёры: slug, бренд-цвета, промокод, меню |
| `PrintSubscription`, `PrintOrder` | Печатные подписки и заказы |

## Migration Rules

1. Схема меняется ТОЛЬКО через `schema.prisma` → `npm run db:push`.
   Ручной DDL запрещён конституцией: он создаёт дрейф, который следующий
   `db push` снесёт. (Здесь было написано «No migration tool — apply changes
   manually» — это прямо противоречило правилу.)
2. **Always** run `npx prisma generate` after schema changes
3. Seed data: `npm run db:seed`
4. Field naming: `camelCase` in TypeScript, `snake_case` in DB via `@map()`
5. **Always** add `@@map("table_name")` to models
6. **Always** add `createdAt` and `updatedAt` to new models
7. Use `@default(cuid())` for IDs (not UUID)
8. Новую таблицу создаёт Prisma. `CREATE TABLE IF NOT EXISTS` в рантайме —
   крайняя мера (так живут `meeting_state`, `ig_comment_seen`,
   `franchise_journals`).

## Правила для офиса (`apps/tgas`)

- Каталог читать **только** через `shared/catalog_repo.py` — там витринные
  колонки. Своего SQL к товарам не писать.
- Заказ создавать **только** через `shared/storefront_orders.py`
  (`POST /api/orders`). Заказами владеет витрина: она выдаёт номер, списывает
  остаток, уведомляет клиента и зеркалит заказ в `crm_orders` через
  `/ingest/order`, откуда уходит `ORDER_CREATED`.
- Отчёты офиса считать по `crm_orders`/`crm_order_items`: через зеркало
  проходит каждый заказ — и с сайта, и зарегистрированный менеджером.
- Проверять колонки скриптом, а не догадками: `python scripts/check_schema.py`
  сверяет весь сырой SQL со `schema.prisma`.
- В `finances` есть `date` (деловая дата, можно задним числом) и `created_at`
  (момент записи). **Отчёты считать по `date`.**
