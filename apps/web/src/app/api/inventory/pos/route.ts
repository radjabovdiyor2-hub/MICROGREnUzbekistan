import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { processSale } from '@/lib/pos/sale';
import { processRefund } from '@/lib/pos/refund';
import { localDayRange, formatLocalDate } from '@/lib/revenue/salesLedger';

// ==========================================
// POS (Point of Sale) — Quick Store Sales
//
// Продажа и возврат живут в lib/pos: в route.ts Next.js разрешает
// экспортировать только HTTP-обработчики.
// ==========================================

// POST — Process a store sale (multiple items at once)
export async function POST(request: NextRequest) {
  try {
    return await processSale(request);
  } catch (error) {
    console.error('POS sale error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// PUT — Process a product return
export async function PUT(request: NextRequest) {
  try {
    return await processRefund(request);
  } catch (error) {
    console.error('POS return error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seller = searchParams.get('seller');
  const dateParam = searchParams.get('date');
  // Одна граница суток на все отчёты — та же, что у сводки и аналитики.
  const { start: startOfDay, end: endOfDay } = localDayRange(dateParam || undefined);
  const date = dateParam || formatLocalDate(startOfDay);

  // Продажа опознаётся так же, как в lib/revenue/salesLedger: движение OUT
  // без заказа и с ценой продажи. Раньше фильтр стоял по началу строки
  // `reason` («Do'kon sotish»), и продажи в долг («Qarzga sotish») в отчёт
  // смены не попадали вовсе — при том, что в выручку они входили.
  //
  // Дата — деловая (`soldAt`): продажа, занесённая сегодня за вчера, должна
  // лечь во вчерашнюю смену.
  const where: Record<string, unknown> = {
    type: 'OUT',
    orderId: null,
    salePrice: { not: null },
    soldAt: { gte: startOfDay, lt: endOfDay },
  };

  if (seller) {
    where.performedBy = seller;
  }

  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      product: { select: { nameUz: true, nameRu: true, price: true, unit: true } },
      sale: { select: { number: true } },
    },
    orderBy: { soldAt: 'desc' },
  });

  // Get returns for same period
  const returnWhere: Record<string, unknown> = {
    type: 'IN',
    reason: { startsWith: 'Qaytarish' },
    soldAt: { gte: startOfDay, lt: endOfDay },
  };
  if (seller) {
    returnWhere.performedBy = seller;
  }

  const returnMovements = await prisma.stockMovement.findMany({
    where: returnWhere,
    include: {
      product: { select: { nameUz: true, nameRu: true, price: true, unit: true } },
      sale: { select: { number: true } },
    },
    orderBy: { soldAt: 'desc' },
  });

  // Group sales by sale number
  const salesMap = new Map<string, { items: typeof movements; total: number; time: string }>();

  for (const m of movements) {
    // Номер чека теперь колонка. Разбор регулярками оставлен запасным путём
    // ради строк, записанных до появления колонки, — у них она пустая.
    const match = m.reason?.match(/\(S-[A-Z0-9-]+\)/);
    const saleNum = m.sale?.number ?? (match ? match[0].replace(/[()]/g, '') : 'unknown');

    if (!salesMap.has(saleNum)) {
      salesMap.set(saleNum, { items: [], total: 0, time: m.soldAt.toISOString() });
    }
    const sale = salesMap.get(saleNum)!;
    sale.items.push(m);
    sale.total += Math.round(Math.abs(m.quantity) * (m.salePrice || m.product.price));
  }

  // Group returns by return number
  const returnsMap = new Map<string, { items: typeof returnMovements; total: number; time: string }>();
  for (const m of returnMovements) {
    const match = m.reason?.match(/\(R-[A-Z0-9-]+\)/);
    const retNum = m.sale?.number ?? (match ? match[0].replace(/[()]/g, '') : 'unknown');

    if (!returnsMap.has(retNum)) {
      returnsMap.set(retNum, { items: [], total: 0, time: m.soldAt.toISOString() });
    }
    const ret = returnsMap.get(retNum)!;
    ret.items.push(m);
    ret.total += Math.round(Math.abs(m.quantity) * (m.salePrice || m.product.price));
  }

  const sales = Array.from(salesMap.entries()).map(([number, data]) => ({
    number, ...data, itemCount: data.items.length, type: 'sale' as const,
  }));

  const returns = Array.from(returnsMap.entries()).map(([number, data]) => ({
    number, ...data, itemCount: data.items.length, type: 'return' as const,
  }));

  const grossRevenue = sales.reduce((s, sale) => s + sale.total, 0);
  const totalReturns = returns.reduce((s, ret) => s + ret.total, 0);
  const totalRevenue = grossRevenue - totalReturns;
  const totalItems = movements.length;

  return NextResponse.json({
    date,
    seller: seller || 'Barchasi',
    sales,
    returns,
    summary: {
      totalSales: sales.length,
      totalReturns: returns.length,
      totalItems,
      grossRevenue,
      totalReturnAmount: totalReturns,
      totalRevenue, // net revenue (after returns)
    },
  });
}
