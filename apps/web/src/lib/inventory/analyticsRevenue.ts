import { prisma } from '@repo/database';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// Каждая секция считается независимо — роут остался диспетчером.

/** Выручка, себестоимость, прибыль и возвраты по периодам. */
export async function loadRevenue(searchParams: URLSearchParams) {
  const periodParam = searchParams.get('period') || 'week';
  const days = periodParam === 'month' ? 30 : 7;
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now);
  monthStart.setDate(monthStart.getDate() - 30);
  monthStart.setHours(0, 0, 0, 0);

  // Get all OUT movements (sales) with cost prices
  const salesMovements = await prisma.stockMovement.findMany({
    where: { type: 'OUT', createdAt: { gte: monthStart } },
    include: { product: { select: { price: true, nameUz: true, costPrice: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Get all IN movements to build cost price map (latest cost per product)
  const costMap = new Map<string, number>();
  const inMovements = await prisma.stockMovement.findMany({
    where: { type: 'IN', costPrice: { not: null } },
    select: { productId: true, costPrice: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const m of inMovements) {
    if (!costMap.has(m.productId) && m.costPrice) {
      costMap.set(m.productId, m.costPrice);
    }
  }

  // Also load Product.costPrice as fallback for products without IN movement cost data
  const allProductCosts = await prisma.product.findMany({
    where: { costPrice: { not: null } },
    select: { id: true, costPrice: true },
  });
  for (const p of allProductCosts) {
    if (!costMap.has(p.id) && p.costPrice) {
      costMap.set(p.id, p.costPrice);
    }
  }

  // Get all RETURN movements (IN type with "Qaytarish" reason)
  const returnMovements = await prisma.stockMovement.findMany({
    where: { type: 'IN', reason: { startsWith: 'Qaytarish' }, createdAt: { gte: monthStart } },
    include: { product: { select: { price: true, nameUz: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Online orders too
  const onlineOrders = await prisma.order.findMany({
    where: { createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } },
    include: { items: { include: { product: { select: { price: true, nameUz: true, id: true } } } } },
  });

  // Calculate per-period aggregates
  const calcPeriod = (sinceDate: Date) => {
    let revenue = 0, cost = 0, salesCount = 0, returns = 0, returnCount = 0;

    // POS sales
    for (const m of salesMovements) {
      if (new Date(m.createdAt) >= sinceDate) {
        const qty = Math.abs(m.quantity);
        const salePrice = m.salePrice || m.product.price; // use actual sale price
        const costPrice = m.costPrice || costMap.get(m.productId) || m.product.costPrice || 0;
        revenue += qty * salePrice;
        cost += qty * costPrice;
        salesCount++;
      }
    }

    // Returns (subtract from revenue)
    for (const m of returnMovements) {
      if (new Date(m.createdAt) >= sinceDate) {
        const qty = Math.abs(m.quantity);
        returns += qty * (m.salePrice || m.product.price);
        returnCount++;
      }
    }

    // Online orders
    for (const order of onlineOrders) {
      if (new Date(order.createdAt) >= sinceDate) {
        for (const item of order.items) {
          const costPrice = costMap.get(item.productId) || 0;
          revenue += item.quantity * item.price;
          cost += item.quantity * costPrice;
        }
        salesCount++;
      }
    }

    const netRevenue = revenue - returns;
    const profit = netRevenue - cost;
    const margin = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;
    return { revenue: netRevenue, grossRevenue: revenue, cost, profit, margin, salesCount, returns, returnCount };
  };

  const today = calcPeriod(todayStart);
  const week = calcPeriod(weekStart);
  const month = calcPeriod(monthStart);

  // Daily data for chart
  const dailyData: { date: string; revenue: number; cost: number; profit: number; returns: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    let dayRevenue = 0, dayCost = 0, dayReturns = 0;

    for (const m of salesMovements) {
      const d = new Date(m.createdAt);
      if (d >= dayStart && d <= dayEnd) {
        const qty = Math.abs(m.quantity);
        dayRevenue += qty * (m.salePrice || m.product.price);
        dayCost += qty * (m.costPrice || costMap.get(m.productId) || m.product.costPrice || 0);
      }
    }

    for (const m of returnMovements) {
      const d = new Date(m.createdAt);
      if (d >= dayStart && d <= dayEnd) {
        dayReturns += Math.abs(m.quantity) * (m.salePrice || m.product.price);
      }
    }

    for (const order of onlineOrders) {
      const d = new Date(order.createdAt);
      if (d >= dayStart && d <= dayEnd) {
        for (const item of order.items) {
          dayRevenue += item.quantity * item.price;
          dayCost += item.quantity * (costMap.get(item.productId) || 0);
        }
      }
    }

    const netDayRevenue = dayRevenue - dayReturns;
    dailyData.push({ date: dayStart.toISOString(), revenue: netDayRevenue, cost: dayCost, profit: netDayRevenue - dayCost, returns: dayReturns });
  }

  // Top profitable / loss products
  const productProfit = new Map<string, { name: string; revenue: number; cost: number; sold: number }>();
  for (const m of salesMovements) {
    const qty = Math.abs(m.quantity);
    const curr = productProfit.get(m.productId) || { name: m.product.nameUz, revenue: 0, cost: 0, sold: 0 };
    curr.revenue += qty * (m.salePrice || m.product.price);
    curr.cost += qty * (m.costPrice || costMap.get(m.productId) || m.product.costPrice || 0);
    curr.sold += qty;
    productProfit.set(m.productId, curr);
  }

  const productArr = Array.from(productProfit.values()).map(p => ({
    ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
  }));

  const topProfitable = [...productArr].sort((a, b) => b.profit - a.profit).slice(0, 8);
  const topLoss = [...productArr].sort((a, b) => a.margin - b.margin).slice(0, 8);

  return ({
    todayRevenue: today.revenue, todayCost: today.cost, todayProfit: today.profit, todayMargin: today.margin, todaySales: today.salesCount,
    todayReturns: today.returns, todayReturnCount: today.returnCount,
    weekRevenue: week.revenue, weekCost: week.cost, weekProfit: week.profit, weekReturns: week.returns,
    monthRevenue: month.revenue, monthCost: month.cost, monthProfit: month.profit, monthMargin: month.margin, monthReturns: month.returns,
    dailyData, topProfitable, topLoss,
  });
}
