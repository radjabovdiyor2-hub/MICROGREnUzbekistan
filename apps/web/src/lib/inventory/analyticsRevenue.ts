import { prisma } from '@repo/database';
import { loadSalesLedger, startOfLocalDay, daysAgo } from '@/lib/revenue/salesLedger';
import { summarize, dailySeries, demandByProduct } from '@/lib/revenue/summary';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
//
// ⚠️ Считать здесь больше нечего — вся арифметика живёт в lib/revenue.
// Раньше этот файл был пятым независимым определением выручки, и именно он
// давал «1 200 000» на «Сводке» при разбивке 0 + 600 000 + 50 000: каждый
// онлайн-заказ считался и как заказ, и как своё складское движение.

/** Выручка, себестоимость, прибыль и возвраты по периодам. */
export async function loadRevenue(searchParams: URLSearchParams) {
  const periodParam = searchParams.get('period') || 'week';
  const days = periodParam === 'month' ? 30 : 7;

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const weekStart = daysAgo(7, now);
  const monthStart = daysAgo(30, now);

  // Один проход по базе на все периоды — они режутся уже в памяти.
  // Статусы считаются отдельным COUNT: незакрытый заказ может быть и старше
  // месяца, а «Сводка» брала их из первых 20 заказов и потому врала.
  const [ledger, pendingOrders, deliveringOrders, activeProducts] = await Promise.all([
    loadSalesLedger(monthStart),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.order.count({ where: { status: 'DELIVERING' } }),
    prisma.product.count({ where: { isActive: true } }),
  ]);

  const today = summarize(ledger, todayStart);
  const week = summarize(ledger, weekStart);
  const month = summarize(ledger, monthStart);

  const byProduct = demandByProduct(ledger, monthStart);
  const productArr = Array.from(byProduct.values()).map((p) => ({
    name: p.name,
    revenue: p.revenue,
    cost: p.cost,
    sold: p.sold,
    profit: p.revenue - p.cost,
    margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
  }));

  const topProfitable = [...productArr].sort((a, b) => b.profit - a.profit).slice(0, 8);
  const topLoss = [...productArr].sort((a, b) => a.margin - b.margin).slice(0, 8);

  return {
    todayRevenue: today.revenue,
    todayCost: today.cost,
    todayProfit: today.profit,
    todayMargin: today.margin,
    todaySales: today.orders + today.posSales,
    todayReturns: today.returns,
    todayReturnCount: today.returnCount,

    // Разбивка сегодняшнего дня. Отдаётся отсюда же, чтобы плитка и разбивка
    // на «Сводке» брались из одного расчёта и не могли разойтись: раньше их
    // считали четыре разных эндпоинта с разными границами суток.
    todayGoodsOnline: today.goodsOnline,
    todayGoodsPos: today.goodsPos,
    todayDelivery: today.delivery,
    todayDiscount: today.discount,
    todayOrders: today.orders,
    todayPosSales: today.posSales,
    todayUnits: today.units,
    todayAverageCheck: today.averageCheck,

    weekRevenue: week.revenue,
    weekCost: week.cost,
    weekProfit: week.profit,
    weekReturns: week.returns,

    monthRevenue: month.revenue,
    monthCost: month.cost,
    monthProfit: month.profit,
    monthMargin: month.margin,
    monthReturns: month.returns,
    monthOrders: month.orders,
    monthGoodsOnline: month.goodsOnline,

    pendingOrders,
    deliveringOrders,
    activeProducts,

    dailyData: dailySeries(ledger, days, now),
    topProfitable,
    topLoss,
  };
}
