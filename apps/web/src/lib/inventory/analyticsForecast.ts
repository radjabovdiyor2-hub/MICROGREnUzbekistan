import { prisma } from '@repo/database';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// Каждая секция считается независимо — роут остался диспетчером.

/** Прогноз спроса по взвешенному скользящему среднему. */
export async function loadForecast() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, nameUz: true, stock: true, price: true, category: { select: { nameUz: true } } },
  });

  const now = new Date();
  
  // Batch-load all monthly sales data (avoid N+1)
  const monthRanges = [2, 1, 0].map(i => ({
    start: new Date(now.getFullYear(), now.getMonth() - i, 1),
    end: new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59),
  }));

  const allMonthlyData: Map<string, number[]> = new Map();
  for (const product of products) {
    allMonthlyData.set(product.id, [0, 0, 0]);
  }

  // 6 batch queries instead of N*6
  for (let mi = 0; mi < 3; mi++) {
    const { start, end } = monthRanges[mi];
    const [orderSales, posSales] = await Promise.all([
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { createdAt: { gte: start, lte: end }, status: { not: 'CANCELLED' } } },
        _sum: { quantity: true },
      }),
      prisma.stockMovement.groupBy({
        by: ['productId'],
        where: { type: 'OUT', createdAt: { gte: start, lte: end } },
        _sum: { quantity: true },
      }),
    ]);

    for (const s of orderSales) {
      const arr = allMonthlyData.get(s.productId);
      if (arr) arr[mi] += s._sum.quantity || 0;
    }
    for (const s of posSales) {
      const arr = allMonthlyData.get(s.productId);
      if (arr) arr[mi] += Math.abs(s._sum.quantity || 0);
    }
  }

  const forecastData = [];

  for (const product of products) {
    const monthlySales = allMonthlyData.get(product.id) || [0, 0, 0];
    const totalSold = monthlySales.reduce((a, b) => a + b, 0);
    if (totalSold === 0 && product.stock === 0) continue;

    // Weighted moving average forecast
    const weighted = monthlySales[2] * 0.5 + monthlySales[1] * 0.3 + monthlySales[0] * 0.2;
    const trend = (monthlySales[2] - monthlySales[0]) / 2;
    const forecast = [1, 2, 3].map(i => Math.max(0, Math.round(weighted + trend * i)));

    const avgDaily = totalSold / 90;
    const daysOfSupply = avgDaily > 0 ? Math.round(product.stock / avgDaily) : product.stock > 0 ? 999 : 0;
    const suggestedOrder = Math.max(0, forecast[0] - product.stock);

    let urgency = 'NORMAL';
    if (daysOfSupply <= 7) urgency = 'CRITICAL';
    else if (daysOfSupply <= 14) urgency = 'SOON';

    forecastData.push({
      ...product,
      monthlySales,
      forecast,
      daysOfSupply,
      suggestedOrder,
      urgency,
      trend: trend > 0.5 ? 'UP' : trend < -0.5 ? 'DOWN' : 'STABLE',
    });
  }

  // Sort: critical first
  forecastData.sort((a, b) => {
    const urgencyOrder = { CRITICAL: 0, SOON: 1, NORMAL: 2 };
    return (urgencyOrder[a.urgency as keyof typeof urgencyOrder] || 2) - (urgencyOrder[b.urgency as keyof typeof urgencyOrder] || 2);
  });

  return { forecast: forecastData };
}
