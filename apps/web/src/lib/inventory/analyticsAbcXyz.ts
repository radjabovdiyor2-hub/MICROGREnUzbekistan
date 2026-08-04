import { prisma } from '@repo/database';
import { loadSalesLedger } from '@/lib/revenue/salesLedger';
import { demandByProduct } from '@/lib/revenue/summary';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// Спрос считается по общему реестру продаж (lib/revenue), а не своим запросом.

/** ABC-XYZ: вклад в выручку против стабильности спроса. */
export async function loadAbcXyz() {
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

  // Один проход по базе на все три месяца. Раньше здесь складывались позиции
  // заказов И все движения OUT — онлайн-продажа считалась дважды, и товар
  // попадал в класс A по удвоенной выручке.
  const ledger = await loadSalesLedger(monthRanges[0].start, monthRanges[2].end);
  for (let mi = 0; mi < 3; mi++) {
    const { start, end } = monthRanges[mi];
    for (const [productId, stats] of demandByProduct(ledger, start, end)) {
      const arr = allMonthlyData.get(productId);
      if (arr) arr[mi] += stats.sold;
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

  return { products: classified, classSummary, totalRevenue: totalRev };
}
