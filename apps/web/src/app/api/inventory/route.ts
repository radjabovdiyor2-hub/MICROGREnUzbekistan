import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getNumber } from '@/lib/settings/store';

// ==========================================
// Inventory Dashboard — Main stock overview
// ==========================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter'); // low | excess | all
  const categoryId = searchParams.get('category');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1');
  const limitRaw = parseInt(searchParams.get('limit') || '50');
  const limit = Math.min(limitRaw, 100);

  // Get all active products with stock info
  const productWhere: Record<string, unknown> = { isActive: true };
  if (categoryId) productWhere.categoryId = categoryId;
  if (search) {
    productWhere.OR = [
      { nameUz: { contains: search, mode: 'insensitive' } },
      { nameRu: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [products, productTotal] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      include: { category: { select: { nameUz: true } } },
      orderBy: { stock: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where: productWhere }),
  ]);

  // Пороги склада задаются в админке: раньше 2 / 14 / 3 / 90 были вписаны
  // числами прямо в расчёт, и подстроить их под сезон было нельзя.
  const [
    criticalLevel, lowDaysOfSupply, excessMultiplier, reorderLeadDays, demandWindow,
  ] = await Promise.all([
    getNumber('stock.criticalLevel'),
    getNumber('stock.lowDaysOfSupply'),
    getNumber('stock.excessMultiplier'),
    getNumber('stock.reorderLeadDays'),
    getNumber('stock.demandWindowDays'),
  ]);

  // Get sales data over the demand window for demand calculation
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - demandWindow);

  const recentSales = await prisma.orderItem.findMany({
    where: {
      order: { createdAt: { gte: ninetyDaysAgo }, status: { not: 'CANCELLED' } },
    },
    select: { productId: true, quantity: true },
  });

  // Also get POS sales (StockMovement type=OUT with reason starting with "Do'kon")
  const recentPOS = await prisma.stockMovement.findMany({
    where: {
      type: 'OUT',
      createdAt: { gte: ninetyDaysAgo },
      reason: { not: null },
    },
    select: { productId: true, quantity: true },
  });

  // Calculate avg daily sales per product
  const salesByProduct = new Map<string, number>();

  for (const sale of recentSales) {
    const curr = salesByProduct.get(sale.productId) || 0;
    salesByProduct.set(sale.productId, curr + sale.quantity);
  }

  for (const mov of recentPOS) {
    const curr = salesByProduct.get(mov.productId) || 0;
    salesByProduct.set(mov.productId, curr + Math.abs(mov.quantity));
  }

  // Enrich products with analytics
  const enrichedProducts = products.map(product => {
    const totalSold90d = salesByProduct.get(product.id) || 0;
    const avgDailySales = totalSold90d / demandWindow;
    const avgMonthlySales = totalSold90d / (demandWindow / 30);
    const daysOfSupply = avgDailySales > 0
      ? Math.round(product.stock / avgDailySales)
      : product.stock > 0 ? 999 : 0;

    // Stock status
    let status: string;
    if (product.stock <= criticalLevel) status = 'CRITICAL';
    else if (daysOfSupply <= lowDaysOfSupply) status = 'LOW';
    else if (product.stock > avgMonthlySales * excessMultiplier && avgMonthlySales > 0) status = 'EXCESS';
    else status = 'NORMAL';

    // Reorder point (срок поставки + страховой запас, настраивается)
    const reorderPoint = Math.ceil(avgDailySales * reorderLeadDays);

    // Stock value
    const stockValue = product.stock * product.price;

    return {
      ...product,
      avgDailySales: Math.round(avgDailySales * 100) / 100,
      avgMonthlySales: Math.round(avgMonthlySales),
      daysOfSupply,
      status,
      reorderPoint,
      stockValue,
      totalSold90d,
    };
  });

  // Apply filter
  let filtered = enrichedProducts;
  if (filter === 'low') filtered = enrichedProducts.filter(p => p.status === 'CRITICAL' || p.status === 'LOW');
  else if (filter === 'excess') filtered = enrichedProducts.filter(p => p.status === 'EXCESS');

  // Summary stats
  const totalProducts = enrichedProducts.length;
  const totalStockValue = enrichedProducts.reduce((s, p) => s + p.stockValue, 0);
  const criticalCount = enrichedProducts.filter(p => p.status === 'CRITICAL').length;
  const lowCount = enrichedProducts.filter(p => p.status === 'LOW').length;
  const excessCount = enrichedProducts.filter(p => p.status === 'EXCESS').length;
  const normalCount = enrichedProducts.filter(p => p.status === 'NORMAL').length;

  // Today's revenue (orders + POS)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const todayOrders = await prisma.order.findMany({
    where: { createdAt: { gte: today, lte: endOfDay }, status: { not: 'CANCELLED' } },
    select: { total: true },
  });

  const todayPOS = await prisma.stockMovement.findMany({
    where: {
      type: 'OUT',
      reason: { startsWith: "Do'kon sotish" },
      createdAt: { gte: today, lte: endOfDay },
    },
    include: { product: { select: { price: true } } },
  });

  const todayOnlineRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
  const todayPOSRevenue = todayPOS.reduce((s, m) => s + Math.abs(m.quantity) * m.product.price, 0);

  // Debts summary
  const debtsRaw = await prisma.debt.findMany({
    where: { isPaid: false },
    select: { type: true, amount: true, paidAmount: true },
  });

  const debtsOwedToUs = debtsRaw
    .filter(d => d.type === 'WHO_OWES_US')
    .reduce((s, d) => s + (d.amount - d.paidAmount), 0);

  const debtsWeOwe = debtsRaw
    .filter(d => d.type === 'WE_OWE')
    .reduce((s, d) => s + (d.amount - d.paidAmount), 0);

  return NextResponse.json({
    products: filtered,
    pagination: {
      page,
      limit,
      total: productTotal,
      totalPages: Math.ceil(productTotal / limit),
    },
    summary: {
      totalProducts,
      totalStockValue,
      criticalCount,
      lowCount,
      excessCount,
      normalCount,
      todayRevenue: todayOnlineRevenue + todayPOSRevenue,
      todayOnlineRevenue,
      todayPOSRevenue,
      todayOrderCount: todayOrders.length,
      debtsOwedToUs,
      debtsWeOwe,
    },
  });
}
