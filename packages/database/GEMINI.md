# packages/database — Prisma Schema

## What this is
Central database schema for the storefront (Next.js, Bot, Game).

## 🚫 CRITICAL CONSTRAINTS (Never do this)
- NEVER modify PostgreSQL schema manually. ALL schema changes MUST go through `prisma/schema.prisma`.
- NEVER use standard camelCase for database column names. ALWAYS map to snake_case using `@map("field_name")`.
- NEVER create a model without `@@map("table_name")` at the bottom to ensure the table name is plural and snake_case.
- NEVER create a model without `createdAt` and `updatedAt` timestamps.
- NEVER use UUIDs. Use `@default(cuid())` for all IDs.

## Workflow
1. Edit `prisma/schema.prisma`.
2. Run `npx prisma db push` (updates DB).
3. Run `npx prisma generate` (updates TS client).

## Handling Mistakes
- If the app throws a "PrismaClient initialization error", you probably forgot to run `npx prisma generate` after a schema change or git pull.
- If a relation field is missing its foreign key, ensure you explicitly define `@relation(fields: [...], references: [...])`.
