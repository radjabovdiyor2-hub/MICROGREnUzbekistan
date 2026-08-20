FROM node:22-alpine

# Движки Prisma на alpine требуют OpenSSL 3 (binaryTarget linux-musl-openssl-3.0.x).
RUN apk add --no-cache openssl

WORKDIR /app

# ВАЖНО: контекст сборки — КОРЕНЬ репозитория, а не packages/database:
# ставимся по корневому package-lock.json, иначе версия prisma уезжала бы
# по диапазону `^5.22.0` независимо от остального монорепозитория, и db push
# на проде шёл бы не тем инструментом, каким его проверял CI.
#
# --include-workspace-root=false отсекает turbo/playwright/ssh2 корня, они
# здесь ни к чему; --ignore-scripts гасит postinstall @prisma/client, потому
# что клиент генерируется ниже явно, по схеме.
COPY package.json package-lock.json ./
COPY packages/database/package.json ./packages/database/package.json
RUN npm ci --workspace=@repo/database --include-workspace-root=false --ignore-scripts

# node_modules лежит в /app, а не в /app/packages/database, и это намеренно:
# его находят оба рабочих каталога — и /app (db-push), и /app/packages/database
# (сидер, node ищет node_modules вверх по дереву).
COPY packages/database/prisma ./packages/database/prisma

# Каталог сидится из прайса, свёрстанного в apps/web: import-catalog.ts читает
# эти два файла по пути ../../../apps/web/public/catalog от prisma/. Копируем
# именно файлы, а не каталог целиком — рядом лежат 33 МБ картинок товаров,
# которые сидеру не нужны.
COPY apps/web/public/catalog/price-list.html apps/web/public/catalog/product-catalog.html ./apps/web/public/catalog/

# Справочник заведений области: seed-venues.ts читает его по пути
# ../../../content от prisma/. Копируем один файл, а не каталог целиком —
# в content/ лежат сгенерированные макеты журнала, сидеру не нужные.
COPY content/venues-samarkand.json ./content/

# Клиент генерируется на сборке: сидеру он нужен готовым, а db push вызывается
# с --skip-generate. Схему compose дополнительно монтирует поверх — при db push
# правду говорит файл из git-копии сервера, а не запечённый в образ.
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
