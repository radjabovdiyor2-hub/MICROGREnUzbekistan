import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { processSale } from '@/lib/pos/sale';
import { processRefund } from '@/lib/pos/refund';
import { publish } from '@/lib/realtime/bus';
import {
  POS_SALE_WHERE,
  byBusinessDate,
  localDayRange,
  formatLocalDate,
} from '@/lib/revenue/salesLedger';
import { LIST_LIMIT } from '@/lib/api/listLimit';
import { soldProductName } from '@/lib/products/sold';

// ==========================================
// POS (Point of Sale) — Quick Store Sales
//
// Продажа и возврат живут в lib/pos: в route.ts Next.js разрешает
// экспортировать только HTTP-обработчики.
// ==========================================

// ══════════════════════════════════════════════════════════════════════
// ШАПКА ЧЕКА В ОТВЕТЕ — ради вопроса «кто и кому продал».
//
// История продаж показывала номер, время, позиции и сумму. Ни покупателя,
// ни продавца в ней не было НИ РАЗУ, хотя обе величины лежат в `pos_sales`
// с самого появления таблицы: чек знает и `customerId`, и `performedBy`.
// Пока продавец один, это незаметно; со вторым «чей это чек» становится
// вопросом без ответа, а «кому мы продали в среду» — без ответа вовсе.
//
// Берём из связи, а не из `movement.performedBy`: у движения тоже есть
// такое поле, но чек — это шапка, и способ оплаты, скидка и место продажи
// живут только в ней. `performedBy` движения остаётся ЗАПАСНЫМ путём для
// строк, записанных до появления `pos_sales`.
// ══════════════════════════════════════════════════════════════════════

const SALE_HEAD = {
  number: true,
  performedBy: true,
  role: true,
  paymentMethod: true,
  origin: true,
  discount: true,
  discountReason: true,
  backdated: true,
  backdateReason: true,
  reason: true,
  customer: { select: { id: true, name: true, companyName: true } },
  refundOf: { select: { number: true } },
} as const;

type SaleHead = {
  number: string;
  performedBy: string;
  role: string | null;
  paymentMethod: string;
  origin: string;
  discount: number;
  discountReason: string | null;
  backdated: boolean;
  backdateReason: string | null;
  reason: string | null;
  customer: { id: number; name: string | null; companyName: string | null } | null;
  refundOf: { number: string } | null;
};

/** Как показать покупателя: заведение важнее контактного лица. */
function customerLabel(customer: SaleHead['customer']): string | null {
  if (!customer) return null;
  return customer.companyName || customer.name || null;
}

/**
 * Шапка чека для ответа. `null` у движения без связи — чек записан до
 * появления таблицы: тогда о продавце знает только само движение.
 */
function headOf(head: SaleHead | null, performedBy: string | null) {
  return {
    customerId: head?.customer?.id ?? null,
    customerName: customerLabel(head?.customer ?? null),
    performedBy: head?.performedBy ?? performedBy ?? null,
    role: head?.role ?? null,
    paymentMethod: head?.paymentMethod ?? null,
    origin: head?.origin ?? null,
    discount: head?.discount ?? 0,
    discountReason: head?.discountReason ?? null,
    backdated: head?.backdated ?? false,
    backdateReason: head?.backdateReason ?? null,
    reason: head?.reason ?? null,
    refundOf: head?.refundOf?.number ?? null,
  };
}

/**
 * Позиция чека для экрана: снимок названия и ФАКТИЧЕСКАЯ цена продажи.
 *
 * Две поправки к прежнему ответу, и обе про правду:
 *
 *   · название — через `soldProductName`. Товар мог быть удалён из
 *     каталога, `product` тогда пустой, и обращение к `product.nameUz`
 *     роняло экран истории на первом же таком чеке;
 *   · цена — `salePrice`, а не сегодняшняя цена прайса. Позиции считались
 *     по `product.price`, поэтому строки чека со скидкой или с договорной
 *     ценой не сходились с его же итогом, посчитанным по `salePrice`.
 */
function lineOf(m: {
  quantity: unknown;
  salePrice: number | null;
  productName: string | null;
  product: { nameUz: string; nameRu: string; price: number } | null;
}) {
  return {
    quantity: Number(m.quantity),
    product: {
      nameUz: soldProductName(m),
      price: m.salePrice ?? m.product?.price ?? 0,
    },
  };
}

// POST — Process a store sale (multiple items at once)
export async function POST(request: NextRequest) {
  try {
    const res = await processSale(request);
    // Продажа меняет и остаток, и выручку дня — обе темы разом.
    if (res.ok) publish('inventory', 'products', 'orders');
    return res;
  } catch (error) {
    console.error('POS sale error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// PUT — Process a product return
export async function PUT(request: NextRequest) {
  try {
    const res = await processRefund(request);
    if (res.ok) publish('inventory', 'products', 'orders');
    return res;
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
    ...POS_SALE_WHERE,
    ...byBusinessDate({ gte: startOfDay, lt: endOfDay }),
  };

  if (seller) {
    where.performedBy = seller;
  }

  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      product: { select: { nameUz: true, nameRu: true, price: true, unit: true } },
      sale: { select: SALE_HEAD },
    },
    orderBy: { soldAt: 'desc' },
    take: LIST_LIMIT,
  });

  // Get returns for same period
  const returnWhere: Record<string, unknown> = {
    type: 'IN',
    reason: { startsWith: 'Qaytarish' },
    ...byBusinessDate({ gte: startOfDay, lt: endOfDay }),
  };
  if (seller) {
    returnWhere.performedBy = seller;
  }

  const returnMovements = await prisma.stockMovement.findMany({
    where: returnWhere,
    include: {
      product: { select: { nameUz: true, nameRu: true, price: true, unit: true } },
      sale: { select: SALE_HEAD },
    },
    orderBy: { soldAt: 'desc' },
    take: LIST_LIMIT,
  });

  // Group sales by sale number
  type Grouped = {
    items: typeof movements;
    total: number;
    time: string;
  } & ReturnType<typeof headOf>;

  const salesMap = new Map<string, Grouped>();

  for (const m of movements) {
    // Номер чека теперь колонка. Разбор регулярками оставлен запасным путём
    // ради строк, записанных до появления колонки, — у них она пустая.
    const match = m.reason?.match(/\(S-[A-Z0-9-]+\)/);
    const saleNum = m.sale?.number ?? (match ? match[0].replace(/[()]/g, '') : 'unknown');

    if (!salesMap.has(saleNum)) {
      salesMap.set(saleNum, {
        items: [],
        total: 0,
        time: (m.soldAt ?? m.createdAt).toISOString(),
        ...headOf(m.sale, m.performedBy),
      });
    }
    const sale = salesMap.get(saleNum)!;
    sale.items.push(m);
    sale.total += Math.round(Math.abs(m.quantity) * (m.salePrice || m.product?.price || 0));
  }

  // Group returns by return number
  type GroupedReturn = {
    items: typeof returnMovements;
    total: number;
    time: string;
  } & ReturnType<typeof headOf>;

  const returnsMap = new Map<string, GroupedReturn>();
  for (const m of returnMovements) {
    const match = m.reason?.match(/\(R-[A-Z0-9-]+\)/);
    const retNum = m.sale?.number ?? (match ? match[0].replace(/[()]/g, '') : 'unknown');

    if (!returnsMap.has(retNum)) {
      returnsMap.set(retNum, {
        items: [],
        total: 0,
        time: (m.soldAt ?? m.createdAt).toISOString(),
        ...headOf(m.sale, m.performedBy),
      });
    }
    const ret = returnsMap.get(retNum)!;
    ret.items.push(m);
    ret.total += Math.round(Math.abs(m.quantity) * (m.salePrice || m.product?.price || 0));
  }

  const sales = Array.from(salesMap.entries()).map(([number, data]) => ({
    number, ...data, items: data.items.map(lineOf), itemCount: data.items.length,
    type: 'sale' as const,
  }));

  const returns = Array.from(returnsMap.entries()).map(([number, data]) => ({
    number, ...data, items: data.items.map(lineOf), itemCount: data.items.length,
    type: 'return' as const,
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
