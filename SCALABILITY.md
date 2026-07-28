# Scalability & Capacity Plan — Microgreen Uzbekistan

План масштабирования до **15 млн пользователей** и корректной работы при одновременных
заявках. Часть пунктов — код (уже сделано), часть — инфраструктура (ops, разворачивается по мере роста).

## 1. Что уже сделано в коде (корректность под конкуренцией)
Одновременные заявки больше не приводят к ошибкам/порче данных (`apps/web/src/app/api/orders/route.ts`,
`src/lib/payments.ts`):
- **Списание остатков — атомарное** (`updateMany` с условием `stock >= qty`): нет ухода в минус
  (oversell) при параллельных заказах на последнюю единицу.
- **Заказ + резерв бонусов — в одной транзакции** с условным декрементом: нет двойного списания баллов.
- **Создание пользователя — `upsert` по телефону:** нет гонки `find→create` (500 на дубликате).
- **Платёжные вебхуки идемпотентны:** переход `PENDING→PAID` — атомарный; побочные эффекты один раз.
- **Пул соединений безопасен:** единый process-singleton `PrismaClient` (`packages/database/src/index.ts`).
- **Индексы горячих запросов:** `orders(user_id,created_at)`, `orders(status,created_at)`, `orders(phone)`,
  `products(category_id,is_active)`, `reviews(product_id)` — см. `schema.prisma` + manual-миграцию
  `migrations/manual/2026-07-scale-indexes.sql` (`CREATE INDEX CONCURRENTLY`).

## 2. Целевая архитектура на 15 млн (по тиреам)
| Тир | Сейчас | Цель под нагрузку |
|---|---|---|
| Вход | 1 nginx (TLS) | nginx/L4-LB + CDN (Cloudflare) перед статикой/картинками |
| App (Next.js) | 1 контейнер на VPS | **stateless**, N реплик за LB, авто-скейл по CPU/RPS |
| БД | 1 Postgres | Primary + read-replicas; **PgBouncer** (transaction pool) перед Postgres |
| Кэш | 1 Redis | Redis для кэша/сессий/rate-limit (при росте — Redis cluster) |
| Тяжёлые задачи | инлайн | вынести в очередь (генерация PDF/картинок, рассылки) |
| Медиа | локально/сервер | объектное хранилище (S3/R2) + CDN |

Приложение уже **stateless** (нет локального состояния в процессе) → горизонтально масштабируется
добавлением реплик за балансировщиком.

## 3. Пул соединений к БД (критично при масштабировании)
Prisma по умолчанию держит пул `num_cpus*2+1` на процесс. При N репликах суммарные коннекты быстро
упираются в лимит Postgres (`max_connections`). Решение:
- **PgBouncer** в режиме `transaction` перед Postgres; приложение ходит через него.
- В `DATABASE_URL` задать `?connection_limit=<小>&pool_timeout=…` на реплику (например, `connection_limit=10`),
  чтобы суммарно не превышать `max_connections`.
- Пример: `postgresql://user:pass@pgbouncer:6432/db?connection_limit=10&pgbouncer=true`.

## 4. Кэширование и раздача
- **ISR/`revalidate`** для каталога и страниц товара (редко меняются) — снимает нагрузку с БД.
- `Cache-Control`/`s-maxage` на `GET /api/products`, категорий, контента.
- Статика и изображения — через **CDN** (edge-кэш, близко к пользователю).
- Rate-limiting (Redis) на пишущие эндпоинты (заказы, отзывы, auth) — защита от всплесков/абьюза.

## 5. Нагрузочное тестирование (обязательно перед ростом)
Сценарий на **k6** (или Artillery), целевые метрики:
- **Заказы:** N параллельных `POST /api/orders` на один остаток → ни одного `stock < 0`,
  ни одного дубля пользователя/двойного списания бонусов; повторный платёжный колбэк не дублирует оплату.
- **Каталог:** пик RPS на `GET /api/products` — p95 latency в целевом бюджете; нет `too many connections`.
- Ramp-up до целевого пикового RPS; следить за пулом БД, CPU реплик, hit-rate кэша.

Пример скелета k6:
```js
import http from 'k6/http'; import { check } from 'k6';
export const options = { scenarios: {
  order_spike: { executor: 'constant-arrival-rate', rate: 200, timeUnit: '1s',
                 duration: '2m', preAllocatedVUs: 200 } } };
export default function () {
  const res = http.post(`${__ENV.BASE}/api/orders`, JSON.stringify({/* ... */}),
    { headers: { 'Content-Type': 'application/json' } });
  check(res, { 'ok': r => r.status === 200 });
}
```

## 6. Эксплуатация
- Мониторинг ботов: heartbeat + `/health/bots` (web_office) + алерты Стёпана.
- Расход AI-токенов: ежедневный отчёт + бюджет-алерт (finance_bot).
- Бэкапы БД: devops_bot (`./backups`).
- Логи: docker `json-file` с ротацией; при росте — централизованный сбор (Loki/ELK).

> ⚠️ Развёртывание LB, реплик, PgBouncer, CDN — операционные шаги, выполняются по мере роста
> нагрузки. Код к этому готов (stateless, singleton-пул, индексы, идемпотентность).
