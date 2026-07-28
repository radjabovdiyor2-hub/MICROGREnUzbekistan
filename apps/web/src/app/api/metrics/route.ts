import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { render, type Gauge } from '@/lib/metrics';
import { isAuthorized } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Prometheus scrape endpoint (DD §4.8).
//
// Доступ: заголовок Authorization: Bearer <METRICS_TOKEN> (так ходит
// Prometheus) либо сессия владельца. Открытым его оставлять нельзя —
// метрики выдают обороты, число заказов и активность админов.
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const token = process.env.METRICS_TOKEN;
  if (token && request.headers.get('authorization') === `Bearer ${token}`) return true;
  return isAuthorized(request);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gauges: Gauge[] = [];

  // Бизнес-показатели считаем в момент scrape: они и так дешёвые (count),
  // а хранить их в памяти между запросами смысла нет.
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [products, orders, ordersToday, users] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.user.count(),
    ]);

    gauges.push(
      { name: 'mg_products_active', help: 'Активных товаров в каталоге', value: products },
      { name: 'mg_orders_total', help: 'Заказов за всё время', value: orders },
      { name: 'mg_orders_today', help: 'Заказов с начала суток', value: ordersToday },
      { name: 'mg_users_total', help: 'Зарегистрированных пользователей', value: users },
      { name: 'mg_database_up', help: 'Доступность БД (1/0)', value: 1 },
    );
  } catch (error) {
    console.error('[metrics] database gauges failed:', error);
    gauges.push({ name: 'mg_database_up', help: 'Доступность БД (1/0)', value: 0 });
  }

  gauges.push({
    name: 'mg_process_uptime_seconds',
    help: 'Время работы процесса',
    value: Math.floor(process.uptime()),
  });

  return new NextResponse(render(gauges), {
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  });
}
