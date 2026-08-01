import { prisma } from '@repo/database';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// Каждая секция считается независимо — роут остался диспетчером.

/** Лидеры продаж, лидеры выручки и залежавшийся товар. */
export async function loadTopProducts() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Online sales
  const orderItems = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: ninetyDaysAgo }, status: { not: 'CANCELLED' } } },
    select: { productId: true, quantity: true, price: true },
  });

  // POS sales
  const posItems = await prisma.stockMovement.findMany({
    where: { type: 'OUT', createdAt: { gte: ninetyDaysAgo } },
    select: { productId: true, quantity: true },
    orderBy: { createdAt: 'desc' },
  });

  // Aggregate by product
  const productStats = new Map<string, { sold: number; revenue: number }>();
  for (const item of orderItems) {
    const curr = productStats.get(item.productId) || { sold: 0, revenue: 0 };
    curr.sold += item.quantity;
    curr.revenue += item.price * item.quantity;
    productStats.set(item.productId, curr);
  }
  for (const mov of posItems) {
    const curr = productStats.get(mov.productId) || { sold: 0, revenue: 0 };
    curr.sold += Math.abs(mov.quantity);
    productStats.set(mov.productId, curr);
  }

  // Get product details
  const productIds = Array.from(productStats.keys());
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, nameUz: true, price: true, stock: true, category: { select: { nameUz: true } } },
  });

  // Enrich with POS revenue where missing
  for (const p of products) {
    const stats = productStats.get(p.id);
    if (stats && stats.revenue === 0) {
      stats.revenue = stats.sold * p.price;
    }
  }

  const topBySales = products
    .map(p => ({ ...p, ...(productStats.get(p.id) || { sold: 0, revenue: 0 }) }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 10);

  const topByRevenue = products
    .map(p => ({ ...p, ...(productStats.get(p.id) || { sold: 0, revenue: 0 }) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Dead stock: products with no sales in 60+ days
  const allProducts = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, nameUz: true, price: true, stock: true, category: { select: { nameUz: true } } },
  });

  const deadStock = allProducts
    .filter(p => !productStats.has(p.id) && p.stock > 0)
    .map(p => ({ ...p, daysSinceLastSale: 90, status: 'DEAD' as const }))
    .slice(0, 10);


  return { topBySales, topByRevenue, deadStock };
}
