import { prisma } from '@repo/database';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// Каждая секция считается независимо — роут остался диспетчером.

/** Помесячная выручка и число заказов. */
export async function loadSales(months: number) {
  const now = new Date();
  const monthlyData: { month: string; orders: number; revenue: number; posRevenue: number; posSales: number }[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const monthLabel = start.toLocaleDateString('uz-UZ', { month: 'short', year: 'numeric' });

    const [orders, posMovements] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
        select: { total: true },
      }),
      prisma.stockMovement.findMany({
        where: { type: 'OUT', reason: { startsWith: "Do'kon sotish" }, createdAt: { gte: start, lte: end } },
        include: { product: { select: { price: true } } },
      }),
    ]);

    monthlyData.push({
      month: monthLabel,
      orders: orders.length,
      revenue: orders.reduce((s, o) => s + o.total, 0),
      posSales: posMovements.length,
      posRevenue: posMovements.reduce((s, m) => s + Math.abs(m.quantity) * (m.salePrice || m.product?.price || 0), 0),
    });
  }


  return { monthlyData };
}
