FROM node:20-alpine AS builder

WORKDIR /app

# Prisma engine needs OpenSSL 3 at build (generate) and runtime on Alpine.
RUN apk add --no-cache openssl

# Install dependencies
COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN npm install
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Build workspace deps first (packages/database -> dist). Without this,
# `@repo/database` (main: ./dist/index.js) can't be resolved by the web build.
RUN npm run build --workspace=@repo/database

WORKDIR /app/apps/web
RUN npm run build

# Production
FROM node:20-alpine AS runner
WORKDIR /app

# Prisma query engine needs OpenSSL 3 shared libs at runtime.
RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Monorepo standalone: server.js runs at /app/apps/web/server.js and resolves
# static/public relative to itself — so they must live under apps/web/, not /app.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
