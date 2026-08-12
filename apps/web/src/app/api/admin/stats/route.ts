import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { startOfLocalDay } from '@/lib/revenue/salesLedger';

// ==========================================
// Admin — dashboard stats (storefront bot admin panel: apps/bot admin.py).
// ==========================================
export async function GET(request: NextRequest) {
  if (!requireBotAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Та же граница суток, что у сводки и кассы (lib/revenue/salesLedger).
  const startOfToday = startOfLocalDay();

  const [users, orders, products, revenueAgg, todayOrders] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.aggregate({
      _sum: { total: true },
      // Возврат — не выручка. Фильтра по `paymentStatus` здесь не было, хотя
      // `salesLedger` его ставит: Telegram-панель бота (единственный
      // потребитель этого роута) показывала выручку на сумму всех возвратов
      // больше, чем веб-сводка, и владелец видел два разных числа.
      where: {
        status: { not: 'CANCELLED' },
        paymentStatus: { not: 'REFUNDED' },
      },
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
