FROM node:20-alpine AS builder

WORKDIR /app

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

ENV NODE_ENV=production

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
