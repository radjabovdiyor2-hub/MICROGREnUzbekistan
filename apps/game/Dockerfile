FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/game/package*.json ./
RUN npm install

COPY apps/game ./
RUN npm run build

# Production - serve static files
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
