import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { prisma } from '@repo/database';
import { soldProductKey, soldProductName } from '@/lib/products/sold';

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const sp = new URL(request.url).searchParams;
  const days = Math.min(Math.max(Number(sp.get('days')) || 30, 1), 365);
  
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  // 1. Сводные метрики за период
  const [users, ordersCount, revenueAgg, customers] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: from } } }),
    prisma.order.count({ where: { createdAt: { gte: from }, status: { not: 'CANCELLED' } } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: from }, status: { not: 'CANCELLED' } },
    }),
    prisma.customer.count({ where: { createdAt: { gte: from } } })
  ]);

  const revenue = revenueAgg._sum.total || 0;
  const avgOrder = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;

  // 2. Тренд выручки по дням
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from }, status: { not: 'CANCELLED' } },
    select: { createdAt: true, total: true }
  });

  const dailyRevenue: Record<string, number> = {};
  for (const order of orders) {
    const dateStr = order.createdAt.toISOString().slice(0, 10);
    dailyRevenue[dateStr] = (dailyRevenue[dateStr] || 0) + order.total;
  }
  const revenueTrend = Object.entries(dailyRevenue).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));

  // 3. Топ продукты за период
  const orderItems = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: from }, status: { not: 'CANCELLED' } } },
    include: { product: true }
  });

  const productStats: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const item of orderItems) {
    // Удалённый товар из топа НЕ выпадает: он продавался, и выручка по нему
    // была. Ключ и подпись берутся из снимка — см. `lib/products/sold`.
    const pid = soldProductKey(item);
    if (!productStats[pid]) {
      productStats[pid] = { name: item.product?.nameRu ?? soldProductName(item), qty: 0, revenue: 0 };
    }
    productStats[pid].qty += item.quantity;
    productStats[pid].revenue += (item.price * item.quantity);
  }
  const topProducts = Object.values(productStats).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  return NextResponse.json({
    period: { days, from: from.toISOString().slice(0, 10) },
    summary: {
      newUsers: users,
      newCustomers: customers,
      orders: ordersCount,
      revenue,
      avgOrder
    },
    revenueTrend,
    topProducts
  });
}
