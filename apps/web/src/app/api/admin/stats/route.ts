import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';

// ==========================================
// Admin — dashboard stats (storefront bot admin panel: apps/bot admin.py).
// ==========================================
export async function GET(request: NextRequest) {
  if (!requireBotAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [users, orders, products, revenueAgg, todayOrders] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: { not: 'CANCELLED' } },
    }),
    prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
  ]);

  return NextResponse.json({
    users,
    orders,
    products,
    revenue: revenueAgg._sum.total || 0,
    todayOrders,
  });
}
