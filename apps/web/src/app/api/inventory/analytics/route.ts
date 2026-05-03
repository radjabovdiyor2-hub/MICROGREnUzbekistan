import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Analytics API — Sales, Demand, Warnings
// ==========================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get('section') || 'dashboard';
  const months = parseInt(searchParams.get('months') || '6');

  // === DASHBOARD: Monthly sales breakdown ===
  if (section === 'dashboard' || section === 'sales') {
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
        posRevenue: posMovements.reduce((s, m) => s + Math.abs(m.quantity) * (m.salePrice || m.product.price), 0),
      });
    }

    if (section === 'sales') {
      return NextResponse.json({ monthlyData });
    }
  }

  // === TOP PRODUCTS ===
  if (section === 'dashboard' || section === 'top') {
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

    if (section === 'top') {
      return NextResponse.json({ topBySales, topByRevenue, deadStock });
    }
  }

  // === CATEGORY BREAKDOWN ===
  if (section === 'dashboard' || section === 'categories') {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const categoryData = await prisma.category.findMany({
      select: {
        id: true, nameUz: true,
        products: {
          select: {
            id: true, stock: true, price: true,
            orderItems: {
              where: { order: { createdAt: { gte: ninetyDaysAgo }, status: { not: 'CANCELLED' } } },
              select: { quantity: true, price: true },
            },
          },
        },
      },
    });

    const categories = categoryData.map(cat => {
      const totalProducts = cat.products.length;
      const totalStock = cat.products.reduce((s, p) => s + p.stock, 0);
      const stockValue = cat.products.reduce((s, p) => s + p.stock * p.price, 0);
      const totalSold = cat.products.reduce((s, p) => s + p.orderItems.reduce((ss, i) => ss + i.quantity, 0), 0);
      const totalRevenue = cat.products.reduce((s, p) => s + p.orderItems.reduce((ss, i) => ss + i.price * i.quantity, 0), 0);

      return { id: cat.id, name: cat.nameUz, totalProducts, totalStock, stockValue, totalSold, totalRevenue };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);

    if (section === 'categories') {
      return NextResponse.json({ categories });
    }
  }

  // === WARNINGS & RECOMMENDATIONS ===
  if (section === 'dashboard' || section === 'warnings') {
    const warnings: { level: string; message: string; action: string }[] = [];

    // Critical stock
    const criticalProducts = await prisma.product.findMany({
      where: { isActive: true, stock: { lte: 3 } },
      select: { nameUz: true, stock: true },
    });
    for (const p of criticalProducts) {
      warnings.push({
        level: 'CRITICAL',
        message: `${p.nameUz} — faqat ${p.stock} dona qoldi`,
        action: 'Tezkor zakaz qiling',
      });
    }

    // Overdue debts
    const overdueDebts = await prisma.debt.findMany({
      where: { isPaid: false, dueDate: { lt: new Date() } },
      select: { personName: true, amount: true, paidAmount: true, dueDate: true },
    });
    for (const d of overdueDebts) {
      const days = Math.floor((Date.now() - new Date(d.dueDate!).getTime()) / 86400000);
      warnings.push({
        level: 'WARNING',
        message: `${d.personName} — ${(d.amount - d.paidAmount).toLocaleString()} so'm qarz, ${days} kun kechikmoqda`,
        action: "To'lovni so'rang",
      });
    }

    if (section === 'warnings') {
      return NextResponse.json({ warnings });
    }
  }

  // === FORECAST: demand prediction ===
  if (section === 'forecast') {
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

    return NextResponse.json({ forecast: forecastData });
  }

  // === ABC-XYZ CLASSIFICATION ===
  if (section === 'abcxyz') {
    const allProducts = await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, nameUz: true, price: true, stock: true, category: { select: { nameUz: true } } },
    });

    // Batch-load monthly sales (avoid N+1)
    const now = new Date();
    const monthRanges = [2, 1, 0].map(i => ({
      start: new Date(now.getFullYear(), now.getMonth() - i, 1),
      end: new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59),
    }));

    const allMonthlyData: Map<string, number[]> = new Map();
    for (const product of allProducts) {
      allMonthlyData.set(product.id, [0, 0, 0]);
    }

    for (let mi = 0; mi < 3; mi++) {
      const { start, end } = monthRanges[mi];
      const [oSales, pSales] = await Promise.all([
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

      for (const s of oSales) {
        const arr = allMonthlyData.get(s.productId);
        if (arr) arr[mi] += s._sum.quantity || 0;
      }
      for (const s of pSales) {
        const arr = allMonthlyData.get(s.productId);
        if (arr) arr[mi] += Math.abs(s._sum.quantity || 0);
      }
    }

    const productData = allProducts.map(product => {
      const monthlySales = allMonthlyData.get(product.id) || [0, 0, 0];
      const totalRevenue = monthlySales.reduce((a, b) => a + b, 0) * product.price;
      const avgSales = monthlySales.reduce((a, b) => a + b, 0) / 3;
      const variance = monthlySales.reduce((s, v) => s + (v - avgSales) ** 2, 0) / 3;
      const cv = avgSales > 0 ? Math.sqrt(variance) / avgSales : 1;

      // XYZ
      const xyz = cv < 0.1 ? 'X' : cv < 0.25 ? 'Y' : 'Z';

      return { ...product, monthlySales, totalRevenue, avgSales, cv, xyz };
    });

    // ABC classification
    productData.sort((a, b) => b.totalRevenue - a.totalRevenue);
    const totalRev = productData.reduce((s, p) => s + p.totalRevenue, 0);
    let cumulative = 0;

    const classified = productData.map(p => {
      cumulative += p.totalRevenue;
      const pct = totalRev > 0 ? cumulative / totalRev : 1;
      const abc = pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C';
      const abcxyz = `${abc}${p.xyz}`;

      return { ...p, abc, abcxyz, revenuePct: totalRev > 0 ? (p.totalRevenue / totalRev * 100) : 0 };
    });

    // Summary by class
    const classSummary: Record<string, number> = {};
    for (const p of classified) {
      classSummary[p.abcxyz] = (classSummary[p.abcxyz] || 0) + 1;
    }

    return NextResponse.json({ products: classified, classSummary, totalRevenue: totalRev });
  }

  // === HEALTH SCORE ===
  if (section === 'health') {
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

    let healthLabel = 'Ajoyib';
    let healthColor = '#10B981';
    if (healthScore < 40) { healthLabel = 'Kritik'; healthColor = '#EF4444'; }
    else if (healthScore < 60) { healthLabel = "E'tibor kerak"; healthColor = '#F59E0B'; }
    else if (healthScore < 80) { healthLabel = 'Yaxshi'; healthColor = '#3B82F6'; }

    return NextResponse.json({
      healthScore,
      healthLabel,
      healthColor,
      breakdown: { stockoutScore, balanceScore, turnoverScore, diversityScore },
      stats: { totalStockValue, totalItems, criticalCount, lowCount, zeroCount },
    });
  }

  // === REVENUE / PROFIT ANALYSIS ===
  if (section === 'revenue') {
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

    return NextResponse.json({
      todayRevenue: today.revenue, todayCost: today.cost, todayProfit: today.profit, todayMargin: today.margin, todaySales: today.salesCount,
      todayReturns: today.returns, todayReturnCount: today.returnCount,
      weekRevenue: week.revenue, weekCost: week.cost, weekProfit: week.profit, weekReturns: week.returns,
      monthRevenue: month.revenue, monthCost: month.cost, monthProfit: month.profit, monthMargin: month.margin, monthReturns: month.returns,
      dailyData, topProfitable, topLoss,
    });
  }

  // Default
  return NextResponse.json({ section: 'unknown' });
}
