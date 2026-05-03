# Microgreen Uzbekistan — AgroTech Ecosystem

Organic microgreens, seeds, substrates & hydroponic equipment.  
**Domain:** microgreenuzbekistan.com  
**Port:** 3000 (production, PM2)

## Project Structure

```
MICROGREnUzbekistan/
├── apps/
│   ├── web/          # Next.js 16 PWA (main website + admin)
│   ├── bot/          # Python Telegram bot (aiogram + Gemini AI)
│   └── game/         # Farm Simulator mini-app
├── packages/
│   └── database/     # Prisma ORM + PostgreSQL schema
├── nginx/            # Production nginx config
├── ecosystem.config.js  # PM2 config (web + bot)
├── docker-compose.yml   # Dev environment
└── docker-compose.prod.yml  # Production stack
```

## Deploy to Server

```bash
# 1. Build
cd /opt/microgreen
npm install
cd apps/web && npx next build

# 2. Start
pm2 start ecosystem.config.js
pm2 save

# 3. Nginx
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
```

## Environment

Copy `.env.example` → `.env` and fill in real keys.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (port 5432) |
| `GEMINI_API_KEY` | Google Gemini AI for chat + agronomy |
| `BOT_TOKEN` | Telegram bot token |
| `ADMIN_CHAT_ID` | Telegram admin for order notifications |

## Ports (no conflicts with other projects)

| Project | Port |
|---|---|
| **Microgreen** | 3000 |
| Mahallu | 3001 |
| UzIs | 3002 |
