import { prisma } from '@repo/database';
import { loadSalesLedger, daysAgo } from '@/lib/revenue/salesLedger';
import { demandByProduct } from '@/lib/revenue/summary';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
//
// ⚠️ Спрос берётся из lib/revenue: раньше здесь складывались позиции заказов
// И все складские движения OUT — то есть онлайн-продажа считалась дважды,
// и «лидеры продаж» показывали удвоенные штуки.

/** Лидеры продаж, лидеры выручки и залежавшийся товар. */
export async function loadTopProducts() {
  const ninetyDaysAgo = daysAgo(90);

  const ledger = await loadSalesLedger(ninetyDaysAgo);
  const productStats = demandByProduct(ledger, ninetyDaysAgo);

  // Get product details
  const productIds = Array.from(productStats.keys());
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, nameUz: true, price: true, stock: true, category: { select: { nameUz: true } } },
  });

  const withStats = products.map(p => {
    const stats = productStats.get(p.id);
    return { ...p, sold: stats?.sold ?? 0, revenue: stats?.revenue ?? 0 };
  });

  const topBySales = [...withStats].sort((a, b) => b.sold - a.sold).slice(0, 10);
  const topByRevenue = [...withStats].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

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
