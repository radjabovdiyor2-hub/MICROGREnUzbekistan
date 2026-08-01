import { prisma } from '@repo/database';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// Каждая секция считается независимо — роут остался диспетчером.

/** Сводная оценка здоровья склада, 0-100. */
export async function loadHealth() {
  const allProducts = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, stock: true, price: true },
  });

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const totalSales = await prisma.orderItem.aggregate({
    where: { order: { createdAt: { gte: ninetyDaysAgo }, status: { not: 'CANCELLED' } } },
    _sum: { quantity: true },
  });

  const totalStockValue = allProducts.reduce((s, p) => s + p.stock * p.price, 0);
  const totalItems = allProducts.length;
  const criticalCount = allProducts.filter(p => p.stock <= 2).length;
  const lowCount = allProducts.filter(p => p.stock > 2 && p.stock <= 10).length;
  const zeroCount = allProducts.filter(p => p.stock === 0).length;

  // Scores (each 0-25, total 0-100)
  const stockoutScore = Math.round((1 - zeroCount / Math.max(totalItems, 1)) * 25);
  const balanceScore = Math.round((1 - criticalCount / Math.max(totalItems, 1)) * 25);
  const turnoverScore = Math.min(25, Math.round(((totalSales._sum.quantity || 0) / Math.max(totalItems, 1)) / 10 * 25));
  const diversityScore = Math.round((1 - lowCount / Math.max(totalItems, 1)) * 25);

  const healthScore = stockoutScore + balanceScore + turnoverScore + diversityScore;

  // API отдаёт УРОВЕНЬ, а не цвет: раньше здесь лежал захардкоженный hex,
  // и палитра склада жила отдельно от дизайн-системы — тему переключали, а
  // индикатор оставался в старых цветах. Цвет выбирает витрина по токенам.
  let healthLabel = 'Ajoyib';
  let healthLevel: 'ok' | 'info' | 'warning' | 'critical' = 'ok';
  if (healthScore < 40) { healthLabel = 'Kritik'; healthLevel = 'critical'; }
  else if (healthScore < 60) { healthLabel = "E'tibor kerak"; healthLevel = 'warning'; }
  else if (healthScore < 80) { healthLabel = 'Yaxshi'; healthLevel = 'info'; }

  return ({
    healthScore,
    healthLabel,
    healthLevel,
    breakdown: { stockoutScore, balanceScore, turnoverScore, diversityScore },
    stats: { totalStockValue, totalItems, criticalCount, lowCount, zeroCount },
  });
}
