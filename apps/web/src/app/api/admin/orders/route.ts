import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma, OrderStatus } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';

// ==========================================
// Admin — recent orders (storefront bot admin panel: apps/bot admin.py).
// ==========================================
export async function GET(request: NextRequest) {
  if (!requireBotAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);
  const status = searchParams.get('status');

  const where: Prisma.OrderWhereInput =
    status && status !== 'ALL' && status in OrderStatus
      ? { status: OrderStatus[status as keyof typeof OrderStatus] }
      : {};

  const orders = await prisma.order.findMany({
    where,
    include: {
      items: { include: { product: { select: { nameUz: true } } } },
      user: { select: { firstName: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ orders });
}
