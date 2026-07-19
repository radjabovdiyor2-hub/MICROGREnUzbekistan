# Database — Microgreen Uzbekistan

## Engine

PostgreSQL 15+ via Docker. Two databases on one instance:

| Database | Used by | ORM | Schema source |
|----------|---------|-----|---------------|
| `microgreen_db` | `apps/web`, `apps/bot`, `apps/game` | Prisma | `packages/database/prisma/schema.prisma` |
| `microgreen` | `apps/tgas` (AI Office) | SQLAlchemy (raw) | `apps/tgas/database/init.sql` |

## Prisma Schema (microgreen_db)

### Core Models

| Model | Purpose | Key fields |
|-------|---------|------------|
| `Category` | Product categories (tree) | `nameUz`, `nameRu`, `slug`, `parentId` |
| `Product` | Catalog items | `price`, `stock`, `sku`, `images[]`, `rating` |
| `User` | Customers | `telegramId`, `phone`, `bonusPoints`, `referralCode` |
| `Order` | Purchase orders | `orderNumber`, `status`, `total`, `paymentMethod` |
| `OrderItem` | Line items | `quantity`, `price` (snapshot) |

### Business Models

| Model | Purpose |
|-------|---------|
| `CartItem` | Shopping cart (per user) |
| `Favorite` | Wishlist |
| `Review` | Product reviews (1-5 stars) |
| `PromoCode` | Discount codes (percent / fixed) |
| `Address` | Delivery addresses |
| `AiChat` | AI nutritionist conversation history |

### Operations Models

| Model | Purpose |
|-------|---------|
| `Employee` | Staff with PIN login |
| `StockMovement` | Inventory tracking (IN/OUT/ADJUSTMENT/RETURN/WRITE_OFF) |
| `Supplier` | Vendor management |
| `Debt` | Accounts payable/receivable |
| `Promotion` | Time-limited promotions with images |

### Magazine Models (NEW)

| Model | Purpose |
|-------|---------|
| `MagazineIssue` | Weekly journal issues (title, cover, PDF, HTML) |
| `MagazineSubscriber` | Digital/print subscriptions |
| `Restaurant` | 100 restaurants database for AI Sales Bot |

## Migration Rules

1. **Never** edit `init.sql` directly for Prisma models
2. Schema changes go through `schema.prisma` → `npx prisma db push`
3. **Always** run `npx prisma generate` after schema changes
4. Seed data: `npx prisma db seed` (runs `seed.ts`)
5. Field naming: `camelCase` in TypeScript, `snake_case` in DB via `@map()`
6. **Always** add `@@map("table_name")` to models
7. **Always** add `createdAt` and `updatedAt` to new models
8. Use `@default(cuid())` for IDs (not UUID)

## AI Office Database (microgreen)

The AI Office uses raw SQL via SQLAlchemy. Key tables:

- `tasks` — CRM tasks (assigned to departments)
- `products` — Product mirror (synced from Prisma DB)
- `publications` — Content publication log
- `bot_metrics` — Bot performance tracking

Schema lives in `apps/tgas/database/init.sql`. No migration tool — apply changes manually.
