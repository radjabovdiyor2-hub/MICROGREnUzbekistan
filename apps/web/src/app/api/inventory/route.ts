import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getNumber } from '@/lib/settings/store';
import { loadSalesLedger, startOfLocalDay } from '@/lib/revenue/salesLedger';
import { demandByProduct, summarize } from '@/lib/revenue/summary';

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

  // Спрос — из общего реестра продаж (lib/revenue). Раньше здесь складывались
  // позиции заказов И движения OUT с фильтром `reason: { not: null }`, который
  // (вопреки комментарию «POS sales») ловил и движения онлайн-заказов. Спрос
  // выходил вдвое больше реального, а вместе с ним — точка перезаказа,
  // «дней запаса» и статус CRITICAL/LOW/EXCESS.
  const ledger = await loadSalesLedger(ninetyDaysAgo);
  const demand = demandByProduct(ledger, ninetyDaysAgo);

  const salesByProduct = new Map<string, number>();
  for (const [productId, stats] of demand) {
    salesByProduct.set(productId, stats.sold);
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

  // Выручка за сегодня — из того же реестра, что и «Сводка» с «Доходом».
  // Раньше это было третье независимое определение: POS считался по префиксу
  // «Do'kon sotish» (продажи в долг мимо), по СЕГОДНЯШНЕМУ прайсу вместо цены
  // продажи, и день резался по другой границе.
  const today = startOfLocalDay();
  const todaySummary = summarize(await loadSalesLedger(today), today);
  const todayOnlineRevenue = todaySummary.goodsOnline + todaySummary.delivery - todaySummary.discount;
  const todayPOSRevenue = todaySummary.goodsPos;

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
      todayRevenue: todaySummary.revenue,
      todayOnlineRevenue,
      todayPOSRevenue,
      todayOrderCount: todaySummary.orders,
      debtsOwedToUs,
      debtsWeOwe,
    },
  });
}
