# 01 COMMANDS

## Node.js (Web/Shared/DB)
- `npm install --legacy-peer-deps` : Install dependencies. (Confirmed)
- `npm run dev` : Start Next.js dev server. (Needs verification)
- `npm run build` : Turborepo build pipeline. (Confirmed)
- `npm run lint` : ESLint check (Fixed to `eslint .` in apps/web). (Confirmed)
- `npm run test` : Vitest test runner. (Confirmed)
- `npx prisma generate` : Generate Prisma Client. (Confirmed)
- `npx prisma db push --skip-generate` : Sync DB schema (without data loss flag). (Confirmed)
- `npx prisma migrate deploy` : Safely apply DB migrations. (Recommended for future, currently missing `migrations` folder). (Confirmed)

## Python (tgas)
- `python main.py` / `uvicorn main:app` : Start FastAPI CRM. (Needs verification)

## Docker
- `docker-compose -f docker-compose.prod.yml up -d --build` : Deploy production services. (Confirmed)
